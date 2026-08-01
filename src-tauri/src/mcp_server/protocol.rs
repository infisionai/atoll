//! Pure protocol part of the local MCP server — HTTP/JSON-RPC parsing and response building (no network).
//!
//! Claude Code (an MCP client) connects over streamable HTTP. A plain
//! POST → JSON response suffices, no SSE (no notification/streaming tools).

use serde_json::{json, Value};

pub const PROTOCOL_VERSION: &str = "2024-11-05";

// ── HTTP ──

#[derive(Debug, PartialEq)]
pub struct HttpRequest {
    pub method: String,
    pub path: String,
    pub content_length: usize,
    /// An Origin header means a browser cross-origin request (drive-by web page) —
    /// MCP clients and curl never send it. Used to reject such requests
    pub has_origin: bool,
}

/// Parse the request header block (up to the body). Minimal — local loopback only
pub fn parse_head(head: &str) -> Option<HttpRequest> {
    let mut lines = head.lines();
    let request_line = lines.next()?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();

    let mut content_length = 0;
    let mut has_origin = false;
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                content_length = v.trim().parse().ok()?;
            }
            if k.trim().eq_ignore_ascii_case("origin") && !v.trim().is_empty() {
                has_origin = true;
            }
        }
    }
    Some(HttpRequest {
        method,
        path,
        content_length,
        has_origin,
    })
}

