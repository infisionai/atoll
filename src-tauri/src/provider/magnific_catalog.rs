//! Parser for the Magnific model list response — pure functions.
//!
//! `images_models_list` returns custom compact text rather than JSON:
//! ```text
//! models[49]:
//!   - slug: auto
//!     name: Auto
//!     aspectRatios[10]: "1:1","16:9",…
//!     requiresPremium: true
//! ```
//! This is normalized into the same ModelSpec JSON as the Higgsfield catalog.
//! Nested blocks (e.g. video models' keyframes:) are skipped — the first pass covers flat image models only.

use serde_json::{json, Map, Value};

/// Model id prefix — as an aggregator, model names collide with other providers
pub const ID_PREFIX: &str = "magnific/";
/// Image/video Auto entries don't pin an execution model up front, so they are excluded from the UI.
pub const AUTO_IMAGE_SLUG: &str = "auto";
pub const AUTO_VIDEO_SLUG: &str = "auto-video-generator";

fn is_auto_model_slug(slug: &str) -> bool {
    matches!(slug, AUTO_IMAGE_SLUG | AUTO_VIDEO_SLUG)
}

/// Removes hidden models even from catalog caches saved by earlier versions.
pub fn filter_unsupported_models(mut catalog: Value) -> Value {
    if let Some(models) = catalog.as_array_mut() {
        models.retain(|model| {
            model
                .get("id")
                .and_then(Value::as_str)
                .and_then(|id| id.strip_prefix(ID_PREFIX))
                .is_none_or(|slug| !is_auto_model_slug(slug))
        });
    }
    catalog
}

/// Compact text → entry list. Each entry is a flat key→Value map
pub fn parse_models_text(text: &str) -> Vec<Map<String, Value>> {
    let mut entries: Vec<Map<String, Value>> = Vec::new();

    for line in text.lines() {
        let indent = line.len() - line.trim_start().len();
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        // New entry: "- key: value" at indent 2
        if indent == 2 && trimmed.starts_with("- ") {
            let mut entry = Map::new();
            if let Some((k, v)) = parse_field(&trimmed[2..]) {
                entry.insert(k, v);
            }
            entries.push(entry);
            continue;
        }
        // Field: "key: value" at indent 4 — deeper nesting (6+) is skipped
        if indent == 4 {
            if let (Some(entry), Some((k, v))) = (entries.last_mut(), parse_field(trimmed)) {
                entry.insert(k, v);
            }
        }
    }
    entries
}

/// Parse one line of "key: value" or "key[N]: a,b,c".
/// An empty value (a nested block header) yields None — the block contents are ignored by the caller
fn parse_field(s: &str) -> Option<(String, Value)> {
    let (raw_key, raw_value) = s.split_once(':')?;
    let value = raw_value.trim();
    if value.is_empty() {
        return None; // A nested block header like "prompt:"
    }
    // "aspectRatios[10]" → array field
    if let Some(base) = raw_key.trim().strip_suffix(']').and_then(|k| k.split_once('[')) {
        let (name, _count) = base;
        // Table formats like "references[1]{type,allowed,limit}" are not handled
        if name.contains('{') {
            return None;
        }
        let items: Vec<Value> = value
            .split(',')
            .map(|item| scalar(item.trim().trim_matches('"')))
            .collect();
        return Some((name.trim().to_string(), Value::Array(items)));
    }
    let key = raw_key.trim();
    if key.contains('{') {
        return None;
    }
    Some((key.to_string(), scalar(value)))
}

fn scalar(s: &str) -> Value {
    match s {
        "true" => Value::Bool(true),
        "false" => Value::Bool(false),
        _ => {
            if let Ok(n) = s.parse::<i64>() {
                json!(n)
            } else {
                Value::String(s.to_string())
            }
        }
    }
}

