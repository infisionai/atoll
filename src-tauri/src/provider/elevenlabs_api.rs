use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The remaining ElevenLabs credit balance derived from the subscription response.
/// ElevenLabs exposes the included allowance as character_count/character_limit.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SubscriptionBalance {
    pub remaining_credits: f64,
}

#[cfg_attr(not(test), allow(dead_code))]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSummary {
    pub voice_id: String,
    pub name: String,
    pub category: Option<String>,
}

/// Parse only the fixed subscription contract. Do not replace this with a generic recursive
/// number search: character_count and character_limit are the documented fields used here.
pub fn parse_subscription(value: &Value) -> Result<SubscriptionBalance, String> {
    let used = value
        .get("character_count")
        .and_then(Value::as_u64)
        .ok_or_else(|| "eleven-subscription-invalid: character_count is missing".to_string())?;
    let limit = value
        .get("character_limit")
        .and_then(Value::as_u64)
        .ok_or_else(|| "eleven-subscription-invalid: character_limit is missing".to_string())?;
    if used > limit {
        return Err("eleven-subscription-invalid: character_count exceeds character_limit".into());
    }
    Ok(SubscriptionBalance {
        remaining_credits: (limit - used) as f64,
    })
}

/// Extract the intentionally small voice contract used by the catalog layer. Preview URLs and
/// all other account/PII-bearing fields are ignored by design.
#[cfg_attr(not(test), allow(dead_code))]
pub fn parse_voices(value: &Value) -> Result<Vec<VoiceSummary>, String> {
    let voices = value
        .get("voices")
        .and_then(Value::as_array)
        .ok_or_else(|| "eleven-voices-invalid: voices is missing".to_string())?;
    voices
        .iter()
        .map(|voice| {
            let voice_id = voice
                .get("voice_id")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "eleven-voices-invalid: voice_id is missing".to_string())?;
            let name = voice
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| "eleven-voices-invalid: name is missing".to_string())?;
            let category = voice
                .get("category")
                .and_then(|value| (!value.is_null()).then(|| value.as_str()).flatten())
                .map(str::to_string);
            Ok(VoiceSummary {
                voice_id: voice_id.to_string(),
                name: name.to_string(),
                category,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_redacted_subscription_fixture() {
        let value: Value = serde_json::from_str(include_str!("fixtures/eleven-subscription.min.json")).unwrap();
        let balance = parse_subscription(&value).unwrap();
        assert_eq!(balance.remaining_credits, 8_800.0);
    }

    #[test]
    fn parses_only_the_voice_contract_from_the_fixture() {
        let value: Value = serde_json::from_str(include_str!("fixtures/eleven-voices.min.json")).unwrap();
        let voices = parse_voices(&value).unwrap();
        assert_eq!(voices.len(), 3);
        assert_eq!(voices[0].voice_id, "voice-fictitious-001");
        assert_eq!(voices[0].category.as_deref(), Some("premade"));
        assert!(!serde_json::to_string(&voices).unwrap().contains("preview"));
    }

    #[test]
    fn subscription_parser_requires_the_documented_fields() {
        let error = parse_subscription(&serde_json::json!({"credits": 10})).unwrap_err();
        assert!(error.starts_with("eleven-subscription-invalid"));
    }

}
