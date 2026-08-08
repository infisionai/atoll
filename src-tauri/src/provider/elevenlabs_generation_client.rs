//! Single-shot ElevenLabs audio generation client.

use super::elevenlabs_requests::{MusicCall, SfxCall, TtsCall};
use super::secrets::ApiKey;
use serde_json::Value;
use std::time::Duration;

pub const GENERATION_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ElevenFailureClass {
    Permanent,
    Retryable,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ElevenFailure {
    pub class: ElevenFailureClass,
    pub message: String,
    pub detail: Option<Value>,
}

impl std::fmt::Display for ElevenFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

pub fn parse_error_detail(value: &Value) -> Option<Value> {
    ["detail", "error", "message"]
        .iter()
        .find_map(|key| value.get(*key).cloned())
}

pub fn classify_status(status: reqwest::StatusCode, detail: Option<Value>) -> ElevenFailure {
    let (class, message) = match status {
        reqwest::StatusCode::UNAUTHORIZED => (
            ElevenFailureClass::Permanent,
            "eleven-key-invalid: ElevenLabs rejected the API key; reconnect ElevenLabs",
        ),
        reqwest::StatusCode::PAYMENT_REQUIRED => (
            ElevenFailureClass::Permanent,
            "eleven-credits: ElevenLabs credits or quota are unavailable; check your balance",
        ),
        reqwest::StatusCode::UNPROCESSABLE_ENTITY => (
            ElevenFailureClass::Permanent,
            "eleven-validation: ElevenLabs rejected the request fields",
        ),
        reqwest::StatusCode::TOO_MANY_REQUESTS => (
            ElevenFailureClass::Retryable,
            "eleven-retryable: ElevenLabs is rate limiting requests; retry manually later",
        ),
        status if status.is_server_error() => (
            ElevenFailureClass::Retryable,
            "eleven-retryable: ElevenLabs is temporarily unavailable; retry manually later",
        ),
        _ => (
            ElevenFailureClass::Permanent,
            "eleven-validation: ElevenLabs rejected the request",
        ),
    };
    ElevenFailure {
        class,
        message: message.into(),
        detail,
    }
}

pub fn timeout_failure() -> ElevenFailure {
    ElevenFailure {
        class: ElevenFailureClass::Permanent,
        message: "eleven-submit-timeout: result status unknown; run again manually".into(),
        detail: None,
    }
}

pub struct ElevenLabsGenerationClient {
    base_url: String,
    http: reqwest::Client,
}

impl ElevenLabsGenerationClient {
    #[allow(dead_code)]
    pub fn with_base_url(base_url: impl Into<String>) -> Self {
        Self::with_base_url_and_timeout(base_url, GENERATION_TIMEOUT)
    }

    pub(crate) fn with_base_url_and_timeout(
        base_url: impl Into<String>,
        timeout: Duration,
    ) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            http: reqwest::Client::builder()
                .timeout(timeout)
                .build()
                .expect("ElevenLabs generation HTTP client must be constructible"),
        }
    }

    fn url(&self, path: &str) -> Result<String, String> {
        if !path.starts_with('/') || path.starts_with("//") || path.contains("://") {
            return Err("eleven-validation: invalid ElevenLabs relative path".into());
        }
        Ok(format!("{}{path}", self.base_url))
    }

    async fn send(
        &self,
        key: &ApiKey,
        path: &str,
        output_format: &str,
        body: Value,
    ) -> Result<Vec<u8>, String> {
        let url = self.url(path)?;
        let url = format!("{url}?output_format={output_format}");
        let response = self
            .http
            .post(url)
            .header("xi-api-key", key.as_str())
            .header(reqwest::header::ACCEPT, "audio/mpeg")
            .json(&body)
            .send()
            .await
            .map_err(|error| {
                let failure = if error.is_timeout() {
                    timeout_failure()
                } else {
                    ElevenFailure {
                        class: ElevenFailureClass::Retryable,
                        message: "eleven-retryable: generation connection failed; result status unknown; run again manually".into(),
                        detail: None,
                    }
                };
                key.redact(failure.to_string())
            })?;

        let status = response.status();
        if !status.is_success() {
            let body = response.bytes().await.unwrap_or_default();
            let value = serde_json::from_slice::<Value>(&body).unwrap_or(Value::Null);
            let failure = classify_status(status, parse_error_detail(&value));
            return Err(key.redact(failure.to_string()));
        }

        let bytes = response.bytes().await.map_err(|error| {
            let failure = if error.is_timeout() {
                timeout_failure()
            } else {
                ElevenFailure {
                    class: ElevenFailureClass::Retryable,
                    message: "eleven-retryable: generation response read failed; result status unknown; run again manually".into(),
                    detail: None,
                }
            };
            key.redact(failure.to_string())
        })?;
        if bytes.is_empty() {
            return Err("eleven-result-empty: ElevenLabs returned an empty audio result".into());
        }
        Ok(bytes.to_vec())
    }

    pub async fn generate_tts(&self, key: &ApiKey, call: &TtsCall) -> Result<Vec<u8>, String> {
        self.send(
            key,
            &format!("/v1/text-to-speech/{}", call.voice_id),
            &call.output_format,
            serde_json::to_value(&call.request).map_err(|error| error.to_string())?,
        )
        .await
    }

    pub async fn generate_music(&self, key: &ApiKey, call: &MusicCall) -> Result<Vec<u8>, String> {
        self.send(
            key,
            "/v1/music",
            &call.output_format,
            serde_json::to_value(&call.request).map_err(|error| error.to_string())?,
        )
        .await
    }

    pub async fn generate_sfx(&self, key: &ApiKey, call: &SfxCall) -> Result<Vec<u8>, String> {
        self.send(
            key,
            "/v1/sound-generation",
            &call.output_format,
            call.request.json(),
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::elevenlabs_requests::build_tts_request;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};
    use std::thread::JoinHandle;

    struct FakeHttpServer {
        base_url: String,
        request: Arc<Mutex<String>>,
        thread: Option<JoinHandle<()>>,
    }

    impl FakeHttpServer {
        fn new(status: u16, body: &str) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let request = Arc::new(Mutex::new(String::new()));
            let captured = Arc::clone(&request);
            let body = body.to_string();
            let thread = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut bytes = [0u8; 8192];
                let size = stream.read(&mut bytes).unwrap();
                *captured.lock().unwrap() = String::from_utf8_lossy(&bytes[..size]).into_owned();
                let reason = if status == 200 { "OK" } else { "Error" };
                write!(
                    stream,
                    "HTTP/1.1 {status} {reason}\r\nContent-Type: audio/mpeg\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
            });
            Self {
                base_url: format!("http://{address}"),
                request,
                thread: Some(thread),
            }
        }

        fn request(&self) -> String {
            self.request.lock().unwrap().clone()
        }
    }

    impl Drop for FakeHttpServer {
        fn drop(&mut self) {
            if let Some(thread) = self.thread.take() {
                thread.join().unwrap();
            }
        }
    }

    #[tokio::test]
    async fn generation_client_uses_audio_headers_and_never_calls_a_real_endpoint() {
        let server = FakeHttpServer::new(200, "fake-audio");
        let key = ApiKey::new("fake-generation-key").unwrap();
        let call = build_tts_request(&serde_json::json!({
            "model": "elevenlabs/tts/eleven_v3",
            "text": "hello",
            "voice_id": "voice-1",
            "output_format": "opus_48000_128"
        }))
        .unwrap();
        let bytes = ElevenLabsGenerationClient::with_base_url(&server.base_url)
            .generate_tts(&key, &call)
            .await
            .unwrap();
        assert_eq!(bytes, b"fake-audio");
        let request = server.request().to_ascii_lowercase();
        assert!(request.starts_with("post /v1/text-to-speech/voice-1?output_format=opus_48000_128"));
        assert!(request.contains("accept: audio/mpeg"));
        assert!(request.contains("xi-api-key: fake-generation-key"));
        assert!(request.contains("\"model_id\":\"eleven_v3\""));
        assert!(!request
            .split("\r\n\r\n")
            .last()
            .unwrap_or_default()
            .contains("generation-key"));
    }

    #[tokio::test]
    async fn empty_generation_response_is_permanent_failure() {
        let server = FakeHttpServer::new(200, "");
        let key = ApiKey::new("fake-generation-key").unwrap();
        let call = build_tts_request(&serde_json::json!({
            "model": "elevenlabs/tts/eleven_v3",
            "text": "hello"
        }))
        .unwrap();
        let error = ElevenLabsGenerationClient::with_base_url(&server.base_url)
            .generate_tts(&key, &call)
            .await
            .unwrap_err();
        assert!(error.starts_with("eleven-result-empty"));
    }

    #[test]
    fn error_detail_and_status_matrix_are_stable() {
        let detail = serde_json::json!({"detail": {"status": "invalid"}});
        assert_eq!(parse_error_detail(&detail), Some(detail["detail"].clone()));
        assert_eq!(
            classify_status(reqwest::StatusCode::UNAUTHORIZED, None).class,
            ElevenFailureClass::Permanent
        );
        assert_eq!(
            classify_status(reqwest::StatusCode::PAYMENT_REQUIRED, None).class,
            ElevenFailureClass::Permanent
        );
        assert_eq!(
            classify_status(reqwest::StatusCode::UNPROCESSABLE_ENTITY, None).class,
            ElevenFailureClass::Permanent
        );
        assert_eq!(
            classify_status(reqwest::StatusCode::TOO_MANY_REQUESTS, None).class,
            ElevenFailureClass::Retryable
        );
        assert_eq!(
            classify_status(reqwest::StatusCode::INTERNAL_SERVER_ERROR, None).class,
            ElevenFailureClass::Retryable
        );
        assert_eq!(timeout_failure().class, ElevenFailureClass::Permanent);
    }
}
