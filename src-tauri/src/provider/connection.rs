//! Shared MCP provider connection layer — OAuth 2.1 PKCE + token file (600) + session + balance.
//! Logic proven in higgsfield.rs, parameterized to be provider-agnostic.
//! Provider specifics (catalog, generation tool names) are layered on top by each provider module.

use super::oauth;
use crate::mcp::client::{McpClient, McpError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

/// Fixed callback port — the redirect URI is pinned so the client_id can be reused
/// (approach carried over from a previously validated prototype).
/// Shared by all providers — connect is user-initiated, so there is no concurrent execution
const CALLBACK_PORT: u16 = 17872;

/// Per-provider connection settings — only these values differ; the flow is identical
pub struct ProviderConfig {
    pub id: &'static str,
    pub name: &'static str,
    pub mcp_url: &'static str,
    pub discovery_url: &'static str,
    pub scope: &'static str,
    /// Balance query tool name (per-provider MCP tool name)
    pub balance_tool: &'static str,
    /// The "buy credits" link on the settings screen
    pub pricing_url: &'static str,
}

fn now_s() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct Creds {
    client_id: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
    /// epoch s
    expires_at: Option<i64>,
    account: Option<String>,
}

#[derive(Deserialize)]
struct Discovery {
    authorization_endpoint: String,
    token_endpoint: String,
    registration_endpoint: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatusDto {
    pub id: String,
    pub name: String,
    /// disconnected | connecting | connected | expired
    pub state: String,
    /// oauth | api_key
    pub auth_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance: Option<f64>,
    /// Credit purchase page
    pub pricing_url: String,
}

pub struct McpConnection {
    config: ProviderConfig,
    dir: PathBuf,
    http: reqwest::Client,
    pub mcp: McpClient,
    creds: Mutex<Creds>,
    balance: Mutex<Option<f64>>,
    connecting: Mutex<bool>,
    expired: Mutex<bool>,
}

impl McpConnection {
    pub fn new(config: ProviderConfig, app_data_dir: PathBuf) -> Self {
        let dir = app_data_dir.join("creds");
        let creds = Self::load_creds(&dir, config.id).unwrap_or_default();
        Self {
            mcp: McpClient::new(config.mcp_url),
            config,
            dir,
            http: reqwest::Client::new(),
            creds: Mutex::new(creds),
            balance: Mutex::new(None),
            connecting: Mutex::new(false),
            expired: Mutex::new(false),
        }
    }

    pub fn id(&self) -> &'static str {
        self.config.id
    }

    /// Parent of the creds folder (the app data folder) — used to compute catalog cache paths
    pub fn app_data_dir(&self) -> PathBuf {
        self.dir.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| self.dir.clone())
    }

    fn creds_path(dir: &PathBuf, id: &str) -> PathBuf {
        dir.join(format!("{id}.json"))
    }

    fn load_creds(dir: &PathBuf, id: &str) -> Option<Creds> {
        let text = std::fs::read_to_string(Self::creds_path(dir, id)).ok()?;
        serde_json::from_str(&text).ok()
    }

    fn save_creds(&self, creds: &Creds) -> Result<(), String> {
        let json = serde_json::to_string_pretty(creds).map_err(|e| e.to_string())?;
        let path = Self::creds_path(&self.dir, self.config.id);
        // Owner-only from the moment of creation — no chmod-after-write race
        #[cfg(unix)]
        {
            use std::io::Write;
            use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
            std::fs::DirBuilder::new()
                .recursive(true)
                .mode(0o700)
                .create(&self.dir)
                .map_err(|e| e.to_string())?;
            let mut f = std::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .mode(0o600)
                .open(&path)
                .map_err(|e| e.to_string())?;
            f.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
        }
        #[cfg(not(unix))]
        {
            std::fs::create_dir_all(&self.dir).map_err(|e| e.to_string())?;
            std::fs::write(&path, json).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub async fn status(&self) -> ProviderStatusDto {
        let creds = self.creds.lock().await;
        let state = if *self.connecting.lock().await {
            "connecting"
        } else if *self.expired.lock().await {
            "expired"
        } else if creds.access_token.is_some() {
            "connected"
        } else {
            "disconnected"
        };
        ProviderStatusDto {
            id: self.config.id.into(),
            name: self.config.name.into(),
            state: state.into(),
            auth_kind: "oauth".into(),
            account: creds.account.clone(),
            balance: *self.balance.lock().await,
            pricing_url: self.config.pricing_url.into(),
        }
    }

    async fn discovery(&self) -> Result<Discovery, String> {
        self.http
            .get(self.config.discovery_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| format!("Failed to parse OAuth metadata: {e}"))
    }

    /// Dynamic client registration — done once when there is no client_id
    async fn ensure_client_id(&self, disc: &Discovery, redirect_uri: &str) -> Result<String, String> {
        if let Some(id) = self.creds.lock().await.client_id.clone() {
            return Ok(id);
        }
        // If discovery lacks it, try the MCP host's conventional path
        let fallback = || -> String {
            let base = self.config.mcp_url.trim_end_matches("/mcp").trim_end_matches('/');
            format!("{base}/oauth2/register")
        };
        let reg = disc.registration_endpoint.clone().unwrap_or_else(fallback);
        let body: Value = self
            .http
            .post(&reg)
            .json(&serde_json::json!({
                "client_name": "Atoll",
                "redirect_uris": [redirect_uri],
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| format!("Client registration failed: {e}"))?;
        let id = body
            .get("client_id")
            .and_then(|v| v.as_str())
            .ok_or("No client_id in the registration response")?
            .to_string();
        let mut creds = self.creds.lock().await;
        creds.client_id = Some(id.clone());
        self.save_creds(&creds)?;
        Ok(id)
    }

    /// Connect — browser login → callback → token exchange. Blocks until done (call via spawn)
    pub async fn connect(&self) -> Result<ProviderStatusDto, String> {
        *self.connecting.lock().await = true;
        let result = self.connect_inner().await;
        *self.connecting.lock().await = false;
        if result.is_ok() {
            *self.expired.lock().await = false;
        }
        result?;
        Ok(self.status().await)
    }

    async fn connect_inner(&self) -> Result<(), String> {
        let redirect_uri = format!("http://127.0.0.1:{CALLBACK_PORT}/callback");
        let disc = self.discovery().await?;
        let client_id = self.ensure_client_id(&disc, &redirect_uri).await?;

        let (verifier, challenge) = oauth::pkce_pair();
        let state = oauth::random_state();

        let auth_url = reqwest::Url::parse_with_params(
            &disc.authorization_endpoint,
            &[
                ("response_type", "code"),
                ("client_id", client_id.as_str()),
                ("redirect_uri", redirect_uri.as_str()),
                ("scope", self.config.scope),
                ("code_challenge", challenge.as_str()),
                ("code_challenge_method", "S256"),
                ("state", state.as_str()),
            ],
        )
        .map_err(|e| e.to_string())?;

        // Open the callback server first (fixed port — shared by all providers)
        let listener = TcpListener::bind(("127.0.0.1", CALLBACK_PORT)).map_err(|e| {
            format!("Callback port {CALLBACK_PORT} unavailable: {e} — if another provider connection is in progress, finish it and try again")
        })?;

        // Open login in the default browser (macOS). Log the URL —
        // so it can be opened manually where the browser doesn't launch
        log::info!("[{}] OAuth authorization URL: {}", self.config.id, auth_url);
        std::process::Command::new("open")
            .arg(auth_url.as_str())
            .spawn()
            .map_err(|e| format!("Failed to open the browser: {e}"))?;

        // Wait for the callback — the timeout is handled by wait_for_callback's internal deadline.
        // (If an outer tokio timeout only cancels the future, the blocking accept thread
        //  holds the listener forever and the next connect attempt fails to bind the port)
        let expected_state = state.clone();
        let code = tokio::task::spawn_blocking(move || {
            wait_for_callback(listener, &expected_state, std::time::Duration::from_secs(300))
        })
        .await
        .map_err(|e| e.to_string())??;

        // Token exchange
        let body: Value = self
            .http
            .post(&disc.token_endpoint)
            .form(&[
                ("grant_type", "authorization_code"),
                ("code", code.as_str()),
                ("redirect_uri", redirect_uri.as_str()),
                ("client_id", client_id.as_str()),
                ("code_verifier", verifier.as_str()),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| format!("Failed to parse the token response: {e}"))?;

        self.store_token(&body).await?;
        self.mcp.reset_session().await;
        Ok(())
    }

    async fn store_token(&self, body: &Value) -> Result<(), String> {
        let access = body
            .get("access_token")
            .and_then(|v| v.as_str())
            // Redacted: never include the response body — it may carry credentials
            .ok_or_else(|| {
                let keys: Vec<&str> = body
                    .as_object()
                    .map(|o| o.keys().map(|k| k.as_str()).collect())
                    .unwrap_or_default();
                format!("No access_token in the token response (keys: {keys:?})")
            })?;
        let mut creds = self.creds.lock().await;
        creds.access_token = Some(access.to_string());
        if let Some(r) = body.get("refresh_token").and_then(|v| v.as_str()) {
            creds.refresh_token = Some(r.to_string());
        }
        if let Some(exp) = body.get("expires_in").and_then(|v| v.as_i64()) {
            creds.expires_at = Some(now_s() + exp);
        }
        // Account display — if the access_token is a JWT, pull the email from its payload
        // (multi-account users get confused when they can't see which account was authorized)
        if let Some(email) = jwt_email(access) {
            creds.account = Some(email);
        }
        self.save_creds(&creds)
    }

    /// Get a valid token — refreshes when within 60 seconds of expiry
    pub async fn valid_token(&self) -> Result<String, String> {
        let (token, needs_refresh) = {
            let creds = self.creds.lock().await;
            let token = creds.access_token.clone().ok_or("Not connected")?;
            let needs = matches!(creds.expires_at, Some(exp) if exp - now_s() < 60)
                && creds.refresh_token.is_some();
            (token, needs)
        };
        if !needs_refresh {
            return Ok(token);
        }
        self.refresh().await
    }

    async fn refresh(&self) -> Result<String, String> {
        let disc = self.discovery().await?;
        let (client_id, refresh_token) = {
            let creds = self.creds.lock().await;
            (
                creds.client_id.clone().ok_or("No client_id")?,
                creds.refresh_token.clone().ok_or("No refresh_token")?,
            )
        };
        let res = self
            .http
            .post(&disc.token_endpoint)
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token.as_str()),
                ("client_id", client_id.as_str()),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            *self.expired.lock().await = true;
            return Err("Token refresh failed — please log in again".into());
        }
        let body: Value = res.json().await.map_err(|e| e.to_string())?;
        self.store_token(&body).await?;
        self.mcp.reset_session().await;
        self.creds
            .lock()
            .await
            .access_token
            .clone()
            .ok_or_else(|| "No token after refresh".into())
    }

    /// MCP tool call — on 401, refresh and retry once
    pub async fn tool_call(&self, name: &str, args: Value) -> Result<Value, String> {
        let token = self.valid_token().await?;
        match self.mcp.tool_call(&token, name, args.clone()).await {
            Ok(v) => Ok(v),
            Err(McpError::Unauthorized) => {
                let token = self.refresh().await?;
                self.mcp.reset_session().await;
                self.mcp
                    .tool_call(&token, name, args)
                    .await
                    .map_err(|e| e.to_string())
            }
            Err(e) => Err(e.to_string()),
        }
    }

    /// Single-shot send for billable calls — never auto-resends the same request even on a 401.
    /// The token is refreshed before the call, but replaying a mutation the server may
    /// already have processed must be an explicit decision by the caller.
    pub async fn tool_call_no_replay(&self, name: &str, args: Value) -> Result<Value, String> {
        let token = self.valid_token().await?;
        self.mcp
            .tool_call(&token, name, args)
            .await
            .map_err(|e| e.to_string())
    }

    /// Balance query — config.balance_tool. Finds the credit number in the response and caches it
    pub async fn refresh_balance(&self) -> Result<f64, String> {
        let result = self.tool_call(self.config.balance_tool, serde_json::json!({})).await?;
        let credits = extract_credits(&result)
            .ok_or_else(|| format!("No credits found in the balance response: {result}"))?;
        self.cache_balance(credits).await;
        Ok(credits)
    }

    /// Used by provider-specific balance parsers to push a value into the shared status.
    pub async fn cache_balance(&self, credits: f64) {
        *self.balance.lock().await = Some(credits);
    }

    pub async fn disconnect(&self) -> Result<(), String> {
        let _ = std::fs::remove_file(Self::creds_path(&self.dir, self.config.id));
        *self.creds.lock().await = Creds::default();
        *self.balance.lock().await = None;
        *self.expired.lock().await = false;
        self.mcp.reset_session().await;
        Ok(())
    }
}

/// Extract the email from a JWT access token's payload — None if it isn't a JWT or has no email
pub fn jwt_email(token: &str) -> Option<String> {
    use base64::Engine;
    let payload_b64 = token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload_b64)
        .ok()?;
    let payload: Value = serde_json::from_slice(&bytes).ok()?;
    payload
        .get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Extract the credit number from a balance response — field names aren't fixed, so iterate over candidates
pub fn extract_credits(v: &Value) -> Option<f64> {
    for key in [
        "remainingCredits",
        "remaining_credits",
        "availableCredits",
        "available_credits",
        "credits",
        "balance",
        "available",
    ] {
        if let Some(n) = v.get(key).and_then(|x| x.as_f64()) {
            return Some(n);
        }
        // Search one level of nesting (e.g. {"data": {"credits": ...}})
        if let Some(obj) = v.as_object() {
            for inner in obj.values() {
                if let Some(n) = inner.get(key).and_then(|x| x.as_f64()) {
                    return Some(n);
                }
            }
        }
    }
    None
}

/// Accept loop until the callback request arrives — validates state, then returns the code.
/// Non-blocking + deadline: on timeout the thread ends on its own and releases the port
fn wait_for_callback(
    listener: TcpListener,
    expected_state: &str,
    timeout: std::time::Duration,
) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = std::time::Instant::now() + timeout;
    loop {
        let mut stream = match listener.accept() {
            Ok((s, _)) => s,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if std::time::Instant::now() >= deadline {
                    return Err("Timed out waiting for login (5 minutes)".into());
                }
                std::thread::sleep(std::time::Duration::from_millis(150));
                continue;
            }
            Err(e) => return Err(e.to_string()),
        };
        // On macOS the accepted socket inherits non-blocking — revert it before reading
        stream.set_nonblocking(false).map_err(|e| e.to_string())?;
        let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
        let mut request_line = String::new();
        reader.read_line(&mut request_line).map_err(|e| e.to_string())?;

        let parsed = oauth::parse_callback(&request_line);
        let ok = matches!(&parsed, Some((_, s)) if s == expected_state);

        let html = if ok {
            "<html><body style='font-family:sans-serif;background:#0c1519;color:#eaf4f4;display:grid;place-items:center;height:100vh'><div><h2>Login complete</h2><p>Return to Atoll. You can close this window.</p></div></body></html>"
        } else {
            "<html><body>Bad request</body></html>"
        };
        let _ = write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n{html}"
        );

        if ok {
            return Ok(parsed.unwrap().0);
        }
        // Ignore stray requests (favicon etc.) and keep waiting
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jwt_email_from_token() {
        use base64::Engine;
        // {"email":"a@b.c"} — reads the payload without verification (display only)
        let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(br#"{"email":"a@b.c"}"#);
        let token = format!("h.{payload}.s");
        assert_eq!(jwt_email(&token), Some("a@b.c".into()));
        assert_eq!(jwt_email("opaque-token"), None);
    }

    #[test]
    fn extract_credits_from_common_shapes() {
        assert_eq!(extract_credits(&serde_json::json!({"credits": 62.5})), Some(62.5));
        assert_eq!(
            extract_credits(&serde_json::json!({"data": {"available_credits": 10}})),
            Some(10.0)
        );
        assert_eq!(extract_credits(&serde_json::json!({"plan": "pro"})), None);
    }
}
