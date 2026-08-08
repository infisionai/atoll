//! Magnific provider — an aggregator on top of the shared connection (connection.rs).
//! Endpoints and tool names per docs.magnific.com/modelcontextprotocol (checked 2026-08-01).
//! Catalog and generation argument shapes were confirmed by measuring against the live server.

use super::connection::{McpConnection, ProviderConfig};
use serde_json::{json, Value};
use std::path::PathBuf;

pub const PROVIDER_ID: &str = "magnific";

const CONFIG: ProviderConfig = ProviderConfig {
    id: PROVIDER_ID,
    name: "Magnific",
    mcp_url: "https://mcp.magnific.com",
    discovery_url: "https://mcp.magnific.com/.well-known/oauth-authorization-server",
    scope: "openid email offline_access",
    balance_tool: "account_balance",
    pricing_url: "https://www.magnific.com/pricing",
};

pub struct Magnific {
    pub conn: McpConnection,
}

/// Batch count from the form value — sliders send numbers, segments send numeric strings
fn numeric_count(v: Option<&Value>) -> Option<u64> {
    match v? {
        Value::Number(n) => n.as_u64().or_else(|| n.as_f64().map(|f| f as u64)),
        Value::String(s) => s.parse::<u64>().ok(),
        _ => None,
    }
}

/// Extract a Magnific creation identifier from the response shapes returned by the upload tool.
fn parse_creation_identifier(payload: &Value) -> Option<String> {
    const KEYS: [&str; 6] = [
        "creationIdentifier",
        "creation_identifier",
        "creationId",
        "creation_id",
        "identifier",
        "id",
    ];

    for key in KEYS {
        if let Some(identifier) = payload.get(key).and_then(Value::as_str) {
            return Some(identifier.to_string());
        }
    }

    if let Some(object) = payload.as_object() {
        for nested in object.values() {
            for key in KEYS {
                if let Some(identifier) = nested.get(key).and_then(Value::as_str) {
                    return Some(identifier.to_string());
                }
            }
        }
    }

    None
}

