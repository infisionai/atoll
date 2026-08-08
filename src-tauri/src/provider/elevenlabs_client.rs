use super::elevenlabs_api::{parse_subscription, parse_voices, SubscriptionBalance, VoiceSummary};
use super::secrets::ApiKey;
use serde_json::Value;
use std::time::Duration;

pub const DEFAULT_BASE_URL: &str = "https://api.elevenlabs.io";
const READ_TIMEOUT: Duration = Duration::from_secs(15);

/// 401 body → stable user-facing message. A key can be real yet created without the
/// permissions the read-only endpoints need (detail.status == "missing_permissions").
fn unauthorized_message(body: &Value) -> String {
    let missing_permissions = body
        .get("detail")
        .and_then(|detail| detail.get("status"))
        .and_then(Value::as_str)
        == Some("missing_permissions");
    if missing_permissions {
        "eleven-key-permissions: the API key is missing required permissions — create a key with User read (balance) and Voices read access"
            .into()
    } else {
        "eleven-key-invalid: ElevenLabs rejected the API key".into()
    }
}

pub struct ElevenLabsClient {
    base_url: String,
    http: reqwest::Client,
}

impl ElevenLabsClient {
    pub fn with_base_url(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            http: reqwest::Client::builder()
                .timeout(READ_TIMEOUT)
                .build()
                .expect("ElevenLabs read-only HTTP client must be constructible"),
        }
    }

    fn url(&self, path: &str) -> Result<String, String> {
        if !path.starts_with('/') || path.starts_with("//") || path.contains("://") {
            return Err("eleven-validation: invalid ElevenLabs relative path".into());
        }
        Ok(format!("{}{path}", self.base_url))
    }

    pub async fn get_subscription(&self, key: &ApiKey) -> Result<SubscriptionBalance, String> {
        let url = self.url("/v1/user/subscription")?;
        let response = self
            .http
            .get(url)
            .header("xi-api-key", key.as_str())
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(|error| {
                key.redact(format!(
                    "eleven-validation: subscription request failed: {error}"
                ))
            })?;
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            let body = response.json::<Value>().await.unwrap_or(Value::Null);
            return Err(unauthorized_message(&body));
        }
        if !status.is_success() {
            return Err(format!(
                "eleven-validation: subscription request failed (HTTP {})",
                status.as_u16()
            ));
        }
        let body = response.json::<Value>().await.map_err(|error| {
            format!("eleven-subscription-invalid: invalid subscription response: {error}")
        })?;
        parse_subscription(&body)
    }

    pub async fn get_voices(&self, key: &ApiKey) -> Result<Vec<VoiceSummary>, String> {
        let url = self.url("/v2/voices")?;
        let response = self
            .http
            .get(url)
            .header("xi-api-key", key.as_str())
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(|error| {
                key.redact(format!("eleven-validation: voices request failed: {error}"))
            })?;
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            let body = response.json::<Value>().await.unwrap_or(Value::Null);
            return Err(unauthorized_message(&body));
        }
        if !status.is_success() {
            return Err(format!(
                "eleven-validation: voices request failed (HTTP {})",
                status.as_u16()
            ));
        }
        let body = response
            .json::<Value>()
            .await
            .map_err(|error| format!("eleven-voices-invalid: invalid voices response: {error}"))?;
        parse_voices(&body)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
                    "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
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
    async fn subscription_client_uses_local_fake_http_and_redacts_failures() {
        let fixture: Value =
            serde_json::from_str(include_str!("fixtures/eleven-subscription.min.json")).unwrap();
        let server = FakeHttpServer::new(200, &fixture.to_string());
        let key = ApiKey::new("fake-key-for-local-test").unwrap();
        let result = ElevenLabsClient::with_base_url(&server.base_url)
            .get_subscription(&key)
            .await
            .unwrap();
        assert_eq!(result.remaining_credits, 8_800.0);
        let request = server.request();
        assert!(request.starts_with("GET /v1/user/subscription HTTP/1.1"));
        assert!(request
            .to_ascii_lowercase()
            .contains("xi-api-key: fake-key-for-local-test"));
    }

    #[tokio::test]
    async fn subscription_client_maps_401_without_echoing_the_key() {
        let server = FakeHttpServer::new(401, r#"{"detail":"invalid"}"#);
        let key = ApiKey::new("fake-key-for-local-test").unwrap();
        let error = ElevenLabsClient::with_base_url(&server.base_url)
            .get_subscription(&key)
            .await
            .unwrap_err();
        assert_eq!(error, "eleven-key-invalid: ElevenLabs rejected the API key");
        assert!(!error.contains(key.as_str()));
    }

    #[tokio::test]
    async fn restricted_key_401_reports_missing_permissions() {
        let server = FakeHttpServer::new(
            401,
            r#"{"detail":{"status":"missing_permissions","message":"not surfaced"}}"#,
        );
        let key = ApiKey::new("fake-key-for-local-test").unwrap();
        let error = ElevenLabsClient::with_base_url(&server.base_url)
            .get_subscription(&key)
            .await
            .unwrap_err();
        assert!(error.starts_with("eleven-key-permissions"));
        assert!(!error.contains(key.as_str()));
        assert!(!error.contains("not surfaced"));
    }

    #[test]
    fn unauthorized_message_distinguishes_permission_gaps_from_bad_keys() {
        let missing = serde_json::json!({"detail": {"status": "missing_permissions"}});
        assert!(unauthorized_message(&missing).starts_with("eleven-key-permissions"));
        for body in [
            serde_json::json!({"detail": "invalid_api_key"}),
            serde_json::json!({"detail": {"status": "invalid_api_key"}}),
            Value::Null,
        ] {
            assert!(unauthorized_message(&body).starts_with("eleven-key-invalid"));
        }
    }

    #[tokio::test]
    async fn subscription_client_maps_server_errors_without_body_dump() {
        let server = FakeHttpServer::new(500, r#"{"detail":"do not surface this body"}"#);
        let key = ApiKey::new("fake-key-for-local-test").unwrap();
        let error = ElevenLabsClient::with_base_url(&server.base_url)
            .get_subscription(&key)
            .await
            .unwrap_err();
        assert_eq!(
            error,
            "eleven-validation: subscription request failed (HTTP 500)"
        );
        assert!(!error.contains("do not surface this body"));
    }

    #[tokio::test]
    async fn voices_client_uses_json_accept_header_and_query() {
        let fixture: Value =
            serde_json::from_str(include_str!("fixtures/eleven-voices.min.json")).unwrap();
        let server = FakeHttpServer::new(200, &fixture.to_string());
        let key = ApiKey::new("fake-key-for-local-test").unwrap();
        let voices = ElevenLabsClient::with_base_url(&server.base_url)
            .get_voices(&key)
            .await
            .unwrap();
        assert_eq!(voices.len(), 3);
        let request = server.request();
        assert!(request.starts_with("GET /v2/voices HTTP/1.1"));
        assert!(request
            .to_ascii_lowercase()
            .contains("accept: application/json"));
    }
}
