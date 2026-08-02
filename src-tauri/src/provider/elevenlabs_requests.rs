//! Pure conversion from the canvas parameter object to ElevenLabs request bodies.

use super::elevenlabs_catalog::{parse_model_ref, ElevenTool, DEFAULT_OUTPUT_FORMAT};
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeSet;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct VoiceSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stability: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub similarity_boost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TtsRequest {
    pub text: String,
    pub model_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voice_settings: Option<VoiceSettings>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct MusicRequest {
    pub prompt: String,
    pub model_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub music_length_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub force_instrumental: Option<bool>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SfxRequest {
    pub text: String,
    pub model_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_influence: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "loop")]
    pub loop_: Option<bool>,
}

impl SfxRequest {
    pub fn json(&self) -> Value {
        serde_json::to_value(self).expect("SfxRequest is serializable")
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct TtsCall {
    pub voice_id: String,
    pub output_format: String,
    pub request: TtsRequest,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MusicCall {
    pub output_format: String,
    pub request: MusicRequest,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SfxCall {
    pub output_format: String,
    pub request: SfxRequest,
}

pub fn build_tts_request(params: &Value) -> Result<TtsCall, String> {
    let model = model_for(params, ElevenTool::Tts)?;
    reject_unknown(
        params,
        &[
            "model",
            "text",
            "voice_id",
            "language_code",
            "stability",
            "similarity_boost",
            "style",
            "speed",
            "output_format",
        ],
    )?;
    let text = required_string(params, "text")?;
    let voice_id = params
        .get("voice_id")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or(super::elevenlabs_catalog::DEFAULT_VOICE_ID)
        .to_string();
    if voice_id.contains('/') || voice_id.chars().any(char::is_control) {
        return Err("eleven-validation: voice_id is invalid".into());
    }
    let output_format = output_format(params, false)?;
    let settings = VoiceSettings {
        stability: bounded_optional(params, "stability", 0.0, 1.0)?,
        similarity_boost: bounded_optional(params, "similarity_boost", 0.0, 1.0)?,
        style: bounded_optional(params, "style", 0.0, 1.0)?,
        speed: bounded_optional(params, "speed", 0.7, 1.2)?,
    };
    let voice_settings = (settings.stability.is_some()
        || settings.similarity_boost.is_some()
        || settings.style.is_some()
        || settings.speed.is_some())
    .then_some(settings);
    Ok(TtsCall {
        voice_id,
        output_format,
        request: TtsRequest {
            text,
            model_id: model,
            language_code: optional_string(params, "language_code")?,
            voice_settings,
        },
    })
}

pub fn build_music_request(params: &Value) -> Result<MusicCall, String> {
    let model = model_for(params, ElevenTool::Music)?;
    reject_unknown(
        params,
        &[
            "model",
            "prompt",
            "music_length_ms",
            "force_instrumental",
            "output_format",
        ],
    )?;
    let music_length_ms =
        Some(optional_u64(params, "music_length_ms", 3_000, 600_000)?.unwrap_or(10_000));
    Ok(MusicCall {
        output_format: output_format(params, true)?,
        request: MusicRequest {
            prompt: required_string(params, "prompt")?,
            model_id: model,
            music_length_ms,
            force_instrumental: optional_bool(params, "force_instrumental")?,
        },
    })
}

pub fn build_sfx_request(params: &Value) -> Result<SfxCall, String> {
    let model = model_for(params, ElevenTool::Sfx)?;
    reject_unknown(
        params,
        &[
            "model",
            "text",
            "duration_seconds",
            "prompt_influence",
            "loop",
            "output_format",
        ],
    )?;
    Ok(SfxCall {
        output_format: output_format(params, false)?,
        request: SfxRequest {
            text: required_string(params, "text")?,
            model_id: model,
            duration_seconds: Some(
                bounded_optional(params, "duration_seconds", 0.5, 30.0)?.unwrap_or(5.0),
            ),
            prompt_influence: bounded_optional(params, "prompt_influence", 0.0, 1.0)?,
            loop_: optional_bool(params, "loop")?,
        },
    })
}

fn model_for(params: &Value, expected: ElevenTool) -> Result<String, String> {
    let model = params
        .get("model")
        .and_then(Value::as_str)
        .ok_or("eleven-validation: model is required")?;
    let parsed = parse_model_ref(model)?;
    if parsed.tool != expected {
        return Err(format!(
            "eleven-validation: model tool does not match generation kind: {model}"
        ));
    }
    Ok(parsed.model)
}

fn reject_unknown(params: &Value, allowed: &[&str]) -> Result<(), String> {
    let object = params
        .as_object()
        .ok_or("eleven-validation: generation parameters must be an object")?;
    let allowed: BTreeSet<_> = allowed.iter().copied().collect();
    if let Some(name) = object.keys().find(|name| !allowed.contains(name.as_str())) {
        return Err(format!("eleven-validation: unsupported parameter: {name}"));
    }
    Ok(())
}

fn required_string(params: &Value, name: &str) -> Result<String, String> {
    params
        .get(name)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("eleven-validation: {name} is required"))
}

fn optional_string(params: &Value, name: &str) -> Result<Option<String>, String> {
    match params.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_str()
            .filter(|value| !value.trim().is_empty())
            .map(|value| Some(value.to_string()))
            .ok_or_else(|| format!("eleven-validation: {name} must be a non-empty string")),
    }
}

fn bounded_optional(params: &Value, name: &str, min: f64, max: f64) -> Result<Option<f64>, String> {
    match params.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => {
            let number = value
                .as_f64()
                .filter(|number| number.is_finite())
                .ok_or_else(|| format!("eleven-validation: {name} must be a number"))?;
            if !(min..=max).contains(&number) {
                return Err(format!(
                    "eleven-validation: {name} must be between {min} and {max}"
                ));
            }
            Ok(Some(number))
        }
    }
}

fn optional_u64(params: &Value, name: &str, min: u64, max: u64) -> Result<Option<u64>, String> {
    match params.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => {
            let number = value
                .as_u64()
                .ok_or_else(|| format!("eleven-validation: {name} must be an integer"))?;
            if !(min..=max).contains(&number) {
                return Err(format!(
                    "eleven-validation: {name} must be between {min} and {max}"
                ));
            }
            Ok(Some(number))
        }
    }
}

