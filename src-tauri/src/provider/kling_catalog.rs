//! Normalizes the Kling `who_am_i` response into Atoll's shared ModelSpec.
//!
//! Kling's models, arguments, and inputs change dynamically with account and membership.
//! This module is kept as a pure conversion layer with no knowledge of the network or
//! credentials, so live responses can be reproduced as fixtures.

use serde_json::{json, Map, Value};

pub const ID_PREFIX: &str = "kling/";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KlingTool {
    TextToImage,
    ImageToImage,
    TextToVideo,
    ImageToVideo,
}

impl KlingTool {
    pub const ALL: [Self; 4] = [
        Self::TextToImage,
        Self::ImageToImage,
        Self::TextToVideo,
        Self::ImageToVideo,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::TextToImage => "text_to_image",
            Self::ImageToImage => "image_to_image",
            Self::TextToVideo => "text_to_video",
            Self::ImageToVideo => "image_to_video",
        }
    }

    fn output_type(self) -> &'static str {
        match self {
            Self::TextToImage | Self::ImageToImage => "image",
            Self::TextToVideo | Self::ImageToVideo => "video",
        }
    }

    fn has_media(self) -> bool {
        matches!(self, Self::ImageToImage | Self::ImageToVideo)
    }
}

#[allow(dead_code)] // Used by the generation submit/poll wire conversion
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KlingModelRef {
    pub tool: KlingTool,
    pub canonical_model: String,
}

pub fn encode_model_ref(tool: KlingTool, canonical_model: &str) -> String {
    format!("{}{}/{}", ID_PREFIX, tool.as_str(), canonical_model)
}

#[allow(dead_code)] // Used by the generation submit/poll wire conversion
pub fn parse_model_ref(value: &str) -> Result<KlingModelRef, String> {
    let rest = value
        .strip_prefix(ID_PREFIX)
        .ok_or_else(|| format!("Not a Kling model ID: {value}"))?;
    let (tool, model) = rest
        .split_once('/')
        .ok_or_else(|| format!("Malformed Kling model ID: {value}"))?;
    if model.is_empty() || model.contains('/') {
        return Err(format!("Invalid Kling canonical model ID: {value}"));
    }
    let tool = KlingTool::ALL
        .into_iter()
        .find(|candidate| candidate.as_str() == tool)
        .ok_or_else(|| format!("Unsupported Kling generation tool: {tool}"))?;
    Ok(KlingModelRef {
        tool,
        canonical_model: model.to_string(),
    })
}

/// Converts the `who_am_i` payload into a ModelSpec array.
pub fn catalog_from_payload(payload: &Value) -> Result<Value, String> {
    let available = payload
        .get("availableModels")
        .or_else(|| payload.get("available_models"))
        .ok_or_else(|| "No availableModels in the Kling who_am_i response".to_string())?;

    let mut models = Vec::new();
    for tool in KlingTool::ALL {
        let group = available
            .get(tool.as_str())
            .or_else(|| available.get(tool.as_str().replace('_', "-")))
            .or_else(|| available.get(tool_key_camel(tool)));
        for model in model_values(group) {
            if let Some(spec) = model_spec(model, tool) {
                if !models
                    .iter()
                    .any(|existing: &Value| existing["id"] == spec["id"])
                {
                    models.push(spec);
                }
            }
        }
    }

    if models.is_empty() {
        return Err("No supported models found in Kling who_am_i".into());
    }
    Ok(Value::Array(models))
}

/// Extracts only remaining-style numbers from the balance response.
/// Unlike the generic `extract_credits`, the candidate order is explicit so the
/// membership total isn't picked by mistake.
pub fn extract_credits(payload: &Value) -> Option<f64> {
    const KEYS: [&str; 9] = [
        "availableRemainCredits",
        "remainingCredits",
        "remaining_credits",
        "availableCredits",
        "available_credits",
        "credits",
        "balance",
        "available",
        "remaining",
    ];
    find_number_by_keys(payload, &KEYS, 0)
}

fn tool_key_camel(tool: KlingTool) -> &'static str {
    match tool {
        KlingTool::TextToImage => "textToImage",
        KlingTool::ImageToImage => "imageToImage",
        KlingTool::TextToVideo => "textToVideo",
        KlingTool::ImageToVideo => "imageToVideo",
    }
}

