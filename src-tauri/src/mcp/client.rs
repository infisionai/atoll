//! MCP streamable HTTP client — session keep-alive + tools/call.
//! Tokens are supplied by the caller (the provider connection layer).

use super::protocol;
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::Mutex;

pub struct McpClient {
    http: reqwest::Client,
    url: String,
    session_id: Mutex<Option<String>>,
    next_id: AtomicU64,
}

/// 401 = token-expired signal — the caller refreshes and retries
#[derive(Debug)]
pub enum McpError {
    Unauthorized,
    Other(String),
}

impl std::fmt::Display for McpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            McpError::Unauthorized => write!(f, "Authentication expired (401)"),
            McpError::Other(msg) => write!(f, "{msg}"),
        }
    }
}

fn other(e: impl std::fmt::Display) -> McpError {
    McpError::Other(e.to_string())
}

impl McpClient {
    pub fn new(url: &str) -> Self {
        Self {
            http: reqwest::Client::new(),
            url: url.to_string(),
            session_id: Mutex::new(None),
            next_id: AtomicU64::new(1),
        }
    }

    /// Single JSON-RPC request — includes the session header and refreshes it from the response
    async fn post(&self, token: &str, body: Value) -> Result<Value, McpError> {
        let mut req = self
            .http
            .post(&self.url)
            .bearer_auth(token)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .json(&body);

        if let Some(sid) = self.session_id.lock().await.clone() {
            req = req.header("Mcp-Session-Id", sid);
        }

        let res = req.send().await.map_err(other)?;

        if res.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(McpError::Unauthorized);
        }

        // Keep the session id issued by the server
        if let Some(sid) = res
            .headers()
            .get("mcp-session-id")
            .and_then(|v| v.to_str().ok())
        {
            *self.session_id.lock().await = Some(sid.to_string());
        }

        let status = res.status();
        let content_type = res
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/json")
            .to_string();
        let text = res.text().await.map_err(other)?;

        if !status.is_success() {
            return Err(McpError::Other(format!("HTTP {status}: {text}")));
        }

        protocol::parse_body(&content_type, &text).map_err(McpError::Other)
    }

    /// initialize → establish a session. Reuses the existing session if there is one
    pub async fn ensure_session(&self, token: &str) -> Result<(), McpError> {
        if self.session_id.lock().await.is_some() {
            return Ok(());
        }
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let body = protocol::jsonrpc_request(id, "initialize", Some(protocol::initialize_params()));
        let response = self.post(token, body).await?;
        protocol::unwrap_result(response).map_err(McpError::Other)?;

        // initialized notification (no response is expected)
        let notif = serde_json::json!({"jsonrpc":"2.0","method":"notifications/initialized"});
        let _ = self.post(token, notif).await;
        Ok(())
    }

    /// Reset the session — called when re-authenticating after a 401
    pub async fn reset_session(&self) {
        *self.session_id.lock().await = None;
    }

    pub async fn call(&self, token: &str, method: &str, params: Value) -> Result<Value, McpError> {
        self.ensure_session(token).await?;
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let body = protocol::jsonrpc_request(id, method, Some(params));
        let response = self.post(token, body).await?;
        protocol::unwrap_result(response).map_err(McpError::Other)
    }

    /// tools/call — unwraps the result down to its text content (JSON) before returning
    pub async fn tool_call(&self, token: &str, name: &str, args: Value) -> Result<Value, McpError> {
        let result = self
            .call(
                token,
                "tools/call",
                serde_json::json!({ "name": name, "arguments": args }),
            )
            .await?;
        Ok(protocol::tool_payload(&result).unwrap_or(result))
    }
}