fn optional_bool(params: &Value, name: &str) -> Result<Option<bool>, String> {
    match params.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_bool()
            .map(Some)
            .ok_or_else(|| format!("eleven-validation: {name} must be a boolean")),
    }
}

fn output_format(params: &Value, music: bool) -> Result<String, String> {
    let format = params
        .get("output_format")
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_OUTPUT_FORMAT);
    let allowed = match (music, format) {
        (_, "mp3_44100_128" | "mp3_44100_192" | "opus_48000_128") => true,
        (true, "mp3_48000_192") => true,
        _ => false,
    };
    if !allowed {
        return Err(format!(
            "eleven-validation: unsupported output_format: {format}"
        ));
    }
    Ok(format.to_string())
}

pub fn output_extension(output_format: &str) -> &'static str {
    if output_format.starts_with("mp3_") {
        "mp3"
    } else if output_format.starts_with("opus_") {
        "ogg"
    } else {
        "bin"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn builds_golden_tts_body_and_default_query() {
        let call = build_tts_request(&json!({
            "model": "elevenlabs/tts/eleven_multilingual_v2",
            "text": "hello",
            "voice_id": "voice-1",
            "stability": 0.5,
            "speed": 1.1,
        }))
        .unwrap();
        assert_eq!(call.output_format, DEFAULT_OUTPUT_FORMAT);
        assert_eq!(call.voice_id, "voice-1");
        assert_eq!(
            serde_json::to_value(call.request).unwrap(),
            json!({
                "text": "hello",
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {"stability": 0.5, "speed": 1.1}
            })
        );
    }

    #[test]
    fn builds_music_and_sfx_with_explicit_default_lengths() {
        let music = build_music_request(&json!({
            "model": "elevenlabs/music/music_v2",
            "prompt": "quiet piano",
            "output_format": "mp3_48000_192"
        }))
        .unwrap();
        assert_eq!(
            serde_json::to_value(&music.request).unwrap()["model_id"],
            "music_v2"
        );
        assert_eq!(
            serde_json::to_value(&music.request).unwrap()["music_length_ms"],
            10_000
        );

        let sfx = build_sfx_request(&json!({
            "model": "elevenlabs/sfx/eleven_text_to_sound_v2",
            "text": "rain"
        }))
        .unwrap();
        assert_eq!(sfx.request.json()["text"], "rain");
        assert_eq!(sfx.request.json()["duration_seconds"], 5.0);
        assert!(!sfx.request.json().as_object().unwrap().contains_key("loop"));
    }

    #[test]
    fn rejects_unknown_fields_and_out_of_range_values() {
        let error = build_sfx_request(&json!({
            "model": "elevenlabs/sfx/eleven_text_to_sound_v2",
            "text": "rain",
            "duration_seconds": 31
        }))
        .unwrap_err();
        assert!(error.starts_with("eleven-validation"));

        let error = build_tts_request(&json!({
            "model": "elevenlabs/tts/eleven_v3",
            "text": "hello",
            "unexpected": true
        }))
        .unwrap_err();
        assert!(error.contains("unsupported parameter"));
    }

    #[test]
    fn voice_settings_are_absent_when_all_knobs_are_absent() {
        let call = build_tts_request(&json!({
            "model": "elevenlabs/tts/eleven_v3",
            "text": "hello"
        }))
        .unwrap();
        assert!(call.request.voice_settings.is_none());
    }

    #[test]
    fn output_format_maps_to_the_media_cache_extension() {
        assert_eq!(output_extension("mp3_44100_128"), "mp3");
        assert_eq!(output_extension("opus_48000_128"), "ogg");
        assert_eq!(output_extension("unknown"), "bin");
    }
}