fn model_values<'a>(group: Option<&'a Value>) -> Vec<&'a Value> {
    match group {
        Some(Value::Array(items)) => items.iter().collect(),
        Some(Value::Object(obj)) => obj
            .get("models")
            .or_else(|| obj.get("availableModels"))
            .and_then(Value::as_array)
            .map(|items| items.iter().collect())
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn model_spec(model: &Value, tool: KlingTool) -> Option<Value> {
    let canonical = first_string(model, &["model", "modelId", "model_id", "id", "slug"])?;
    // Image 2.1's raw subject input has an incomplete live schema, so it is hidden in the first pass.
    if tool == KlingTool::ImageToImage && canonical == "kling-image-v2_1" {
        return None;
    }
    let name = first_string(model, &["name", "displayName", "display_name"])
        .unwrap_or_else(|| canonical.clone());
    let mut parameters = argument_specs(model);
    if !parameters
        .iter()
        .any(|p| p.get("name").and_then(Value::as_str) == Some("prompt"))
        && (tool.output_type() == "image" || tool.output_type() == "video")
    {
        parameters.insert(
            0,
            json!({
                "name": "prompt",
                "required": "required",
                "type": "string",
                "description": "Generation prompt"
            }),
        );
    }

    let mut spec = json!({
        "id": encode_model_ref(tool, &canonical),
        "name": format!("{} · {}", name, mode_label(tool)),
        "provider": "kling",
        "provider_name": "Kling",
        "provider_tool": tool.as_str(),
        "provider_model": canonical,
        "supports_estimate": false,
        "description": first_string(model, &["description", "desc"]).unwrap_or_default(),
        "output_type": tool.output_type(),
        "parameters": parameters,
        "medias": media_specs(model, tool),
        "aspect_ratios": first_array(model, &["aspectRatios", "aspect_ratios"]).unwrap_or_default(),
        "tags": ["kling", tool.as_str()],
    });
    normalize_result_count(&mut spec["parameters"]);
    Some(spec)
}

fn mode_label(tool: KlingTool) -> &'static str {
    match tool {
        KlingTool::TextToImage => "Text to image",
        KlingTool::ImageToImage => "Image to image",
        KlingTool::TextToVideo => "Text to video",
        KlingTool::ImageToVideo => "Image to video",
    }
}

fn argument_specs(model: &Value) -> Vec<Value> {
    let Some(raw) = model
        .get("arguments")
        .or_else(|| model.get("parameters"))
        .or_else(|| model.get("params"))
    else {
        return Vec::new();
    };
    let mut output = Vec::new();
    match raw {
        Value::Array(items) => {
            for item in items {
                if let Some(spec) = argument_spec(item, None) {
                    output.push(spec);
                }
            }
        }
        Value::Object(items) => {
            for (name, item) in items {
                if let Some(spec) = argument_spec(item, Some(name)) {
                    output.push(spec);
                }
            }
        }
        _ => {}
    }
    output
}

fn argument_spec(raw: &Value, fallback_name: Option<&str>) -> Option<Value> {
    let name =
        first_string(raw, &["name", "key", "id"]).or_else(|| fallback_name.map(str::to_string))?;
    let required = raw
        .get("required")
        .or_else(|| raw.get("isRequired"))
        .map(value_bool)
        .unwrap_or(false);
    let options = first_array(raw, &["allowedValues", "allowed_values", "options", "enum"])
        .map(|items| {
            items
                .into_iter()
                .map(|v| scalar_string(&v))
                .collect::<Vec<_>>()
        })
        .filter(|items: &Vec<String>| !items.is_empty());
    let type_name = first_string(raw, &["type", "valueType", "value_type"])
        .unwrap_or_else(|| infer_type(raw, options.as_ref()));
    let mut spec = Map::new();
    spec.insert("name".into(), Value::String(name));
    spec.insert(
        "required".into(),
        Value::String(if required { "required" } else { "optional" }.into()),
    );
    spec.insert("type".into(), Value::String(normalize_type(&type_name)));
    if let Some(description) = first_string(raw, &["description", "desc", "help"]) {
        spec.insert("description".into(), Value::String(description));
    }
    if let Some(default) = raw.get("default").or_else(|| raw.get("defaultValue")) {
        spec.insert("default".into(), default.clone());
    }
    if let Some(options) = options {
        spec.insert(
            "options".into(),
            Value::Array(options.into_iter().map(Value::String).collect()),
        );
    }
    for (out_key, in_keys) in [
        ("min", &["min", "minimum"][..]),
        ("max", &["max", "maximum"][..]),
    ] {
        if let Some(value) = first_number(raw, in_keys) {
            spec.insert(out_key.into(), json!(value));
        }
    }
    Some(Value::Object(spec))
}

