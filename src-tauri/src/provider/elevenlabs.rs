use super::connection::ProviderStatusDto;
use super::elevenlabs_api::SubscriptionBalance;
use super::elevenlabs_client::{ElevenLabsClient, DEFAULT_BASE_URL};
use super::secrets::ApiKey;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;
use tokio::sync::Mutex;

pub const PROVIDER_ID: &str = "elevenlabs";
const PROVIDER_NAME: &str = "ElevenLabs";
const PRICING_URL: &str = "https://elevenlabs.io/app/settings/api-keys";
const BALANCE_UNIT: &str = "credits";

#[derive(Serialize, Deserialize)]
struct StoredCredentials {
    api_key: String,
}

pub struct ElevenLabs {
    app_data_dir: PathBuf,
    api: ElevenLabsClient,
    api_key: Mutex<Option<ApiKey>>,
    balance: Mutex<Option<f64>>,
}

impl ElevenLabs {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self::with_base_url(app_data_dir, DEFAULT_BASE_URL)
    }

    pub fn with_base_url(app_data_dir: PathBuf, base_url: impl Into<String>) -> Self {
        let provider = Self {
            app_data_dir,
            api: ElevenLabsClient::with_base_url(base_url),
            api_key: Mutex::new(None),
            balance: Mutex::new(None),
        };
        let key = provider.load_api_key();
        if let Ok(mut slot) = provider.api_key.try_lock() {
            *slot = key;
        }
        provider
    }

    fn credentials_path(&self) -> PathBuf {
        self.app_data_dir.join("creds").join("elevenlabs.json")
    }

    fn load_api_key(&self) -> Option<ApiKey> {
        let text = std::fs::read_to_string(self.credentials_path()).ok()?;
        let credentials: StoredCredentials = serde_json::from_str(&text).ok()?;
        ApiKey::new(credentials.api_key).ok()
    }

    fn save_api_key(&self, key: &ApiKey) -> Result<(), String> {
        let path = self.credentials_path();
        let parent = path
            .parent()
            .ok_or_else(|| "eleven-validation: invalid credentials path".to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            std::fs::DirBuilder::new()
                .recursive(true)
                .mode(0o700)
                .create(parent)
                .map_err(|_| "eleven-validation: unable to create credentials directory".to_string())?;
        }
        #[cfg(not(unix))]
        std::fs::create_dir_all(parent)
            .map_err(|_| "eleven-validation: unable to create credentials directory".to_string())?;

        let json = serde_json::to_vec(&StoredCredentials {
            api_key: key.as_str().to_string(),
        })
        .map_err(|_| "eleven-validation: unable to encode credentials".to_string())?;
        let temporary = path.with_file_name(".elevenlabs.json.tmp");
        let _ = std::fs::remove_file(&temporary);
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary)
            .map_err(|_| "eleven-validation: unable to open credentials file".to_string())?;
        file.write_all(&json)
            .and_then(|_| file.sync_all())
            .map_err(|_| "eleven-validation: unable to write credentials file".to_string())?;
        drop(file);
        std::fs::rename(&temporary, &path)
            .map_err(|_| "eleven-validation: unable to store credentials".to_string())
    }

    pub async fn status(&self) -> ProviderStatusDto {
        ProviderStatusDto {
            id: PROVIDER_ID.into(),
            name: PROVIDER_NAME.into(),
            state: if self.api_key.lock().await.is_some() {
                "connected"
            } else {
                "disconnected"
            }
            .into(),
            auth_kind: "api_key".into(),
            account: None,
            balance: *self.balance.lock().await,
            balance_unit: Some(BALANCE_UNIT.into()),
            pricing_url: PRICING_URL.into(),
        }
    }

    pub async fn set_api_key(&self, value: &str) -> Result<ProviderStatusDto, String> {
        let key = ApiKey::new(value.to_string())?;
        let SubscriptionBalance { remaining_credits } = self.api.get_subscription(&key).await?;
        self.save_api_key(&key)?;
        *self.api_key.lock().await = Some(key);
        *self.balance.lock().await = Some(remaining_credits);
        Ok(self.status().await)
    }

    pub async fn refresh_balance(&self) -> Result<f64, String> {
        let key = self
            .api_key
            .lock()
            .await
            .clone()
            .ok_or_else(|| "eleven-key-required: connect ElevenLabs first".to_string())?;
        let balance = self.api.get_subscription(&key).await?.remaining_credits;
        *self.balance.lock().await = Some(balance);
        Ok(balance)
    }

    pub async fn disconnect(&self) -> Result<(), String> {
        let _ = std::fs::remove_file(self.credentials_path());
        *self.api_key.lock().await = None;
        *self.balance.lock().await = None;
        Ok(())
    }

    pub fn catalog(&self, _refresh: bool) -> Result<serde_json::Value, String> {
        Err("eleven-validation: ElevenLabs catalog is not available in this phase".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use serde_json::Value;
    use std::thread::JoinHandle;
    use std::os::unix::fs::PermissionsExt;

    struct FakeHttpServer {
        base_url: String,
        thread: Option<JoinHandle<()>>,
    }

    impl FakeHttpServer {
        fn new(status: u16, body: &str) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let body = body.to_string();
            let thread = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut bytes = [0u8; 4096];
                let _ = stream.read(&mut bytes).unwrap();
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
                thread: Some(thread),
            }
        }
    }

    impl Drop for FakeHttpServer {
        fn drop(&mut self) {
            if let Some(thread) = self.thread.take() {
                thread.join().unwrap();
            }
        }
    }

    fn test_dir(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("atoll-elevenlabs-{label}-{}", std::process::id()))
    }

    #[test]
    fn credentials_round_trip_with_owner_only_permissions() {
        let dir = test_dir("credentials");
        let _ = std::fs::remove_dir_all(&dir);
        let provider = ElevenLabs::with_base_url(dir.clone(), "http://127.0.0.1:1");
        let key = ApiKey::new("fake-round-trip-key").unwrap();
        provider.save_api_key(&key).unwrap();
        let path = dir.join("creds/elevenlabs.json");
        let saved: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(saved["api_key"], "fake-round-trip-key");
        assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        let loaded = ElevenLabs::with_base_url(dir.clone(), "http://127.0.0.1:1");
        assert_eq!(loaded.status_blocking().state, "connected");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn corrupted_credentials_are_treated_as_disconnected() {
        let dir = test_dir("corrupt");
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("creds/elevenlabs.json");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "not json").unwrap();
        let provider = ElevenLabs::with_base_url(dir.clone(), "http://127.0.0.1:1");
        assert_eq!(provider.status_blocking().state, "disconnected");
        let _ = std::fs::remove_dir_all(dir);
    }

    impl ElevenLabs {
        fn status_blocking(&self) -> ProviderStatusDto {
            futures_status(self)
        }
    }

    fn futures_status(provider: &ElevenLabs) -> ProviderStatusDto {
        // The constructor/load tests only need the synchronous state; use a minimal Tokio runtime
        // without adding an async test dependency.
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(provider.status())
    }

    #[tokio::test]
    async fn valid_key_is_saved_only_after_subscription_validation() {
        let dir = test_dir("valid-key");
        let _ = std::fs::remove_dir_all(&dir);
        let body = include_str!("fixtures/eleven-subscription.min.json");
        let server = FakeHttpServer::new(200, body);
        let provider = ElevenLabs::with_base_url(dir.clone(), &server.base_url);
        let status = provider.set_api_key("fake-provider-key").await.unwrap();
        assert_eq!(status.state, "connected");
        assert_eq!(status.auth_kind, "api_key");
        assert_eq!(status.balance, Some(8_800.0));
        assert!(dir.join("creds/elevenlabs.json").exists());
        assert!(!serde_json::to_string(&status).unwrap().contains("fake-provider-key"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn invalid_key_is_not_saved_for_401_or_5xx() {
        for (label, status_code) in [("unauthorized", 401), ("server-error", 500)] {
            let dir = test_dir(label);
            let _ = std::fs::remove_dir_all(&dir);
            let server = FakeHttpServer::new(status_code, r#"{"detail":"not surfaced"}"#);
            let provider = ElevenLabs::with_base_url(dir.clone(), &server.base_url);
            let error = provider.set_api_key("fake-provider-key").await.unwrap_err();
            assert!(!error.contains("fake-provider-key"));
            assert!(!dir.join("creds/elevenlabs.json").exists());
            assert_eq!(provider.status().await.state, "disconnected");
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    #[tokio::test]
    async fn disconnect_deletes_credentials_without_a_remote_call() {
        let dir = test_dir("disconnect");
        let _ = std::fs::remove_dir_all(&dir);
        let provider = ElevenLabs::with_base_url(dir.clone(), "http://127.0.0.1:1");
        provider.save_api_key(&ApiKey::new("fake-disconnect-key").unwrap()).unwrap();
        provider.disconnect().await.unwrap();
        assert!(!dir.join("creds/elevenlabs.json").exists());
        assert_eq!(provider.status().await.state, "disconnected");
        let _ = std::fs::remove_dir_all(dir);
    }
}
