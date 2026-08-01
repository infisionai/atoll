//! Pure parsing part of the MCP streamable HTTP protocol — testable without a network.
//! (Body parsing / JSON-RPC handling ported to Rust from a previously validated prototype)

use serde_json::Value;

/// Build a JSON-RPC request body
pub fn jsonrpc_request(id: u64, method: &str, params: Option<Value>) -> Value {
    let mut req = serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
    });
    if let Some(p) = params {
        req["params"] = p;
    }
    req
}

pub fn initialize_params() -> Value {
    serde_json::json!({
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": { "name": "atoll", "version": env!("CARGO_PKG_VERSION") },
    })
}

/// Parse a response body — `application/json` or `text/event-stream` (SSE).
/// For SSE, concatenates the data: lines and takes the last complete JSON message.
pub fn parse_body(content_type: &str, body: &str) -> Result<Value, String> {
    if content_type.starts_with("text/event-stream") {
        parse_sse(body)
    } else {
        serde_json::from_str(body).map_err(|e| format!("Failed to parse JSON: {e}"))
    }
}

/// Extract JSON-RPC messages from an SSE stream — returns the last valid message
pub fn parse_sse(body: &str) -> Result<Value, String> {
    let mut last: Option<Value> = None;
    let mut data_buf = String::new();

    for line in body.lines() {
        if let Some(rest) = line.strip_prefix("data:") {
            if !data_buf.is_empty() {
                data_buf.push('\n');
            }
            data_buf.push_str(rest.trim_start());
        } else if line.is_empty() && !data_buf.is_empty() {
            // Event boundary — try to parse the buffer as one message
            if let Ok(v) = serde_json::from_str::<Value>(&data_buf) {
                last = Some(v);
            }
            data_buf.clear();
        }
    }
    // Case where the last event ends without a blank line
    if !data_buf.is_empty() {
        if let Ok(v) = serde_json::from_str::<Value>(&data_buf) {
            last = Some(v);
        }
    }

    last.ok_or_else(|| "No JSON-RPC message found in SSE".to_string())
}

/// Extract result from a JSON-RPC response. On error, converts it into a message
pub fn unwrap_result(response: Value) -> Result<Value, String> {
    if let Some(err) = response.get("error") {
        let msg = err
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error");
        let code = err.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
        return Err(format!("MCP error {code}: {msg}"));
    }
    response
        .get("result")
        .cloned()
        .ok_or_else(|| "No result in the response".to_string())
}

/// tools/call result payload — prefers structuredContent, falls back to text content (JSON)
pub fn tool_payload(result: &Value) -> Option<Value> {
    if let Some(sc) = result.get("structuredContent") {
        if sc.is_object() || sc.is_array() {
            return Some(sc.clone());
        }
    }
    tool_text_content(result)
}

/// Take the text content from a tools/call result and try to parse it as JSON.
/// Higgsfield tools often put a JSON string in content[0].text
pub fn tool_text_content(result: &Value) -> Option<Value> {
    let text = result
        .get("content")?
        .as_array()?
        .iter()
        .find(|c| c.get("type").and_then(|t| t.as_str()) == Some("text"))?
        .get("text")?
        .as_str()?;
    serde_json::from_str(text).ok().or_else(|| Some(Value::String(text.to_string())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jsonrpc_request_shape() {
        let r = jsonrpc_request(1, "tools/list", None);
        assert_eq!(r["jsonrpc"], "2.0");
        assert_eq!(r["method"], "tools/list");
        assert!(r.get("params").is_none());
    }

    #[test]
    fn parse_json_body() {
        let v = parse_body("application/json", r#"{"jsonrpc":"2.0","id":1,"result":{"ok":true}}"#)
            .unwrap();
        assert_eq!(v["result"]["ok"], true);
    }

    #[test]
    fn parse_sse_single_event() {
        let body = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"n\":1}}\n\n";
        let v = parse_sse(body).unwrap();
        assert_eq!(v["result"]["n"], 1);
    }

    #[test]
    fn parse_sse_takes_last_message() {
        let body = concat!(
            "data: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\"}\n\n",
            "data: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"done\":true}}\n\n",
        );
        let v = parse_sse(body).unwrap();
        assert_eq!(v["result"]["done"], true);
    }

    #[test]
    fn parse_sse_multiline_data() {
        let body = "data: {\"a\":\ndata: 1}\n\n";
        let v = parse_sse(body).unwrap();
        assert_eq!(v["a"], 1);
    }

    #[test]
    fn unwrap_result_ok_and_error() {
        let ok = serde_json::json!({"jsonrpc":"2.0","id":1,"result":{"x":1}});
        assert_eq!(unwrap_result(ok).unwrap()["x"], 1);
        let err = serde_json::json!({"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"expired"}});
        let msg = unwrap_result(err).unwrap_err();
        assert!(msg.contains("expired"));
    }

    #[test]
    fn tool_payload_prefers_structured_content() {
        let result = serde_json::json!({
            "structuredContent": {"items": [1, 2]},
            "content": [{"type":"text","text":"{\"ignored\":true}"}]
        });
        assert_eq!(tool_payload(&result).unwrap()["items"][0], 1);
    }

    #[test]
    fn tool_text_content_parses_json() {
        let result = serde_json::json!({
            "content": [{"type":"text","text":"{\"job_id\":\"j1\"}"}]
        });
        let v = tool_text_content(&result).unwrap();
        assert_eq!(v["job_id"], "j1");
    }
}
