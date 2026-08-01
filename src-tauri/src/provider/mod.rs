//! Provider connection layer — OAuth, tokens, and balance + multi-provider registry

pub mod connection;
pub mod higgsfield;
pub mod jobs;
pub mod kling;
pub mod kling_catalog;
pub mod magnific;
pub mod magnific_catalog;
pub mod oauth;

use connection::McpConnection;
use serde_json::Value;
use std::sync::Arc;

/// Provider enum dispatch — only 2–3 variants, so explicit branching instead of a trait object
pub enum Provider {
    Higgsfield(higgsfield::Higgsfield),
    Magnific(magnific::Magnific),
    Kling(kling::Kling),
}

impl Provider {
    /// All shared behavior (connect, tokens, tool_call, balance) goes through this
    pub fn conn(&self) -> &McpConnection {
        match self {
            Provider::Higgsfield(p) => &p.conn,
            Provider::Magnific(p) => &p.conn,
            Provider::Kling(p) => &p.conn,
        }
    }

    pub fn id(&self) -> &'static str {
        self.conn().id()
    }

    /// Model catalog (cache-first)
    pub async fn catalog(&self, refresh: bool) -> Result<Value, String> {
        match self {
            Provider::Higgsfield(p) => p.catalog(refresh).await,
            Provider::Magnific(p) => p.catalog(refresh).await,
            Provider::Kling(p) => p.catalog(refresh).await,
        }
    }

    /// Async pre-resolution before submit/estimate — conversions that need a server round-trip, e.g. cross-provider references.
    /// (higgsfield: turns URL references into media_ids via media_import_url / magnific: not needed)
    pub async fn prepare_params(&self, params: &mut Value) -> Result<(), String> {
        match self {
            Provider::Higgsfield(h) => h.resolve_cross_media(params).await,
            Provider::Magnific(_) => Ok(()),
            Provider::Kling(_) => Ok(()),
        }
    }

    /// Provider-specific dynamic catalog cache invalidation after login/logout.
    pub async fn invalidate_catalog(&self) {
        if let Provider::Kling(kling) = self {
            kling.invalidate_catalog().await;
        }
    }

    /// Refreshes the shared status using each provider's balance response schema.
    pub async fn refresh_balance(&self) -> Result<f64, String> {
        match self {
            Provider::Higgsfield(p) => p.conn.refresh_balance().await,
            Provider::Magnific(p) => p.conn.refresh_balance().await,
            Provider::Kling(p) => p.refresh_balance().await,
        }
    }

    /// Billable submit call. Kling forbids automatic replay on 401, while the existing
    /// providers keep the shared connection layer's compatible behavior.
    pub async fn submit_tool_call(&self, tool: &str, args: Value) -> Result<Value, String> {
        match self {
            Provider::Kling(p) => p.conn.tool_call_no_replay(tool, args).await,
            _ => self.conn().tool_call(tool, args).await,
        }
    }

    /// Generation submit — (tool name, arguments). Argument shapes differ per provider:
    /// higgsfield wraps in {params}, magnific uses top-level arguments + mode=slug
    pub fn submit_call(&self, kind: &str, params: &Value) -> Result<(String, Value), String> {
        match self {
            Provider::Higgsfield(_) => Ok((
                higgsfield::Higgsfield::submit_tool(kind),
                serde_json::json!({ "params": higgsfield::Higgsfield::normalize_params(params) }),
            )),
            Provider::Magnific(_) => magnific::Magnific::submit_call(kind, params)
                .map(|(t, a)| (t.to_string(), a)),
            Provider::Kling(_) => kling::Kling::submit_call(kind, params)
                .map(|(t, a)| (t.to_string(), a)),
        }
    }

    /// Pre-run estimate — (tool name, arguments). A preflight that spends no credits.
    /// higgsfield: submit tool + get_cost:true / magnific: simulate_cost
    pub fn estimate_call(&self, kind: &str, params: &Value) -> Result<(String, Value), String> {
        match self {
            Provider::Higgsfield(_) => {
                let mut params = higgsfield::Higgsfield::normalize_params(params);
                params["get_cost"] = serde_json::json!(true);
                Ok((
                    higgsfield::Higgsfield::submit_tool(kind),
                    serde_json::json!({ "params": params }),
                ))
            }
            Provider::Magnific(_) => magnific::Magnific::estimate_call(kind, params)
                .map(|(t, a)| (t.to_string(), a)),
            // Kling MCP has no pre-estimate tool. Never work around this via submit.
            Provider::Kling(_) => kling::Kling::estimate_call(kind, params)
                .map(|(t, a)| (t.to_string(), a)),
        }
    }

    /// Job status query — (tool name, arguments)
    pub fn status_call(&self, job_id: &str) -> (&'static str, Value) {
        match self {
            Provider::Higgsfield(_) => higgsfield::Higgsfield::status_call(job_id),
            Provider::Magnific(_) => magnific::Magnific::status_call(job_id),
            Provider::Kling(_) => kling::Kling::status_call(job_id),
        }
    }
}

/// Provider registry — commands route by id
pub struct Providers(pub Vec<Arc<Provider>>);

impl Providers {
    pub fn by_id(&self, id: &str) -> Result<&Arc<Provider>, String> {
        self.0
            .iter()
            .find(|p| p.id() == id)
            .ok_or_else(|| format!("Unsupported provider: {id}"))
    }

    /// Default for calls without a provider (older frontend, pre-existing jobs rows)
    pub const DEFAULT_ID: &'static str = higgsfield::PROVIDER_ID;
}
