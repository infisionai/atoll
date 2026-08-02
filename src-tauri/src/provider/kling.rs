//! Kling provider — kling.ai MCP (verified against the live server, 2026-08-01).
//!
//! - Resource: https://kling.ai/mcp (Spring MCP Resource Server)
//! - Auth: https://kling.ai/auth — supports DCR (/register), PKCE S256, refresh_token
//! - Scopes: generation.create · generation.read · account.credit.read
//!
//! Wires up catalog/account queries and the shared generation envelope. Inputs that need
//! file upload will be added later, after the upload URL flow is validated.

use super::connection::{McpConnection, ProviderConfig};
use super::kling_catalog;
use rand::RngCore;
use serde_json::{Map, Value};
use std::path::PathBuf;
use tokio::sync::Mutex;

pub const PROVIDER_ID: &str = "kling";

const CONFIG: ProviderConfig = ProviderConfig {
    id: PROVIDER_ID,
    name: "Kling",
    mcp_url: "https://kling.ai/mcp",
    discovery_url: "https://kling.ai/.well-known/oauth-authorization-server/auth",
    scope: "generation.create generation.read account.credit.read",
    balance_tool: "query_membership_and_credits",
    pricing_url: "https://kling.ai",
};

pub struct Kling {
    pub conn: McpConnection,
    catalog_checked: Mutex<bool>,
}

impl Kling {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            conn: McpConnection::new(CONFIG, app_data_dir),
            catalog_checked: Mutex::new(false),
        }
    }

    fn catalog_path(&self) -> PathBuf {
        self.conn.app_data_dir().join("catalog").join("kling.json")
    }

    fn read_cache(&self) -> Option<Value> {
        let text = std::fs::read_to_string(self.catalog_path()).ok()?;
        let value: Value = serde_json::from_str(&text).ok()?;
        if value.is_array() {
            Some(value)
        } else {
            value.get("models").filter(|v| v.is_array()).cloned()
        }
    }

    fn write_cache(&self, models: &Value) {
        let path = self.catalog_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let envelope = serde_json::json!({
            "schemaVersion": 1,
            "updatedAt": now_s(),
            "models": models,
        });
        let _ = std::fs::write(path, envelope.to_string());
    }

    /// When the connection session/account changes, the next catalog request re-queries who_am_i.
    pub async fn invalidate_catalog(&self) {
        *self.catalog_checked.lock().await = false;
        let _ = std::fs::remove_file(self.catalog_path());
    }

    /// The catalog is fetched live on the first request of the app session and cached afterwards.
    pub async fn catalog(&self, refresh: bool) -> Result<Value, String> {
        let checked = *self.catalog_checked.lock().await;
        if !refresh && checked {
            if let Some(cached) = self.read_cache() {
                return Ok(cached);
            }
        }

        match self.conn.tool_call("who_am_i", serde_json::json!({})).await {
            Ok(payload) => match kling_catalog::catalog_from_payload(&payload) {
                Ok(models) => {
                    self.write_cache(&models);
                    *self.catalog_checked.lock().await = true;
                    Ok(models)
                }
                Err(error) => {
                    if let Some(cached) = self.read_cache() {
                        log::warn!("Kling catalog normalization failed — using cache: {error}");
                        *self.catalog_checked.lock().await = true;
                        Ok(cached)
                    } else {
                        Err(error)
                    }
                }
            },
            Err(error) => {
                if let Some(cached) = self.read_cache() {
                    log::warn!("Kling catalog fetch failed — using cache: {error}");
                    *self.catalog_checked.lock().await = true;
                    Ok(cached)
                } else {
                    Err(error)
                }
            }
        }
    }

    /// Kling's membership response uses field names different from the typical provider's
    /// `credits`, so read it with a dedicated parser and cache it in the shared status.
    pub async fn refresh_balance(&self) -> Result<f64, String> {
        let payload = self
            .conn
            .tool_call("query_membership_and_credits", serde_json::json!({}))
            .await?;
        let credits = kling_catalog::extract_credits(&payload)
            .ok_or_else(|| format!("No credits found in the Kling balance response: {payload}"))?;
        self.conn.cache_balance(credits).await;
        Ok(credits)
    }

    /// Builds Kling's shared generation envelope. The actual billable call happens when
    /// commands sends this result via `tool_call`; this function itself hits no network.
    pub fn submit_call(kind: &str, params: &Value) -> Result<(&'static str, Value), String> {
        let model = params
            .get("model")
            .and_then(Value::as_str)
            .ok_or("No Kling model selected")?;
        let model_ref = kling_catalog::parse_model_ref(model)?;
        let medias = params
            .get("medias")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let has_media = !medias.is_empty();
        let (expected_kind, tool) = match (kind, has_media) {
            ("image", false) => (kling_catalog::KlingTool::TextToImage, "text_to_image"),
            ("image", true) => (kling_catalog::KlingTool::ImageToImage, "image_to_image"),
            ("video", false) => (kling_catalog::KlingTool::TextToVideo, "text_to_video"),
            ("video", true) => (kling_catalog::KlingTool::ImageToVideo, "image_to_video"),
            _ => return Err(format!("Generation kind not supported by Kling: {kind}")),
        };
        if model_ref.tool != expected_kind {
            return Err(format!(
                "Kling model mode does not match the inputs: {} → {}",
                model, tool
            ));
        }

        let mut arguments = Vec::new();
        let object = params
            .as_object()
            .ok_or("Kling generation parameters are not an object")?;
        for (name, value) in object {
            if matches!(name.as_str(), "model" | "medias") || name.starts_with("__") {
                continue;
            }
            arguments.push(serde_json::json!({
                "name": name,
                "value": scalar_value(value),
            }));
        }

        let mut envelope = Map::new();
        envelope.insert("model".into(), Value::String(model_ref.canonical_model));
        envelope.insert("arguments".into(), Value::Array(arguments));
        if has_media {
            envelope.insert("inputs".into(), Value::Array(media_inputs(&medias)?));
        }
        envelope.insert(
            "rationale".into(),
            Value::String(format!("Atoll {} generation request", tool)),
        );
        envelope.insert("taskTraceId".into(), Value::String(uuid_v7()));
        Ok((tool, Value::Object(envelope)))
    }

    pub fn estimate_call(_kind: &str, _params: &Value) -> Result<(&'static str, Value), String> {
        Err("estimate-unsupported: Kling MCP does not provide a pre-run estimate tool".into())
    }

    /// Status query — once a generation_id exists, poll via query_tasks.
    pub fn status_call(job_id: &str) -> (&'static str, Value) {
        ("query_tasks", serde_json::json!({ "generationId": job_id }))
    }
}

