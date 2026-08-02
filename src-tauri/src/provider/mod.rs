//! Provider connection layer — OAuth, tokens, and balance + multi-provider registry

pub mod connection;
pub mod elevenlabs;
pub mod elevenlabs_api;
pub mod elevenlabs_client;
pub mod higgsfield;
pub mod jobs;
pub mod kling;
pub mod kling_catalog;
pub mod magnific;
pub mod magnific_catalog;
pub mod oauth;
pub mod secrets;

use connection::ProviderStatusDto;
use serde_json::Value;
use std::sync::Arc;

/// Provider enum dispatch — only 2–3 variants, so explicit branching instead of a trait object
pub enum Provider {
    Higgsfield(higgsfield::Higgsfield),
    Magnific(magnific::Magnific),
    Kling(kling::Kling),
    ElevenLabs(elevenlabs::ElevenLabs),
}

impl Provider {
    pub fn id(&self) -> &'static str {
        match self {
            Provider::Higgsfield(p) => p.conn.id(),
            Provider::Magnific(p) => p.conn.id(),
            Provider::Kling(p) => p.conn.id(),
            Provider::ElevenLabs(_) => elevenlabs::PROVIDER_ID,
        }
    }

    /// Shared connection surface. Native providers implement this dispatch without exposing
    /// their transport through commands.
    pub async fn status(&self) -> ProviderStatusDto {
        match self {
            Provider::Higgsfield(p) => p.conn.status().await,
            Provider::Magnific(p) => p.conn.status().await,
            Provider::Kling(p) => p.conn.status().await,
            Provider::ElevenLabs(p) => p.status().await,
        }
    }

    pub async fn connect(&self) -> Result<ProviderStatusDto, String> {
        match self {
            Provider::Higgsfield(p) => p.conn.connect().await,
            Provider::Magnific(p) => p.conn.connect().await,
            Provider::Kling(p) => p.conn.connect().await,
            Provider::ElevenLabs(_) => Err("eleven-key-required: enter an ElevenLabs API key".into()),
        }
    }

    pub async fn disconnect(&self) -> Result<(), String> {
        match self {
            Provider::Higgsfield(p) => p.conn.disconnect().await,
            Provider::Magnific(p) => p.conn.disconnect().await,
            Provider::Kling(p) => p.conn.disconnect().await,
            Provider::ElevenLabs(p) => p.disconnect().await,
        }
    }

    /// Read-only MCP call used for status polling and estimates. This is a dispatch seam for
    /// native providers; billable submission uses submit_tool_call separately.
    pub async fn poll_tool_call(&self, tool: &str, args: Value) -> Result<Value, String> {
        match self {
            Provider::Higgsfield(p) => p.conn.tool_call(tool, args).await,
            Provider::Magnific(p) => p.conn.tool_call(tool, args).await,
            Provider::Kling(p) => p.conn.tool_call(tool, args).await,
            Provider::ElevenLabs(_) => Err("eleven-validation: ElevenLabs has no MCP tool call".into()),
        }
    }

    /// Model catalog (cache-first)
    pub async fn catalog(&self, refresh: bool) -> Result<Value, String> {
        match self {
            Provider::Higgsfield(p) => p.catalog(refresh).await,
            Provider::Magnific(p) => p.catalog(refresh).await,
            Provider::Kling(p) => p.catalog(refresh).await,
            Provider::ElevenLabs(p) => p.catalog(refresh),
        }
    }

    /// Async pre-resolution before submit/estimate — conversions that need a server round-trip, e.g. cross-provider references.
    /// (higgsfield: turns URL references into media_ids via media_import_url / magnific: not needed)
    pub async fn prepare_params(&self, params: &mut Value) -> Result<(), String> {
        match self {
            Provider::Higgsfield(h) => h.resolve_cross_media(params).await,
            Provider::Magnific(_) => Ok(()),
            Provider::Kling(_) => Ok(()),
            Provider::ElevenLabs(_) => Ok(()),
        }
    }

    /// Provider-specific dynamic catalog cache invalidation after login/logout.
    pub async fn invalidate_catalog(&self) {
        if let Provider::Kling(kling) = self {
            kling.invalidate_catalog().await;
        } else if let Provider::ElevenLabs(_) = self {
            // Native catalog invalidation is introduced with the voice cache in E2.
        }
    }

    /// Refreshes the shared status using each provider's balance response schema.
    pub async fn refresh_balance(&self) -> Result<f64, String> {
        match self {
            Provider::Higgsfield(p) => p.conn.refresh_balance().await,
            Provider::Magnific(p) => p.conn.refresh_balance().await,
            Provider::Kling(p) => p.refresh_balance().await,
            Provider::ElevenLabs(p) => p.refresh_balance().await,
        }
    }

    /// Billable submit call. Kling forbids automatic replay on 401, while the existing
    /// providers keep the shared connection layer's compatible behavior.
    pub async fn submit_tool_call(&self, tool: &str, args: Value) -> Result<Value, String> {
        match self {
            Provider::Kling(p) => p.conn.tool_call_no_replay(tool, args).await,
            Provider::Higgsfield(p) => p.conn.tool_call(tool, args).await,
            Provider::Magnific(p) => p.conn.tool_call(tool, args).await,
            Provider::ElevenLabs(_) => Err("eleven-validation: ElevenLabs generation is not available yet".into()),
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
            Provider::ElevenLabs(_) => Err("eleven-validation: ElevenLabs generation is not available yet".into()),
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
            Provider::ElevenLabs(_) => Err("eleven-validation: ElevenLabs estimates are not available yet".into()),
        }
    }

    /// Job status query — (tool name, arguments)
    pub fn status_call(&self, job_id: &str) -> (&'static str, Value) {
        match self {
            Provider::Higgsfield(_) => higgsfield::Higgsfield::status_call(job_id),
            Provider::Magnific(_) => magnific::Magnific::status_call(job_id),
            Provider::Kling(_) => kling::Kling::status_call(job_id),
            Provider::ElevenLabs(_) => ("", Value::Null),
        }
    }

    pub async fn set_api_key(&self, value: &str) -> Result<ProviderStatusDto, String> {
        match self {
            Provider::ElevenLabs(provider) => provider.set_api_key(value).await,
            _ => Err("eleven-validation: API keys are only supported by ElevenLabs".into()),
        }
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn existing_provider_status_dispatch_keeps_oauth_contract() {
        let dir = std::env::temp_dir().join(format!("atoll-provider-dispatch-{}", std::process::id()));
        let providers = [
            Provider::Higgsfield(higgsfield::Higgsfield::new(dir.clone())),
            Provider::Magnific(magnific::Magnific::new(dir.clone())),
            Provider::Kling(kling::Kling::new(dir.clone())),
        ];
        for provider in &providers {
            let status = provider.status().await;
            assert_eq!(status.auth_kind, "oauth");
            assert_eq!(serde_json::to_value(status).unwrap()["authKind"], json!("oauth"));
        }
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn native_connect_requires_an_api_key_without_opening_a_browser() {
        let dir = std::env::temp_dir().join(format!("atoll-elevenlabs-connect-{}", std::process::id()));
        let provider = Provider::ElevenLabs(elevenlabs::ElevenLabs::new(dir.clone()));
        assert_eq!(
            provider.connect().await.unwrap_err(),
            "eleven-key-required: enter an ElevenLabs API key"
        );
        let _ = std::fs::remove_dir_all(dir);
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