/// Entry → ModelSpec JSON. None if the kind is unsupported (not text-to-image or
/// video-generator) or required fields are missing (the caller logs it)
pub fn to_model_spec(entry: &Map<String, Value>) -> Option<Value> {
    let slug = entry.get("slug")?.as_str()?;
    let name = entry.get("name")?.as_str()?;
    let tool = entry.get("tool").and_then(|v| v.as_str()).unwrap_or("");
    let output_type = match tool {
        "text-to-image" => "image",
        // Video goes straight to video_generate with a single clip (video_plan is for multi-clip — later)
        "video-generator" => "video",
        _ => return None,
    };
    if is_auto_model_slug(slug) {
        return None;
    }

    let mut parameters: Vec<Value> = Vec::new();
    if output_type == "video" {
        if let Some(durations) = entry.get("durations").and_then(|v| v.as_array()) {
            // Numeric choices as string options — the form uses segments; submit converts back to numbers
            let options: Vec<Value> = durations
                .iter()
                .filter_map(|d| d.as_i64().map(|n| json!(n.to_string())))
                .collect();
            parameters.push(json!({
                "name": "duration",
                "required": "required",
                "type": "string",
                "description": "Video length (seconds)",
                "default": options.first(),
                "options": options,
            }));
        }
    }
    if let Some(res) = entry.get("resolutions").filter(|v| v.is_array()) {
        parameters.push(json!({
            "name": "resolution",
            "required": "optional",
            "type": "string",
            "description": "Output resolution",
            "default": res.get(0),
            "options": res,
        }));
    }

    // Media input ports:
    // - image models: references — only roles that can take a generation result (creation)
    //   (character/product/locations are library-asset-only and the server rejects them — verified against the live server)
    // - video models: one start frame (keyframes.start) — the key input for image→video
    let mut medias: Vec<Value> = Vec::new();
    if output_type == "video" {
        if entry.get("supportsStartFrame") == Some(&Value::Bool(true)) {
            medias.push(json!({
                "name": "start_image", "type": "image", "roles": ["image"], "max": 1
            }));
        }
    } else if entry.get("supportsReferences") == Some(&Value::Bool(true)) {
        let roles: Vec<Value> = entry
            .get("referenceTypes")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter(|r| matches!(r.as_str(), Some("image") | Some("style")))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();
        let roles = if roles.is_empty() { vec![json!("image")] } else { roles };
        medias.push(json!({ "name": "references", "type": "image", "roles": roles }));
    }

    let mut tags: Vec<Value> = vec![json!("magnific")];
    if entry.get("beta") == Some(&Value::Bool(true)) {
        tags.push(json!("beta"));
    }
    if entry.get("requiresPremium") == Some(&Value::Bool(true)) {
        tags.push(json!("premium"));
    }

    let gen_time = entry.get("expectedGenerationTime").and_then(|v| v.as_i64());
    let kind_label = if output_type == "video" { "Video generation" } else { "Text to image" };
    let description = match gen_time {
        Some(t) => format!("{kind_label} · about {t}s"),
        None => kind_label.to_string(),
    };

    Some(json!({
        "id": format!("{ID_PREFIX}{slug}"),
        "name": name,
        "provider": "magnific",
        "provider_name": entry.get("family").and_then(|v| v.as_str()).unwrap_or("magnific"),
        "description": description,
        "output_type": output_type,
        "parameters": parameters,
        "medias": medias,
        "aspect_ratios": entry.get("aspectRatios").cloned().unwrap_or(json!([])),
        "tags": tags,
    }))
}