fn now_s() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

fn scalar_value(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        Value::Null => String::new(),
        _ => value.to_string(),
    }
}

fn media_inputs(medias: &[Value]) -> Result<Vec<Value>, String> {
    let mut inputs = Vec::with_capacity(medias.len());
    let mut reference_index = 0_u64;
    for media in medias {
        let url = media
            .get("url")
            .and_then(Value::as_str)
            .filter(|url| url.starts_with("https://"))
            .ok_or("Kling image inputs require an uploaded HTTPS URL")?;
        let role = media.get("role").and_then(Value::as_str).unwrap_or("image");
        let name = match role {
            "first_image" => "first_image".to_string(),
            "tail_image" | "end_image" => "tail_image".to_string(),
            _ => {
                reference_index += 1;
                format!("image_{reference_index}")
            }
        };
        inputs.push(serde_json::json!({
            "inputType": "URL",
            "name": name,
            "url": url,
        }));
    }
    Ok(inputs)
}

/// Builds a UUID v7-formatted value (taskTraceId) without adding a dependency.
fn uuid_v7() -> String {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default();
    let mut bytes = [0_u8; 16];
    for (index, byte) in bytes[..6].iter_mut().enumerate() {
        *byte = (timestamp >> (40 - index * 8)) as u8;
    }
    rand::thread_rng().fill_bytes(&mut bytes[6..]);
    bytes[6] = (bytes[6] & 0x0f) | 0x70;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_text_to_image_envelope() {
        let (tool, payload) = Kling::submit_call(
            "image",
            &serde_json::json!({
                "model": "kling/text_to_image/gemini-3.1-flash-image",
                "prompt": "butterfly",
                "img_resolution": "2k",
                "imageCount": 1
            }),
        )
        .unwrap();
        assert_eq!(tool, "text_to_image");
        assert_eq!(payload["model"], "gemini-3.1-flash-image");
        assert_eq!(payload["arguments"][0]["value"], "1");
        assert!(payload["arguments"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item["value"].is_string()));
        assert!(payload["taskTraceId"].as_str().unwrap().contains('-'));
    }

    #[test]
    fn maps_reference_media_to_image_inputs() {
        let (_, payload) = Kling::submit_call(
            "image",
            &serde_json::json!({
                "model": "kling/image_to_image/gemini-3.1-flash-image",
                "prompt": "edit",
                "medias": [{"role": "image", "url": "https://cdn.example/a.png"}]
            }),
        )
        .unwrap();
        assert_eq!(payload["inputs"][0]["name"], "image_1");
    }
}
