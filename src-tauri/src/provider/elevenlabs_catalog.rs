//! Static ElevenLabs model catalog and the small model-reference codec used by generation.

use super::elevenlabs_api::VoiceSummary;
use serde_json::{json, Value};

pub const ID_PREFIX: &str = "elevenlabs/";
pub const DEFAULT_VOICE_ID: &str = "21m00Tcm4TlvDq8ikWAM";
pub const DEFAULT_OUTPUT_FORMAT: &str = "mp3_44100_128";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ElevenTool {
    Tts,
    Music,
    Sfx,
}

impl ElevenTool {
    #[allow(dead_code)]
    pub const ALL: [Self; 3] = [Self::Tts, Self::Music, Self::Sfx];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Tts => "tts",
            Self::Music => "music",
            Self::Sfx => "sfx",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "tts" => Some(Self::Tts),
            "music" => Some(Self::Music),
            "sfx" => Some(Self::Sfx),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ElevenModelRef {
    pub tool: ElevenTool,
    pub model: String,
}

pub fn encode_model_ref(tool: ElevenTool, model: &str) -> String {
    format!("{ID_PREFIX}{}/{model}", tool.as_str())
}

pub fn parse_model_ref(value: &str) -> Result<ElevenModelRef, String> {
    let rest = value
        .strip_prefix(ID_PREFIX)
        .ok_or_else(|| format!("Not an ElevenLabs model ID: {value}"))?;
    let segments: Vec<_> = rest.split('/').collect();
    if segments.len() != 2 || segments.iter().any(|segment| segment.is_empty()) {
        return Err(format!("Malformed ElevenLabs model ID: {value}"));
    }
    let tool = ElevenTool::from_str(segments[0])
        .ok_or_else(|| format!("Unsupported ElevenLabs generation tool: {}", segments[0]))?;
    if !supported_model(tool, segments[1]) {
        return Err(format!("Unsupported ElevenLabs model: {value}"));
    }
    Ok(ElevenModelRef {
        tool,
        model: segments[1].to_string(),
    })
}

pub fn supported_model(tool: ElevenTool, model: &str) -> bool {
    match tool {
        ElevenTool::Tts => matches!(
            model,
            "eleven_multilingual_v2" | "eleven_v3" | "eleven_turbo_v2_5" | "eleven_flash_v2_5"
        ),
        ElevenTool::Music => model == "music_v2",
        ElevenTool::Sfx => model == "eleven_text_to_sound_v2",
    }
}

pub fn catalog(voices: &[VoiceSummary]) -> Value {
    let voice_options: Vec<Value> = if voices.is_empty() {
        vec![json!({"label": "Rachel", "value": DEFAULT_VOICE_ID})]
    } else {
        voices
            .iter()
            .map(|voice| json!({"label": voice.name, "value": voice.voice_id}))
            .collect()
    };
    Value::Array(vec![
        tts_model(
            "eleven_multilingual_v2",
            "Multilingual v2",
            &voice_options,
            true,
        ),
        tts_model("eleven_v3", "Eleven v3", &voice_options, false),
        tts_model("eleven_turbo_v2_5", "Turbo v2.5", &voice_options, false),
        tts_model("eleven_flash_v2_5", "Flash v2.5", &voice_options, false),
        music_model(),
        sfx_model(),
    ])
}

fn tts_model(model: &str, name: &str, voices: &[Value], default_model: bool) -> Value {
    json!({
        "id": encode_model_ref(ElevenTool::Tts, model),
        "name": name,
        "provider": "elevenlabs",
        "provider_name": "ElevenLabs",
        "provider_tool": "tts",
        "provider_model": model,
        "supports_estimate": true,
        "estimate_unit": "credits",
        "description": "Text to speech",
        "output_type": "audio",
        "parameters": [
            {"name": "text", "required": "required", "type": "string", "format": "textarea", "description": "Text to synthesize"},
            {"name": "voice_id", "required": "required", "type": "string", "default": DEFAULT_VOICE_ID, "options": voices},
            {"name": "language_code", "required": "optional", "type": "string"},
            {"name": "stability", "required": "optional", "type": "number", "min": 0, "max": 1},
            {"name": "similarity_boost", "required": "optional", "type": "number", "min": 0, "max": 1},
            {"name": "style", "required": "optional", "type": "number", "min": 0, "max": 1},
            {"name": "speed", "required": "optional", "type": "number", "min": 0.7, "max": 1.2},
            {"name": "output_format", "required": "optional", "type": "string", "default": DEFAULT_OUTPUT_FORMAT, "options": output_formats(false)},
        ],
        "medias": [],
        "aspect_ratios": [],
        "tags": ["elevenlabs", "tts", if default_model {"default"} else {"speech"}],
        "result_count": 1,
    })
}

fn music_model() -> Value {
    json!({
        "id": encode_model_ref(ElevenTool::Music, "music_v2"),
        "name": "Music v2",
        "provider": "elevenlabs",
        "provider_name": "ElevenLabs",
        "provider_tool": "music",
        "provider_model": "music_v2",
        "supports_estimate": true,
        "estimate_unit": "credits",
        "description": "Music generation",
        "output_type": "audio",
        "parameters": [
            {"name": "prompt", "required": "required", "type": "string", "format": "textarea"},
            {"name": "music_length_ms", "required": "optional", "type": "number", "min": 3000, "max": 600000},
            {"name": "force_instrumental", "required": "optional", "type": "bool"},
            {"name": "output_format", "required": "optional", "type": "string", "default": DEFAULT_OUTPUT_FORMAT, "options": output_formats(true)},
        ],
        "medias": [], "aspect_ratios": [], "tags": ["elevenlabs", "music"], "result_count": 1,
    })
}

fn sfx_model() -> Value {
    json!({
        "id": encode_model_ref(ElevenTool::Sfx, "eleven_text_to_sound_v2"),
        "name": "Text to Sound v2",
        "provider": "elevenlabs",
        "provider_name": "ElevenLabs",
        "provider_tool": "sfx",
        "provider_model": "eleven_text_to_sound_v2",
        "supports_estimate": true,
        "estimate_unit": "credits",
        "description": "Sound effects generation",
        "output_type": "audio",
        "parameters": [
            {"name": "text", "required": "required", "type": "string", "format": "textarea"},
            {"name": "duration_seconds", "required": "optional", "type": "number", "min": 0.5, "max": 30},
            {"name": "prompt_influence", "required": "optional", "type": "number", "min": 0, "max": 1},
            {"name": "loop", "required": "optional", "type": "bool"},
            {"name": "output_format", "required": "optional", "type": "string", "default": DEFAULT_OUTPUT_FORMAT, "options": output_formats(false)},
        ],
        "medias": [], "aspect_ratios": [], "tags": ["elevenlabs", "sfx"], "result_count": 1,
    })
}

fn output_formats(music: bool) -> Vec<&'static str> {
    let mut formats = vec!["mp3_44100_128", "mp3_44100_192", "opus_48000_128"];
    if music {
        formats.push("mp3_48000_192");
    }
    formats
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_ref_codec_requires_exact_tool_and_model_segments() {
        for tool in ElevenTool::ALL {
            let model = match tool {
                ElevenTool::Tts => "eleven_multilingual_v2",
                ElevenTool::Music => "music_v2",
                ElevenTool::Sfx => "eleven_text_to_sound_v2",
            };
            let encoded = encode_model_ref(tool, model);
            let decoded = parse_model_ref(&encoded).unwrap();
            assert_eq!(decoded.tool, tool);
            assert_eq!(decoded.model, model);
        }
        assert!(parse_model_ref("elevenlabs/tts/one/two").is_err());
        assert!(parse_model_ref("elevenlabs/tts/unknown").is_err());
    }

    #[test]
    fn static_catalog_has_six_audio_models_and_contract_ranges() {
        let models = catalog(&[]);
        assert_eq!(models.as_array().unwrap().len(), 6);
        assert!(models
            .as_array()
            .unwrap()
            .iter()
            .all(|m| m["output_type"] == "audio" && m["medias"].as_array().unwrap().is_empty()));
        let music = &models.as_array().unwrap()[4];
        assert_eq!(music["parameters"][1]["min"], 3000);
        assert_eq!(music["parameters"][1]["max"], 600000);
        assert_eq!(models[0]["parameters"][1]["default"], DEFAULT_VOICE_ID);
        assert!(models.as_array().unwrap().iter().all(|model| {
            model["supports_estimate"] == true && model["estimate_unit"] == "credits"
        }));
    }

    #[test]
    fn live_voice_options_use_name_as_label_and_id_as_value() {
        let voices = vec![VoiceSummary {
            voice_id: "voice-1".into(),
            name: "Test Voice".into(),
            category: Some("premade".into()),
        }];
        assert_eq!(
            catalog(&voices)[0]["parameters"][1]["options"][0],
            json!({"label":"Test Voice","value":"voice-1"})
        );
    }
}