/// Response text → ModelSpec array. Unconvertible models are excluded and the counts are logged
pub fn catalog_from_text(text: &str) -> Value {
    let entries = parse_models_text(text);
    let total = entries.len();
    let specs: Vec<Value> = entries.iter().filter_map(to_model_spec).collect();
    if specs.len() < total {
        log::info!(
            "Magnific catalog: converted {}/{total} (unsupported models excluded)",
            specs.len()
        );
    }
    Value::Array(specs)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Abridged fixture from a dump captured from the live server
    const FIXTURE: &str = r#"models[3]:
  - slug: cinematic
    name: Cinematic
    family: imagen
    tool: text-to-image
    beta: false
    expectedGenerationTime: 53
    aspectRatios[3]: "1:1","21:9","16:9"
    resolutions[3]: 1k,2k,4k
    supportsReferences: true
    referenceTypes[3]: character,product,image
    requiredInputs[1]: prompt
    extraSettings[1]: cinematicControls
    requiresPremium: true
  - slug: gemini-omni-preview
    name: Gemini Omni Flash
    tool: video-generator
    beta: false
    expectedGenerationTime: 200
    aspectRatios[2]: "16:9","9:16"
    durations[4]: 5,6,8,10
    prompt:
      required: true
      maxLength: 1999
    references[1]{type,allowed,limit}:
      image,true,3
    keyframes:
      start:
        assetType: image
  - slug: classic
    name: Classic
    family: classic
    tool: text-to-image
    beta: true
    expectedGenerationTime: 3
    aspectRatios[2]: "1:1","16:9"
    supportsReferences: false
    requiredInputs[1]: prompt
"#;

    #[test]
    fn parses_flat_entries_and_skips_nested_blocks() {
        let entries = parse_models_text(FIXTURE);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0]["slug"], "cinematic");
        assert_eq!(entries[0]["expectedGenerationTime"], 53);
        assert_eq!(entries[0]["aspectRatios"], json!(["1:1", "21:9", "16:9"]));
        assert_eq!(entries[0]["resolutions"], json!(["1k", "2k", "4k"]));
        // Nested blocks (prompt:, keyframes:) and table fields are silently ignored
        assert!(entries[1].get("prompt").is_none());
        assert!(entries[1].get("references").is_none());
        assert_eq!(entries[1]["durations"], json!([5, 6, 8, 10]));
    }

    #[test]
    fn model_spec_mapping() {
        let entries = parse_models_text(FIXTURE);
        let spec = to_model_spec(&entries[0]).unwrap();
        assert_eq!(spec["id"], "magnific/cinematic");
        assert_eq!(spec["output_type"], "image");
        assert_eq!(spec["provider"], "magnific");
        assert_eq!(spec["provider_name"], "imagen");
        assert_eq!(spec["parameters"][0]["name"], "resolution");
        assert_eq!(spec["parameters"][0]["options"], json!(["1k", "2k", "4k"]));
        assert_eq!(spec["medias"][0]["name"], "references");
        // character/product are library-only, so excluded — only roles that take a creation
        assert_eq!(spec["medias"][0]["roles"], json!(["image"]));
        assert_eq!(spec["aspect_ratios"], json!(["1:1", "21:9", "16:9"]));
        assert!(spec["tags"].as_array().unwrap().contains(&json!("premium")));
    }

    #[test]
    fn video_model_maps_with_duration_and_start_frame() {
        let entries = parse_models_text(FIXTURE);
        let spec = to_model_spec(&entries[1]).unwrap();
        assert_eq!(spec["output_type"], "video");
        assert_eq!(spec["parameters"][0]["name"], "duration");
        assert_eq!(spec["parameters"][0]["required"], "required");
        assert_eq!(spec["parameters"][0]["options"], json!(["5", "6", "8", "10"]));
        // The FIXTURE's video entry lacks supportsStartFrame → no start-frame port
        assert_eq!(spec["medias"], json!([]));
        let catalog = catalog_from_text(FIXTURE);
        assert_eq!(catalog.as_array().unwrap().len(), 3);
    }

    #[test]
    fn auto_models_are_excluded_from_fresh_and_cached_catalogs() {
        let text = "models[2]:\n  - slug: auto\n    name: Auto\n    tool: text-to-image\n  - slug: auto-video-generator\n    name: Auto\n    tool: video-generator\n    durations[1]: 5\n";
        assert_eq!(catalog_from_text(text), json!([]));

        let cached = json!([
            { "id": "magnific/auto-video-generator", "output_type": "video" },
            { "id": "magnific/auto", "output_type": "image" },
            { "id": "magnific/gemini-omni-preview", "output_type": "video" }
        ]);
        let filtered = filter_unsupported_models(cached);
        assert_eq!(filtered.as_array().unwrap().len(), 1);
        assert!(!filtered.as_array().unwrap().iter().any(|m| m["id"] == "magnific/auto"));
        assert!(filtered
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["id"] == "magnific/gemini-omni-preview"));
    }

    #[test]
    fn video_model_start_frame_port() {
        let text = "models[1]:\n  - slug: v1\n    name: V1\n    tool: video-generator\n    durations[2]: 5,10\n    supportsStartFrame: true\n";
        let spec = to_model_spec(&parse_models_text(text)[0]).unwrap();
        assert_eq!(spec["medias"][0]["name"], "start_image");
        assert_eq!(spec["medias"][0]["max"], 1);
    }

    #[test]
    fn references_absent_when_unsupported() {
        let entries = parse_models_text(FIXTURE);
        let spec = to_model_spec(&entries[2]).unwrap();
        assert_eq!(spec["medias"], json!([]));
        assert!(spec["tags"].as_array().unwrap().contains(&json!("beta")));
    }
}