fn media_specs(model: &Value, tool: KlingTool) -> Vec<Value> {
    if !tool.has_media() {
        return Vec::new();
    }
    let Some(raw) = model.get("inputs").or_else(|| model.get("mediaInputs")) else {
        return Vec::new();
    };
    let Some(items) = raw.as_array() else {
        return Vec::new();
    };
    let mut specs: Vec<Value> = Vec::new();
    for item in items {
        let Some(name) = first_string(item, &["name", "key", "id"]) else {
            continue;
        };
        let input_type = first_string(item, &["inputType", "input_type", "type"])
            .map(|s| input_type(&s))
            .unwrap_or_else(|| input_type(&name));
        let required = item
            .get("required")
            .or_else(|| item.get("isRequired"))
            .map(value_bool)
            .unwrap_or(false);

        if let Some(index) = numbered_image_index(&name) {
            if let Some(existing) = specs
                .iter_mut()
                .find(|s| s.get("name").and_then(Value::as_str) == Some("reference_images"))
            {
                existing["provider_inputs"]
                    .as_array_mut()
                    .expect("provider_inputs array")
                    .push(Value::String(name));
                let current_max = existing.get("max").and_then(Value::as_u64).unwrap_or(0);
                existing["max"] = json!(current_max.max(index));
                if required {
                    existing["min"] = json!(1);
                    existing["required"] = Value::Bool(true);
                }
            } else {
                specs.push(json!({
                    "name": "reference_images",
                    "type": input_type,
                    "roles": ["image"],
                    "required": required || index == 1,
                    "min": if required || index == 1 { 1 } else { 0 },
                    "max": index,
                    "provider_inputs": [name]
                }));
            }
            continue;
        }

        let max = first_number(item, &["max", "maximum"]).unwrap_or(1.0) as u64;
        specs.push(json!({
            "name": name.clone(),
            "type": input_type,
            "roles": [name],
            "required": required,
            "min": if required { 1 } else { 0 },
            "max": max.max(1),
            "provider_inputs": [name]
        }));
    }
    specs
}

fn normalize_result_count(parameters: &mut Value) {
    let Some(items) = parameters.as_array_mut() else {
        return;
    };
    // Story mode is not part of the generation/polling contract, so it is not exposed in the UI.
    items.retain(|item| item.get("name").and_then(Value::as_str) != Some("story_mode"));
    for item in items {
        let Some(name) = item.get("name").and_then(Value::as_str).map(str::to_string) else {
            continue;
        };
        if matches!(name.as_str(), "imageCount" | "image_count" | "count") {
            // Server min/max pass through (images 1–9, video 1–4); guarantee a floor and default
            if item.get("default").is_none() {
                item["default"] = json!(1);
            }
            if item.get("min").is_none() {
                item["min"] = json!(1);
            }
            // Some models mis-describe this field (e.g. as a quality tier) — normalize the label
            item["description"] = json!("Number of results per run");
        }
    }
}

fn numbered_image_index(name: &str) -> Option<u64> {
    let suffix = name.strip_prefix("image_")?;
    let index = suffix.parse::<u64>().ok()?;
    (index > 0).then_some(index)
}

fn input_type(value: &str) -> String {
    let lower = value.to_lowercase();
    if lower.contains("video") {
        "video".into()
    } else if lower.contains("audio") {
        "audio".into()
    } else {
        "image".into()
    }
}

fn infer_type(raw: &Value, options: Option<&Vec<String>>) -> String {
    if options.is_some() {
        return "string".into();
    }
    raw.get("default")
        .or_else(|| raw.get("defaultValue"))
        .map(|value| match value {
            Value::Bool(_) => "bool".into(),
            Value::Number(_) => "number".into(),
            _ => "string".into(),
        })
        .unwrap_or_else(|| "string".into())
}

fn normalize_type(value: &str) -> String {
    match value.to_lowercase().as_str() {
        "bool" | "boolean" => "bool".into(),
        "number" | "integer" | "int" | "float" | "double" => "number".into(),
        "array" | "string_array" | "string[]" => "string_array".into(),
        _ => "string".into(),
    }
}

fn first_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str).map(str::to_string))
}

fn first_array(value: &Value, keys: &[&str]) -> Option<Vec<Value>> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_array).cloned())
}

fn first_number(value: &Value, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        })
    })
}

fn value_bool(value: &Value) -> bool {
    match value {
        Value::Bool(v) => *v,
        Value::String(v) => matches!(v.to_lowercase().as_str(), "true" | "required" | "yes"),
        Value::Number(v) => v.as_i64() == Some(1),
        _ => false,
    }
}