impl Magnific {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            conn: McpConnection::new(CONFIG, app_data_dir),
        }
    }

    /// Upload a remote image to Magnific and return its creation identifier.
    pub async fn upload_image_url(&self, url: &str) -> Result<String, String> {
        let payload = self
            .conn
            .tool_call("creations_upload_image", json!({ "url": url }))
            .await?;
        parse_creation_identifier(&payload).ok_or_else(|| {
            format!(
                "No creation identifier found in the creations_upload_image response: {payload}"
            )
        })
    }

    /// Pre-resolve cross-provider media into Magnific creation identifiers.
    pub async fn resolve_cross_media(&self, params: &mut Value) -> Result<(), String> {
        let Some(medias) = params.get_mut("medias").and_then(|v| v.as_array_mut()) else {
            return Ok(());
        };

        for media in medias {
            if media.get("provider").and_then(Value::as_str) == Some(PROVIDER_ID) {
                continue;
            }

            let Some(url) = media.get("url").and_then(Value::as_str).map(str::to_owned) else {
                continue;
            };
            let creation_identifier = self.upload_image_url(&url).await?;
            media["value"] = Value::String(creation_identifier);
        }

        Ok(())
    }

    /// Generation submit — converts run-params (the shared frontend format) into images_generate arguments.
    /// Unlike Higgsfield, arguments are top-level and the model is mode=<slug>
    /// (verified via tools/list against the live server).
    pub fn submit_call(kind: &str, params: &Value) -> Result<(&'static str, Value), String> {
        Self::build_generate(kind, params)
    }

    fn build_generate(kind: &str, params: &Value) -> Result<(&'static str, Value), String> {
        match kind {
            "image" => Self::build_image_generate(params),
            "video" => Self::build_video_generate(params),
            _ => Err(format!(
                "Magnific {kind} generation is not supported yet (image and video only — audio and 3D to follow)"
            )),
        }
    }

    fn build_image_generate(params: &Value) -> Result<(&'static str, Value), String> {
        let mut args = serde_json::Map::new();

        let prompt = params
            .get("prompt")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .ok_or("prompt is required")?;
        args.insert("prompt".into(), json!(prompt));

        // Model slug — strips the catalog prefix (magnific/)
        if let Some(model) = params.get("model").and_then(|v| v.as_str()) {
            let slug = model
                .strip_prefix(super::magnific_catalog::ID_PREFIX)
                .unwrap_or(model);
            args.insert("mode".into(), json!(slug));
        }
        // "auto" is the model default — not in the API enum, so omit the argument (the live server rejects it as invalid)
        if let Some(ar) = params.get("aspect_ratio").and_then(|v| v.as_str()) {
            if ar != "auto" {
                args.insert("aspectRatio".into(), json!(ar));
            }
        }
        if let Some(res) = params.get("resolution").and_then(|v| v.as_str()) {
            if res != "auto" {
                args.insert("resolution".into(), json!(res));
            }
        }
        // Batch count 1..8 — omitted at 1 so the default-path wire payload stays unchanged
        if let Some(n) = numeric_count(params.get("count")) {
            let n = n.clamp(1, 8);
            if n >= 2 {
                args.insert("count".into(), json!(n));
            }
        }
        // Upstream references — medias[{value, role}] → references[{type, identifier}].
        if let Some(medias) = params.get("medias").and_then(|v| v.as_array()) {
            let refs: Vec<Value> = medias
                .iter()
                .filter_map(|m| {
                    let ident = m.get("value").and_then(|v| v.as_str())?;
                    let role = m.get("role").and_then(|r| r.as_str()).unwrap_or("image");
                    Some(json!({ "type": role, "identifier": ident }))
                })
                .collect();
            if !refs.is_empty() {
                args.insert("references".into(), Value::Array(refs));
            }
        }
        Ok(("images_generate", Value::Object(args)))
    }

    /// Video generation — goes straight to video_generate with a single clip
    /// (video_plan is for multi-clip — later).
    /// The start-frame value is a Magnific creation identifier after pre-resolution.
    fn build_video_generate(params: &Value) -> Result<(&'static str, Value), String> {
        let prompt = params
            .get("prompt")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .ok_or("prompt is required")?;

        let mut clip = serde_json::Map::new();
        clip.insert("prompt".into(), json!(prompt));
        if let Some(model) = params.get("model").and_then(|v| v.as_str()) {
            let slug = model
                .strip_prefix(super::magnific_catalog::ID_PREFIX)
                .unwrap_or(model);
            clip.insert("slug".into(), json!(slug));
        }
        // duration — the form uses string segments, so convert back to a number (required when slug is set).
        // Magnific's estimator rejects float representations like 3.0, so integer strings are kept as JSON integers.
        let duration = params
            .get("duration")
            .and_then(|v| match v {
                Value::Number(_) => Some(v.clone()),
                Value::String(s) => s
                    .parse::<u64>()
                    .ok()
                    .map(|n| json!(n))
                    .or_else(|| s.parse::<f64>().ok().map(|n| json!(n))),
                _ => None,
            })
            .ok_or("duration is required")?;
        clip.insert("duration".into(), duration);
        if let Some(ar) = params.get("aspect_ratio").and_then(|v| v.as_str()) {
            if ar != "auto" {
                clip.insert("aspectRatio".into(), json!(ar));
            }
        }
        if let Some(res) = params.get("resolution").and_then(|v| v.as_str()) {
            if res != "auto" {
                clip.insert("resolution".into(), json!(res));
            }
        }
        // Start frame — the first medias item (start_image port, max 1)
        if let Some(m) = params
            .get("medias")
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
        {
            let ident = m.get("value").and_then(|v| v.as_str());
            if let Some(u) = ident {
                clip.insert(
                    "keyframes".into(),
                    json!({ "start": { "type": "image", "url": u } }),
                );
            }
        }
        Ok((
            "video_generate",
            json!({ "video": { "clips": [Value::Object(clip)] } }),
        ))
    }

    /// Pre-run estimate — simulate_cost(tool, arguments).
    /// For video the live server reads a single clip's arguments directly, not video_generate's
    /// `{ video: { clips: [...] } }` wrapper (with the nested shape it cannot find the slug).
    pub fn estimate_call(kind: &str, params: &Value) -> Result<(&'static str, Value), String> {
        let (tool, args) = Self::build_generate(kind, params)?;
        let arguments = if kind == "video" {
            args.pointer("/video/clips/0")
                .cloned()
                .ok_or("Missing clip arguments for the video estimate")?
        } else {
            args
        };
        // Auto picks the model at run time, so the Magnific server cannot pin down a price.
        // Sending it over the network only returns a generic error string, so bail out with a marker the UI can quietly hide.
        if tool == "video_generate"
            && arguments.get("slug").and_then(Value::as_str)
                == Some(super::magnific_catalog::AUTO_VIDEO_SLUG)
        {
            return Err("estimate-unsupported: the Magnific Auto video model does not support pre-run estimates".into());
        }
        Ok((
            "simulate_cost",
            json!({ "tool": tool, "arguments": arguments }),
        ))
    }

    /// Job status query — creation_status (argument name confirmed against the live server: creationIdentifier)
    pub fn status_call(job_id: &str) -> (&'static str, Value) {
        (
            "creation_status",
            serde_json::json!({ "creationIdentifier": job_id }),
        )
    }

    fn catalog_path(&self) -> std::path::PathBuf {
        self.conn
            .app_data_dir()
            .join("catalog")
            .join("magnific.json")
    }

    fn cached_catalog(&self) -> Option<Value> {
        let text = std::fs::read_to_string(self.catalog_path()).ok()?;
        serde_json::from_str(&text)
            .ok()
            .map(super::magnific_catalog::filter_unsupported_models)
    }

    /// Model catalog — normalizes images_models_list (compact text) into ModelSpec, then caches to a file.
    /// (Read-only tool calls — no credits consumed. See magnific_catalog for the parsing)
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

    async fn fetch_catalog(&self) -> Result<Value, String> {
        // Merge the image and video lists (the response is compact text, not JSON — see the parser)
        let mut models: Vec<Value> = Vec::new();
        for tool in ["images_models_list", "video_models_list"] {
            let payload = self.conn.tool_call(tool, serde_json::json!({})).await?;
            let text = payload
                .as_str()
                .ok_or_else(|| format!("{tool} response is not text: {payload}"))?;
            let part = super::magnific_catalog::catalog_from_text(text);
            models.extend(part.as_array().cloned().unwrap_or_default());
        }
        if models.is_empty() {
            return Err("Magnific catalog conversion result is empty — the response format may have changed".into());
        }
        let catalog = Value::Array(models);
        let path = self.catalog_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&path, serde_json::to_string(&catalog).unwrap_or_default());
        Ok(catalog)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run_params() -> Value {
        // Exactly the format that run-params.ts produces
        json!({
            "model": "magnific/imagen-nano-banana-2-flash",
            "prompt": "black hole",
            "aspect_ratio": "16:9",
            "resolution": "2k",
            "medias": [{ "value": "cr-123", "role": "image" }]
        })
    }

    #[test]
    fn submit_maps_to_images_generate_args() {
        let (tool, args) = Magnific::submit_call("image", &run_params()).unwrap();
        assert_eq!(tool, "images_generate");
        assert_eq!(args["prompt"], "black hole");
        assert_eq!(args["mode"], "imagen-nano-banana-2-flash"); // prefix stripped
        assert_eq!(args["aspectRatio"], "16:9");
        assert_eq!(args["resolution"], "2k");
        assert_eq!(
            args["references"][0],
            json!({ "type": "image", "identifier": "cr-123" })
        );
    }

    #[test]
    fn submit_requires_prompt_and_supported_kind() {
        assert!(Magnific::submit_call("image", &json!({ "model": "magnific/x" })).is_err());
        assert!(Magnific::submit_call("3d", &run_params()).is_err()); // audio/3D come later
    }

    #[test]
    fn reference_uses_creation_id_everywhere() {
        let params = json!({
            "model": "magnific/x", "prompt": "p",
            "medias": [{ "value": "4RNtpok9Aa", "role": "image", "url": "https://cdn/x.png" }]
        });
        let (_, submit) = Magnific::submit_call("image", &params).unwrap();
        assert_eq!(submit["references"][0]["identifier"], "4RNtpok9Aa");
        let (_, est) = Magnific::estimate_call("image", &params).unwrap();
        assert_eq!(
            est["arguments"]["references"][0]["identifier"],
            "4RNtpok9Aa"
        );
    }

    #[test]
    fn image_count_passes_through_only_when_batching() {
        let batch = json!({ "model": "magnific/x", "prompt": "p", "count": "3" });
        let (_, args) = Magnific::submit_call("image", &batch).unwrap();
        assert_eq!(args["count"], 3);
        let (_, est) = Magnific::estimate_call("image", &batch).unwrap();
        assert_eq!(est["arguments"]["count"], 3);

        // count 1 or absent keeps the default-path payload byte-identical
        let single = json!({ "model": "magnific/x", "prompt": "p", "count": 1 });
        let (_, args) = Magnific::submit_call("image", &single).unwrap();
        assert_eq!(args.get("count"), None);
        let (_, args) =
            Magnific::submit_call("image", &json!({ "model": "magnific/x", "prompt": "p" }))
                .unwrap();
        assert_eq!(args.get("count"), None);

        // Out-of-range values clamp into 1..8
        let over = json!({ "model": "magnific/x", "prompt": "p", "count": 20 });
        let (_, args) = Magnific::submit_call("image", &over).unwrap();
        assert_eq!(args["count"], 8);
    }

    #[test]
    fn image_cross_provider_reference_uses_resolved_creation_id() {
        let params = json!({
            "model": "magnific/x", "prompt": "p",
            "medias": [{
                "value": "uploaded-creation",
                "role": "image",
                "url": "https://cdn/h.png",
                "provider": "higgsfield"
            }]
        });
        let (_, args) = Magnific::submit_call("image", &params).unwrap();
        assert_eq!(args["references"][0]["identifier"], "uploaded-creation");
    }

    #[test]
    fn video_builds_single_clip() {
        // Same-provider start frame uses the sqid; duration is converted back to a number
        let params = json!({
            "model": "magnific/kling-3.0", "prompt": "spacewalk", "duration": "5",
            "aspect_ratio": "16:9", "resolution": "720p",
            "medias": [{ "value": "4RNtpok9Aa", "role": "image", "url": "https://cdn/x.png", "provider": "magnific" }]
        });
        let (tool, args) = Magnific::submit_call("video", &params).unwrap();
        assert_eq!(tool, "video_generate");
        let clip = &args["video"]["clips"][0];
        assert_eq!(clip["slug"], "kling-3.0");
        assert_eq!(clip["duration"], 5);
        assert_eq!(clip["aspectRatio"], "16:9");
        assert_eq!(clip["keyframes"]["start"]["url"], "4RNtpok9Aa");
    }

    #[test]
    fn video_cross_provider_start_frame_uses_resolved_creation_id() {
        let params = json!({
            "model": "magnific/x", "prompt": "p", "duration": "8",
            "medias": [{ "value": "uploaded-creation", "role": "image", "url": "https://cdn/h.png", "provider": "higgsfield" }]
        });
        let (_, args) = Magnific::submit_call("video", &params).unwrap();
        assert_eq!(
            args["video"]["clips"][0]["keyframes"]["start"]["url"],
            "uploaded-creation"
        );
    }

    #[test]
    fn parses_creation_identifier_from_supported_response_shapes() {
        assert_eq!(
            parse_creation_identifier(&json!({ "creationIdentifier": "cr-1" })),
            Some("cr-1".into())
        );
        assert_eq!(
            parse_creation_identifier(&json!({ "creation": { "identifier": "cr-2" } })),
            Some("cr-2".into())
        );
        assert_eq!(
            parse_creation_identifier(&json!({ "result": { "id": "cr-3" } })),
            Some("cr-3".into())
        );
    }

    #[test]
    fn missing_creation_identifier_is_rejected() {
        assert_eq!(parse_creation_identifier(&json!({ "status": "ok" })), None);
    }

    #[test]
    fn video_requires_duration() {
        let params = json!({ "model": "magnific/x", "prompt": "p" });
        assert!(Magnific::submit_call("video", &params).is_err());
    }

    #[test]
    fn auto_aspect_ratio_is_omitted() {
        // "auto" = model default — the API enum rejects it, so the argument is dropped entirely (verified against the live server)
        let params = json!({ "model": "magnific/x", "prompt": "p", "aspect_ratio": "auto", "resolution": "auto" });
        let (_, args) = Magnific::submit_call("image", &params).unwrap();
        assert!(args.get("aspectRatio").is_none());
        assert!(args.get("resolution").is_none());
    }

    #[test]
    fn estimate_wraps_simulate_cost() {
        let (tool, args) = Magnific::estimate_call("image", &run_params()).unwrap();
        assert_eq!(tool, "simulate_cost");
        assert_eq!(args["tool"], "images_generate");
        assert_eq!(args["arguments"]["mode"], "imagen-nano-banana-2-flash");
    }

    #[test]
    fn video_estimate_passes_single_clip_directly() {
        let params = json!({
            "model": "magnific/gemini-omni-preview",
            "prompt": "paper boat",
            "duration": "3",
            "resolution": "720p"
        });
        let (tool, args) = Magnific::estimate_call("video", &params).unwrap();
        assert_eq!(tool, "simulate_cost");
        assert_eq!(args["tool"], "video_generate");
        assert_eq!(args["arguments"]["slug"], "gemini-omni-preview");
        assert_eq!(args["arguments"]["duration"], 3);
        assert!(args["arguments"].get("video").is_none());
    }

    #[test]
    fn auto_video_estimate_is_explicitly_unsupported() {
        let params = json!({
            "model": "magnific/auto-video-generator",
            "prompt": "paper boat",
            "duration": "5",
            "resolution": "720p"
        });
        let error = Magnific::estimate_call("video", &params).unwrap_err();
        assert!(error.starts_with("estimate-unsupported:"));
    }
}