/// Serialize an HTTP response
pub fn http_response(status: u16, reason: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

/// Extract the workspace id from a `/mcp/<workspace_id>` path
pub fn workspace_from_path(path: &str) -> Option<&str> {
    let rest = path.strip_prefix("/mcp/")?;
    let ws = rest.split(['?', '/']).next()?;
    if ws.is_empty() {
        None
    } else {
        Some(ws)
    }
}

/// Session token from the query string (`?t=<token>`) — the server requires it on
/// every request so other local processes can't drive the canvas (or spend credits)
pub fn query_token(path: &str) -> Option<&str> {
    let query = path.split_once('?')?.1;
    query
        .split('&')
        .find_map(|pair| pair.strip_prefix("t="))
        .filter(|t| !t.is_empty())
}

// ── JSON-RPC ──

/// Tool definition — included verbatim in the tools/list response
pub struct ToolDef {
    pub name: &'static str,
    pub description: &'static str,
    pub input_schema: Value,
}

/// Message handling result — only tool execution is handed off to the (async) runtime
#[derive(Debug, PartialEq)]
pub enum Handled {
    /// Immediate reply
    Reply(Value),
    /// Notification (no id) — 202 Accepted, empty body
    Notification,
    /// tools/call — the runtime executes it and builds the response via tool_result/tool_error
    ToolCall { id: Value, name: String, args: Value },
}

pub fn handle_message(msg: &Value, tools: &[ToolDef]) -> Handled {
    let method = msg.get("method").and_then(|m| m.as_str()).unwrap_or("");
    let id = msg.get("id").cloned();

    // Requests without an id are notifications (notifications/initialized etc.)
    let Some(id) = id else {
        return Handled::Notification;
    };

    match method {
        "initialize" => {
            // Echo the version the client requested (if given), otherwise the default
            let version = msg
                .pointer("/params/protocolVersion")
                .and_then(|v| v.as_str())
                .unwrap_or(PROTOCOL_VERSION);
            Handled::Reply(reply(
                id,
                json!({
                    "protocolVersion": version,
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "atoll-canvas", "version": env!("CARGO_PKG_VERSION") },
                }),
            ))
        }
        "ping" => Handled::Reply(reply(id, json!({}))),
        "tools/list" => {
            let list: Vec<Value> = tools
                .iter()
                .map(|t| {
                    json!({
                        "name": t.name,
                        "description": t.description,
                        "inputSchema": t.input_schema,
                    })
                })
                .collect();
            Handled::Reply(reply(id, json!({ "tools": list })))
        }
        "tools/call" => {
            let name = msg
                .pointer("/params/name")
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string();
            let args = msg
                .pointer("/params/arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            Handled::ToolCall { id, name, args }
        }
        _ => Handled::Reply(error(id, -32601, &format!("Unsupported method: {method}"))),
    }
}

fn reply(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

pub fn error(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// Tool success response — both structuredContent and text
pub fn tool_result(id: Value, payload: Value) -> Value {
    reply(
        id,
        json!({
            "content": [{ "type": "text", "text": payload.to_string() }],
            "structuredContent": payload,
        }),
    )
}

/// Tool failure response — returned as isError content per the MCP spec (not a protocol error)
pub fn tool_error(id: Value, message: &str) -> Value {
    reply(
        id,
        json!({
            "content": [{ "type": "text", "text": message }],
            "isError": true,
        }),
    )
}

#[cfg(test)]
mod tests_auth {
    use super::*;

    #[test]
    fn query_token_parses_and_rejects_empty() {
        assert_eq!(query_token("/mcp/ws-1?t=abc"), Some("abc"));
        assert_eq!(query_token("/mcp/ws-1?x=1&t=abc"), Some("abc"));
        assert_eq!(query_token("/mcp/ws-1?t="), None);
        assert_eq!(query_token("/mcp/ws-1"), None);
    }

    #[test]
    fn parse_head_detects_origin_header() {
        let head = "POST /mcp/ws HTTP/1.1\r\nOrigin: https://evil.example\r\nContent-Length: 2";
        assert!(parse_head(head).unwrap().has_origin);
        let head = "POST /mcp/ws HTTP/1.1\r\nContent-Length: 2";
        assert!(!parse_head(head).unwrap().has_origin);
    }

    #[test]
    fn workspace_from_path_ignores_query() {
        assert_eq!(workspace_from_path("/mcp/ws-1?t=abc"), Some("ws-1"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_head_basics() {
        let head = "POST /mcp/ws-abc HTTP/1.1\r\nHost: x\r\nContent-Length: 42\r\n";
        let req = parse_head(head).unwrap();
        assert_eq!(req.method, "POST");
        assert_eq!(req.path, "/mcp/ws-abc");
        assert_eq!(req.content_length, 42);
        assert!(parse_head("").is_none());
    }

    #[test]
    fn workspace_extraction() {
        assert_eq!(workspace_from_path("/mcp/ws-1"), Some("ws-1"));
        assert_eq!(workspace_from_path("/mcp/ws-1?x=1"), Some("ws-1"));
        assert_eq!(workspace_from_path("/mcp/"), None);
        assert_eq!(workspace_from_path("/other"), None);
    }

    #[test]
    fn initialize_echoes_requested_version() {
        let msg = serde_json::json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": { "protocolVersion": "2025-06-18" }
        });
        let Handled::Reply(r) = handle_message(&msg, &[]) else {
            panic!()
        };
        assert_eq!(r["result"]["protocolVersion"], "2025-06-18");
        assert_eq!(r["result"]["serverInfo"]["name"], "atoll-canvas");
    }

    #[test]
    fn notification_has_no_reply() {
        let msg = serde_json::json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
        assert_eq!(handle_message(&msg, &[]), Handled::Notification);
    }

    #[test]
    fn tools_list_serializes_defs() {
        let tools = [ToolDef {
            name: "canvas_state",
            description: "Read the graph",
            input_schema: serde_json::json!({ "type": "object" }),
        }];
        let msg = serde_json::json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" });
        let Handled::Reply(r) = handle_message(&msg, &tools) else {
            panic!()
        };
        assert_eq!(r["result"]["tools"][0]["name"], "canvas_state");
    }

    #[test]
    fn tools_call_becomes_toolcall() {
        let msg = serde_json::json!({
            "jsonrpc": "2.0", "id": 3, "method": "tools/call",
            "params": { "name": "canvas_state", "arguments": { "x": 1 } }
        });
        match handle_message(&msg, &[]) {
            Handled::ToolCall { id, name, args } => {
                assert_eq!(id, 3);
                assert_eq!(name, "canvas_state");
                assert_eq!(args["x"], 1);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn unknown_method_errors() {
        let msg = serde_json::json!({ "jsonrpc": "2.0", "id": 4, "method": "resources/list" });
        let Handled::Reply(r) = handle_message(&msg, &[]) else {
            panic!()
        };
        assert_eq!(r["error"]["code"], -32601);
    }

    #[test]
    fn tool_result_and_error_shapes() {
        let ok = tool_result(serde_json::json!(1), serde_json::json!({ "ok": true }));
        assert_eq!(ok["result"]["structuredContent"]["ok"], true);
        let err = tool_error(serde_json::json!(1), "failed");
        assert_eq!(err["result"]["isError"], true);
    }
}
