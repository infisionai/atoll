use std::fmt;

/// An API key whose formatting never exposes the underlying secret.
///
/// The key is intentionally not serializable or cloneable through serde. Callers must
/// explicitly opt into the raw value when constructing an authenticated HTTP request.
#[derive(Clone, PartialEq, Eq)]
pub struct ApiKey(String);

impl ApiKey {
    pub fn new(value: impl Into<String>) -> Result<Self, String> {
        let value = value.into().trim().to_string();
        if value.is_empty() {
            return Err("eleven-key-required: enter an ElevenLabs API key".into());
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Redact this key from an error or diagnostic message before it can be surfaced.
    pub fn redact(&self, message: impl AsRef<str>) -> String {
        message.as_ref().replace(self.as_str(), "[REDACTED]")
    }
}

impl fmt::Debug for ApiKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("ApiKey([REDACTED])")
    }
}

impl fmt::Display for ApiKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("[REDACTED]")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_and_display_redact_the_key() {
        let key = ApiKey::new("test-api-key-123").unwrap();
        assert!(!format!("{key:?}").contains("test-api-key-123"));
        assert!(!key.to_string().contains("test-api-key-123"));
        assert_eq!(
            key.redact("request failed for test-api-key-123"),
            "request failed for [REDACTED]"
        );
    }

    #[test]
    fn blank_keys_are_rejected_without_echoing_input() {
        let error = ApiKey::new("  ").unwrap_err();
        assert_eq!(error, "eleven-key-required: enter an ElevenLabs API key");
    }
}
