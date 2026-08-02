//! Pure ElevenLabs credit estimates. This module never owns an HTTP client.

use super::elevenlabs_catalog::{parse_model_ref, ElevenTool};
use serde_json::Value;

const DEFAULT_MUSIC_SECONDS: f64 = 10.0;
const DEFAULT_SFX_SECONDS: f64 = 5.0;

// Source: https://elevenlabs.io/pricing (checked 2026-08-02): V2 Multilingual
// models use approximately 1 credit per generated text character.
const TTS_STANDARD_CREDITS_PER_CHARACTER: f64 = 1.0;
// Source: https://elevenlabs.io/pricing (checked 2026-08-02): V2 Flash/Turbo
// API usage has discounted pricing between 0.5 and 1 credit per character;
// the self-serve API rate is 0.5 credits per character.
const TTS_FLASH_TURBO_CREDITS_PER_CHARACTER: f64 = 0.5;
// Source: https://elevenlabs.io/pricing (checked 2026-08-02): Eleven Music is
// approximately 900 credits per minute, or 15 credits per generated second.
const MUSIC_CREDITS_PER_SECOND: f64 = 15.0;
// Source: https://elevenlabs.io/docs/help-center/product/content-production/sound-effects/how-much-does-it-cost-to-generate-sound-effects
// (checked 2026-08-02): API sound effects with an explicit duration cost 11
// credits per second. The estimate policy supplies a five-second default when
// the form leaves duration unspecified.
const SFX_CREDITS_PER_SECOND: f64 = 11.0;

pub fn estimate(kind: &str, params: &Value) -> Result<f64, String> {
    if kind != "audio" {
        return Err(format!(
            "eleven-validation: ElevenLabs estimates only support audio, got {kind}"
        ));
    }
    let model = params
        .get("model")
        .and_then(Value::as_str)
        .ok_or("eleven-validation: model is required")?;
    let parsed = parse_model_ref(model)?;

    match parsed.tool {
        ElevenTool::Tts => {
            let text = params
                .get("text")
                .and_then(Value::as_str)
                .ok_or("eleven-validation: text is required")?;
            let rate = if matches!(
                parsed.model.as_str(),
                "eleven_flash_v2_5" | "eleven_turbo_v2_5"
            ) {
                TTS_FLASH_TURBO_CREDITS_PER_CHARACTER
            } else {
                TTS_STANDARD_CREDITS_PER_CHARACTER
            };
            Ok(text.chars().count() as f64 * rate)
        }
        ElevenTool::Music => Ok(number_or_default(
            params,
            "music_length_ms",
            DEFAULT_MUSIC_SECONDS * 1_000.0,
        )? / 1_000.0
            * MUSIC_CREDITS_PER_SECOND),
        ElevenTool::Sfx => Ok(
            number_or_default(params, "duration_seconds", DEFAULT_SFX_SECONDS)?
                * SFX_CREDITS_PER_SECOND,
        ),
    }
}

fn number_or_default(params: &Value, name: &str, default: f64) -> Result<f64, String> {
    match params.get(name) {
        None | Some(Value::Null) => Ok(default),
        Some(value) => value
            .as_f64()
            .ok_or_else(|| format!("eleven-validation: {name} must be a number")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn uses_rune_count_for_standard_and_discounted_tts_models() {
        let params = json!({
            "model": "elevenlabs/tts/eleven_multilingual_v2",
            "text": "가나다😀"
        });
        assert_eq!(estimate("audio", &params).unwrap(), 4.0);

        let params = json!({
            "model": "elevenlabs/tts/eleven_flash_v2_5",
            "text": "가나다😀"
        });
        assert_eq!(estimate("audio", &params).unwrap(), 2.0);
    }

    #[test]
    fn uses_length_defaults_for_music_and_sfx() {
        assert_eq!(
            estimate(
                "audio",
                &json!({"model": "elevenlabs/music/music_v2", "prompt": "calm"})
            )
            .unwrap(),
            150.0
        );
        assert_eq!(
            estimate(
                "audio",
                &json!({"model": "elevenlabs/sfx/eleven_text_to_sound_v2", "text": "rain"})
            )
            .unwrap(),
            55.0
        );
    }

    #[test]
    fn uses_explicit_music_and_sfx_lengths() {
        assert_eq!(
            estimate(
                "audio",
                &json!({
                    "model": "elevenlabs/music/music_v2",
                    "prompt": "calm",
                    "music_length_ms": 3_000
                })
            )
            .unwrap(),
            45.0
        );
        assert_eq!(
            estimate(
                "audio",
                &json!({
                    "model": "elevenlabs/sfx/eleven_text_to_sound_v2",
                    "text": "rain",
                    "duration_seconds": 2.5
                })
            )
            .unwrap(),
            27.5
        );
    }

    #[test]
    fn estimate_is_local_and_does_not_need_a_network_client() {
        let params = json!({
            "model": "elevenlabs/tts/eleven_multilingual_v2",
            "text": "offline"
        });
        // There is deliberately no client or endpoint in this call. If this
        // path regresses into HTTP, it cannot resolve a provider URL here.
        assert_eq!(estimate("audio", &params).unwrap(), 7.0);
    }
}