fn scalar_string(value: &Value) -> String {
    match value {
        Value::String(v) => v.clone(),
        Value::Bool(v) => v.to_string(),
        Value::Number(v) => v.to_string(),
        _ => value.to_string(),
    }
}

fn find_number_by_keys(value: &Value, keys: &[&str], depth: usize) -> Option<f64> {
    if depth > 3 {
        return None;
    }
    if let Value::Object(obj) = value {
        for key in keys {
            if let Some(number) = obj.get(*key).and_then(|v| {
                v.as_f64()
                    .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
            }) {
                return Some(number);
            }
        }
        for child in obj.values() {
            if let Some(number) = find_number_by_keys(child, keys, depth + 1) {
                return Some(number);
            }
        }
    } else if let Value::Array(items) = value {
        for child in items {
            if let Some(number) = find_number_by_keys(child, keys, depth + 1) {
                return Some(number);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_ref_round_trip() {
        let id = encode_model_ref(KlingTool::ImageToImage, "gpt-image2");
        assert_eq!(parse_model_ref(&id).unwrap().canonical_model, "gpt-image2");
        assert!(parse_model_ref("magnific/foo").is_err());
    }

    #[test]
    fn normalizes_mode_specific_models_and_keeps_count_range() {
        let payload = json!({
            "availableModels": {
                "text_to_image": {"models": [{
                    "model": "kling-image-v3_0_omni",
                    "name": "Image 3.0 Omni",
                    "arguments": [
                        {"name":"img_resolution","type":"string","default":"4k","allowedValues":["1k","2k","4k"]},
                        {"name":"imageCount","type":"number","default":1,"min":1,"max":9}
                    ]
                }]},
                "image_to_video": {"models": [{
                    "model": "kling-video-v3_0",
                    "name": "Video 3.0",
                    "arguments": [{"name":"duration","type":"number","min":3,"max":15}],
                    "inputs": [
                        {"name":"first_image","inputType":"URL","required":true},
                        {"name":"tail_image","inputType":"URL","required":false}
                    ]
                }]}
            }
        });
        let models = catalog_from_payload(&payload).unwrap();
        assert_eq!(models.as_array().unwrap().len(), 2);
        let image = models
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["output_type"] == "image")
            .unwrap();
        assert_eq!(image["provider_tool"], "text_to_image");
        assert_eq!(image["parameters"][0]["name"], "prompt");
        // Batch count keeps the server range — un-clamped for gallery results
        assert_eq!(image["parameters"][2]["name"], "imageCount");
        assert_eq!(image["parameters"][2]["min"].as_f64(), Some(1.0));
        assert_eq!(image["parameters"][2]["max"].as_f64(), Some(9.0));
        assert_eq!(image["parameters"][2]["default"].as_f64(), Some(1.0));
        assert_eq!(image["parameters"][2].get("options"), None);
        let video = models
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["output_type"] == "video")
            .unwrap();
        assert_eq!(video["medias"][0]["name"], "first_image");
        assert_eq!(video["medias"][1]["name"], "tail_image");
    }

    #[test]
    fn groups_numbered_inputs() {
        let payload = json!({
            "availableModels": {
                "image_to_image": {"models": [{
                    "model": "kling-image-v3_0",
                    "inputs": [
                        {"name":"image_1","required":true},
                        {"name":"image_2","required":false},
                        {"name":"image_3","required":false}
                    ]
                }]}
            }
        });
        let models = catalog_from_payload(&payload).unwrap();
        assert_eq!(models[0]["medias"][0]["max"], 3);
        assert_eq!(models[0]["medias"][0]["provider_inputs"][1], "image_2");
    }

    #[test]
    fn excludes_image_21_i2i() {
        let payload = json!({
            "availableModels": {
                "image_to_image": {"models": [{"model":"kling-image-v2_1"}]}
            }
        });
        assert!(catalog_from_payload(&payload).is_err());
    }

    #[test]
    fn extracts_remaining_credits_before_generic_balance() {
        let payload = json!({"membership": {"credits": 999, "remainingCredits": 42.5}});
        assert_eq!(extract_credits(&payload), Some(42.5));
    }

    #[test]
    fn extracts_kling_available_remain_credits() {
        let payload = json!({
            "availableRemainCredits": "660.0",
            "membershipType": "VIP",
            "userId": "00000000"
        });
        assert_eq!(extract_credits(&payload), Some(660.0));
    }
}
