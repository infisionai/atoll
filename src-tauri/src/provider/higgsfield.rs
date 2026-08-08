//! Higgsfield provider — layers only catalog and presets on top of the shared connection (connection.rs).
//! Flow and endpoints were ported from a previously validated prototype.

use super::connection::{McpConnection, ProviderConfig};
use serde_json::Value;
use std::path::PathBuf;

pub const PROVIDER_ID: &str = "higgsfield";

const CONFIG: ProviderConfig = ProviderConfig {
    id: PROVIDER_ID,
    name: "Higgsfield",
    mcp_url: "https://mcp.higgsfield.ai/mcp",
    discovery_url: "https://mcp.higgsfield.ai/.well-known/oauth-authorization-server",
    scope: "openid email offline_access",
    balance_tool: "balance",
    pricing_url: "https://higgsfield.ai/pricing",
};

/// UUID shape check (8-4-4-4-12 hex) — for identifying Higgsfield job ids
fn is_uuid_like(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    parts.len() == 5
        && [8, 4, 4, 4, 12]
            == [
                parts[0].len(),
                parts[1].len(),
                parts[2].len(),
                parts[3].len(),
                parts[4].len(),
            ]
        && parts
            .iter()
            .all(|p| p.chars().all(|c| c.is_ascii_hexdigit()))
}

pub struct Higgsfield {
    pub conn: McpConnection,
}

impl Higgsfield {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            conn: McpConnection::new(CONFIG, app_data_dir),
        }
    }

    /// Generation submit tool — per kind (image → generate_image)
    pub fn submit_tool(kind: &str) -> String {
        format!("generate_{kind}")
    }

    /// Normalize cross-provider references — when medias.value is not a Higgsfield job UUID
    /// (a result from another provider), replace it with the enriched remote url. The server
    /// accepts "a UUID or an https URL" (verified against the live server).
    /// The auxiliary url field is outside the server schema, so it is removed
    pub fn normalize_params(params: &Value) -> Value {
        let mut params = params.clone();
        if let Some(medias) = params.get_mut("medias").and_then(|v| v.as_array_mut()) {
            for m in medias {
                let url = m.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
                let value_is_uuid = m
                    .get("value")
                    .and_then(|v| v.as_str())
                    .is_some_and(is_uuid_like);
                if !value_is_uuid {
                    if let Some(u) = url {
                        m["value"] = Value::String(u);
                    }
                }
                if let Some(obj) = m.as_object_mut() {
                    obj.remove("url");
                    obj.remove("provider");
                }
            }
        }
        params
    }

    /// Import another provider's result URL as Higgsfield media — media_import_url
    /// (per the server's recovery guidance, verified against the live server).
    /// The returned media_id is used as medias.value
    pub async fn import_media_url(&self, url: &str, media_type: &str) -> Result<String, String> {
        let payload = self
            .conn
            .tool_call(
                "media_import_url",
                serde_json::json!({ "type": media_type, "url": url }),
            )
            .await?;
        for key in ["media_id", "mediaId", "id"] {
            if let Some(id) = payload.get(key).and_then(|v| v.as_str()) {
                return Ok(id.to_string());
            }
            // One level of nesting (e.g. {"media": {"id": ...}})
            if let Some(obj) = payload.as_object() {
                for inner in obj.values() {
                    if let Some(id) = inner.get(key).and_then(|v| v.as_str()) {
                        return Ok(id.to_string());
                    }
                }
            }
        }
        Err(format!(
            "No media id found in the media_import_url response: {payload}"
        ))
    }

    /// Pre-resolve cross-provider media — references that aren't own UUIDs go through import to become media_ids
    pub async fn resolve_cross_media(&self, params: &mut Value) -> Result<(), String> {
        let Some(medias) = params.get_mut("medias").and_then(|v| v.as_array_mut()) else {
            return Ok(());
        };
        for m in medias {
            let value_is_uuid = m
                .get("value")
                .and_then(|v| v.as_str())
                .is_some_and(is_uuid_like);
            let url = m.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
            if !value_is_uuid {
                if let Some(u) = url {
                    let role = m
                        .get("role")
                        .and_then(|r| r.as_str())
                        .unwrap_or("image")
                        .to_string();
                    let media_id = self.import_media_url(&u, &role).await?;
                    m["value"] = Value::String(media_id);
                }
            }
            if let Some(obj) = m.as_object_mut() {
                obj.remove("url");
            }
        }
        Ok(())
    }

    /// Job status query tool and arguments
    pub fn status_call(job_id: &str) -> (&'static str, Value) {
        (
            "job_status",
            serde_json::json!({ "jobId": job_id, "sync": true }),
        )
    }

    fn catalog_path(&self) -> PathBuf {
        self.conn
            .app_data_dir()
            .join("catalog")
            .join("higgsfield.json")
    }

    /// Cached catalog (None if absent)
    pub fn cached_catalog(&self) -> Option<Value> {
        let text = std::fs::read_to_string(self.catalog_path()).ok()?;
        serde_json::from_str(&text).ok()
    }

    /// Model catalog — collects everything via models_explore(list) pagination, then caches to a file.
    /// (Read-only tool calls — no credits consumed)
    pub async fn fetch_catalog(&self) -> Result<Value, String> {
        let mut models: Vec<Value> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut after: Option<String> = None;

        for _ in 0..10 {
            let mut args = serde_json::json!({ "action": "list", "limit": 100 });
            if let Some(a) = &after {
                args["after"] = serde_json::json!(a);
            }
            let payload = self.conn.tool_call("models_explore", args).await?;

            let items = payload
                .get("items")
                .or_else(|| payload.get("models"))
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let has_more = payload
                .get("has_more")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let token = payload
                .get("next_page_token")
                .or_else(|| payload.get("next_cursor"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let mut added = 0;
            let mut last_id: Option<String> = None;
            for m in items {
                if let Some(id) = m.get("id").and_then(|v| v.as_str()) {
                    if seen.insert(id.to_string()) {
                        last_id = Some(id.to_string());
                        models.push(m);
                        added += 1;
                    }
                }
            }
            if !has_more || added == 0 {
                break;
            }
            after = token.or(last_id);
        }

        let catalog = Value::Array(models);
        let path = self.catalog_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&path, serde_json::to_string(&catalog).unwrap_or_default());
        Ok(catalog)
    }

    fn presets_path(&self) -> PathBuf {
        self.conn
            .app_data_dir()
            .join("catalog")
            .join("higgsfield_presets.json")
    }

    /// Video presets (presets_show) — same file cache policy as the catalog (read-only — no credits)
    pub async fn presets(&self, refresh: bool) -> Result<Value, String> {
        let cached = || -> Option<Value> {
            let text = std::fs::read_to_string(self.presets_path()).ok()?;
            serde_json::from_str(&text).ok()
        };
        if !refresh {
            if let Some(v) = cached() {
                return Ok(v);
            }
        }
        match self
            .conn
            .tool_call("presets_show", serde_json::json!({}))
            .await
        {
            Ok(payload) => {
                let path = self.presets_path();
                if let Some(parent) = path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::write(&path, serde_json::to_string(&payload).unwrap_or_default());
                Ok(payload)
            }
            Err(e) => cached().ok_or(e),
        }
    }

    /// Catalog — cache-first; hits the server on refresh or when there is no cache
    pub async fn catalog(&self, refresh: bool) -> Result<Value, String> {
        if !refresh {
            if let Some(cached) = self.cached_catalog() {
                return Ok(cached);
            }
        }
        match self.fetch_catalog().await {
            Ok(v) => Ok(v),
            // On server failure, fall back to the cache at least
            Err(e) => self.cached_catalog().ok_or(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn cross_provider_media_becomes_url() {
        // Magnific result (short id) → Higgsfield input: replaced with the url, auxiliary url field removed
        let params = json!({
            "model": "nano_banana_pro", "prompt": "p",
            "medias": [{ "value": "4RNtpok9Aa", "role": "image", "url": "https://cdn/x.png" }]
        });
        let n = Higgsfield::normalize_params(&params);
        assert_eq!(n["medias"][0]["value"], "https://cdn/x.png");
        assert!(n["medias"][0].get("url").is_none());
    }

    #[test]
    fn own_uuid_media_is_kept() {
        // Higgsfield's own job UUID stays as-is (preserves existing behavior)
        let params = json!({
            "medias": [{ "value": "fa685029-9201-4592-a152-e9a1c05ae0d4", "role": "image", "url": "https://cdn/y.png" }]
        });
        let n = Higgsfield::normalize_params(&params);
        assert_eq!(
            n["medias"][0]["value"],
            "fa685029-9201-4592-a152-e9a1c05ae0d4"
        );
        assert!(n["medias"][0].get("url").is_none());
    }

    #[test]
    fn uuid_like_detection() {
        assert!(is_uuid_like("fa685029-9201-4592-a152-e9a1c05ae0d4"));
        assert!(!is_uuid_like("4RNtpok9Aa"));
        assert!(!is_uuid_like("https://cdn/x.png"));
    }
}
