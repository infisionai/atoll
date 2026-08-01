//! Local MCP server — the entry point through which Claude Code manipulates the canvas.
//!
//! Fixed port on 127.0.0.1, streamable HTTP (POST-JSON). No external crates —
//! tokio TcpListener + hand-rolled HTTP (same approach as the OAuth callback server).
//! Routes by carrying the workspace id in the URL path: `POST /mcp/<workspace_id>`

pub mod bridge;
pub mod protocol;

use protocol::{handle_message, http_response, parse_head, tool_error, workspace_from_path, Handled, ToolDef};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

/// Local MCP server port — next to the OAuth callback (17872)
pub const MCP_PORT: u16 = 17873;

/// The canvas-control tool set
fn tools() -> Vec<ToolDef> {
    let obj = |props: Value, required: Value| {
        json!({ "type": "object", "properties": props, "required": required })
    };
    vec![
        ToolDef {
            name: "canvas_state",
            description: "Read the current canvas graph — nodes (kind, model, values, status) and connections. Always check this before making changes. The id in @atoll:node/<id> pasted by the user matches the node ids here.",
            input_schema: json!({ "type": "object", "properties": {} }),
        },
        ToolDef {
            name: "list_models",
            description: "Catalog of available generation models — id (ref), name, output type (image/video/audio/3d), description. Use the id as the ref for canvas_add_node.",
            input_schema: obj(
                json!({ "output_type": { "type": "string", "enum": ["image", "video", "audio", "3d"], "description": "Output type filter (omit for all)" } }),
                json!([]),
            ),
        },
        ToolDef {
            name: "canvas_add_node",
            description: "Add a node to the canvas. When kind=model, ref is a model id from list_models. Use the returned nodeId to set values, connect, and run.",
            input_schema: obj(
                json!({
                    "kind": { "type": "string", "enum": ["model", "asset", "edit"] },
                    "ref": { "type": "string", "description": "model: model id / asset: image|video / edit: edit op id" },
                    "x": { "type": "number" }, "y": { "type": "number" },
                    "values": { "type": "object", "description": "Initial field values (e.g. {\"prompt\": \"...\"})" }
                }),
                json!(["kind", "ref"]),
            ),
        },
        ToolDef {
            name: "canvas_set_value",
            description: "Set a node field value (prompt, options, etc.). Check field names with canvas_state first.",
            input_schema: obj(
                json!({
                    "nodeId": { "type": "string" },
                    "name": { "type": "string", "description": "Field name (e.g. prompt, aspect_ratio)" },
                    "value": { "description": "Value to set" }
                }),
                json!(["nodeId", "name", "value"]),
            ),
        },
        ToolDef {
            name: "canvas_connect",
            description: "Connect a node output to another node's input port. Types must match (image output → image input).",
            input_schema: obj(
                json!({
                    "fromNode": { "type": "string" },
                    "toNode": { "type": "string" },
                    "toPort": { "type": "string", "description": "Input port name — a field name from canvas_state (media input field)" }
                }),
                json!(["fromNode", "toNode", "toPort"]),
            ),
        },
        ToolDef {
            name: "canvas_disconnect",
            description: "Remove a connection.",
            input_schema: obj(
                json!({
                    "fromNode": { "type": "string" },
                    "toNode": { "type": "string" },
                    "toPort": { "type": "string" }
                }),
                json!(["fromNode", "toNode", "toPort"]),
            ),
        },
        ToolDef {
            name: "canvas_run",
            description: "Run a generation (model) node — this spends real credits. Pending result nodes are created automatically and jobIds are returned. Wait for completion with job_wait.",
            input_schema: obj(json!({ "nodeId": { "type": "string" } }), json!(["nodeId"])),
        },
        ToolDef {
            name: "job_wait",
            description: "Wait for a generation job to settle (default 180 seconds). Returns result URLs on completion, or the failure reason.",
            input_schema: obj(
                json!({
                    "jobId": { "type": "string" },
                    "timeoutSeconds": { "type": "number", "description": "Maximum wait (default 180)" }
                }),
                json!(["jobId"]),
            ),
        },
    ]
}

/// Per-run session token — required on every request (`?t=<token>`).
/// Without it, any local process (or a drive-by web page POSTing to localhost)
/// could drive the canvas and spend real credits
pub fn session_token() -> &'static str {
    use std::sync::OnceLock;
    static TOKEN: OnceLock<String> = OnceLock::new();
    TOKEN.get_or_init(crate::provider::oauth::random_state)
}

/// Start the server — called once from app setup
pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::bind(("127.0.0.1", MCP_PORT)).await {
            Ok(l) => l,
            Err(e) => {
                log::error!("Failed to bind MCP server port {MCP_PORT}: {e}");
                return;
            }
        };
        log::info!("Local MCP server: http://127.0.0.1:{MCP_PORT}/mcp/<workspace>");
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = serve_connection(app, stream).await {
                            log::warn!("Failed to handle MCP connection: {e}");
                        }
                    });
                }
                Err(e) => log::warn!("MCP accept failed: {e}"),
            }
        }
    });
}

async fn serve_connection(app: AppHandle, mut stream: TcpStream) -> Result<(), String> {
    let (req, body) = read_request(&mut stream).await?;

    let authorized = protocol::query_token(&req.path) == Some(session_token());

    let response = if req.method != "POST" {
        http_response(405, "Method Not Allowed", "{}")
    } else if req.has_origin {
        // An Origin header means a browser cross-origin request — always reject
        http_response(403, "Forbidden", "{}")
    } else if !authorized {
        http_response(401, "Unauthorized", "{}")
    } else if let Some(workspace_id) = workspace_from_path(&req.path) {
        let msg: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
        route_message(&app, workspace_id, &msg).await
    } else if let Some(rest) = req.path.strip_prefix("/hook/") {
        // Claude Code hook — one-shot notification. Forward as an event and respond immediately
        use tauri::Emitter;
        let workspace_id = rest.split(['?', '/']).next().unwrap_or_default();
        let event: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
        let _ = app.emit(
            "agent/notice",
            serde_json::json!({ "workspaceId": workspace_id, "event": event }),
        );
        http_response(200, "OK", "{}")
    } else {
        http_response(404, "Not Found", "{}")
    };

    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    let _ = stream.shutdown().await;
    Ok(())
}

async fn route_message(app: &AppHandle, workspace_id: &str, msg: &Value) -> String {
    let defs = tools();
    match handle_message(msg, &defs) {
        Handled::Reply(v) => http_response(200, "OK", &v.to_string()),
        Handled::Notification => http_response(202, "Accepted", ""),
        Handled::ToolCall { id, name, args } => {
            let result = call_tool(app, workspace_id, &name, args).await;
            let body = match result {
                Ok(v) => protocol::tool_result(id, v),
                Err(e) => tool_error(id, &e),
            };
            http_response(200, "OK", &body.to_string())
        }
    }
}

/// Execute a tool — canvas commands go through the bridge; catalog and job-wait are handled directly in Rust
async fn call_tool(
    app: &AppHandle,
    workspace_id: &str,
    name: &str,
    args: Value,
) -> Result<Value, String> {
    let bridge_cmd = |cmd: &str, args: Value| {
        let mut command = args;
        command["type"] = json!(cmd);
        command
    };
    let short = std::time::Duration::from_secs(10);
    // Run is a submission round-trip (including a remote tools/call), so allow more time
    let long = std::time::Duration::from_secs(60);

    match name {
        "canvas_state" => bridge::canvas_request(app, workspace_id, bridge_cmd("state", json!({})), short).await,
        "canvas_add_node" => bridge::canvas_request(app, workspace_id, bridge_cmd("add_node", args), short).await,
        "canvas_set_value" => bridge::canvas_request(app, workspace_id, bridge_cmd("set_value", args), short).await,
        "canvas_connect" => bridge::canvas_request(app, workspace_id, bridge_cmd("connect", args), short).await,
        "canvas_disconnect" => bridge::canvas_request(app, workspace_id, bridge_cmd("disconnect", args), short).await,
        "canvas_run" => bridge::canvas_request(app, workspace_id, bridge_cmd("run", args), long).await,
        "list_models" => list_models(app, &args).await,
        "job_wait" => job_wait(app, workspace_id, &args).await,
        _ => Err(format!("Unknown tool: {name}")),
    }
}

/// Condense the catalog for the tool response — id, name, output type, developer, and description only.
/// Merges the catalogs of every connected provider
async fn list_models(app: &AppHandle, args: &Value) -> Result<Value, String> {
    let prov = app.state::<crate::commands::ProviderState>();
    let filter = args.get("output_type").and_then(|v| v.as_str());
    let mut models: Vec<Value> = Vec::new();
    let mut last_err: Option<String> = None;

    for p in &prov.0 .0 {
        let catalog = match p.catalog(false).await {
            Ok(v) => v,
            Err(e) => {
                // Skip unconnected providers — produce a result if at least one succeeds
                last_err = Some(e);
                continue;
            }
        };
        models.extend(
            catalog
                .as_array()
                .map(|arr| arr.iter())
                .into_iter()
                .flatten()
                .filter(|m| {
                    filter.is_none_or(|f| m.get("output_type").and_then(|o| o.as_str()) == Some(f))
                })
                .map(|m| {
                    json!({
                        "ref": m.get("id"),
                        "name": m.get("name"),
                        "output_type": m.get("output_type"),
                        "developer": m.get("developer"),
                        "description": m.get("description"),
                        "provider": p.id(),
                    })
                }),
        );
    }
    if models.is_empty() {
        if let Some(e) = last_err {
            return Err(e);
        }
    }
    Ok(json!({ "models": models }))
}

/// Wait for job completion — watches the DB status updated by the polling worker.
/// Scoped to the calling workspace — one workspace cannot watch another's jobs
async fn job_wait(app: &AppHandle, workspace_id: &str, args: &Value) -> Result<Value, String> {
    use crate::provider::jobs::{extract_urls, failure_message};
    let job_id = args
        .get("jobId")
        .and_then(|v| v.as_str())
        .ok_or("jobId is required")?
        .to_string();
    {
        let state = app.state::<crate::commands::AppState>();
        let owner = state.0.lock().unwrap().job_workspace_of(&job_id)?;
        if owner.as_deref() != Some(workspace_id) {
            return Err(format!("No such job in this workspace: {job_id}"));
        }
    }
    let timeout = args
        .get("timeoutSeconds")
        .and_then(|v| v.as_u64())
        .unwrap_or(180)
        .clamp(5, 600);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout);

    loop {
        let row = {
            let state = app.state::<crate::commands::AppState>();
            let store = state.0.lock().unwrap();
            let status = store.job_status_of(&job_id)?;
            status
        };
        match row.as_deref() {
            None => return Err(format!("No such job: {job_id}")),
            Some("running") => {
                if std::time::Instant::now() >= deadline {
                    return Ok(json!({ "status": "running", "note": "Still in progress — call job_wait again" }));
                }
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
            Some(status) => {
                // Finished — extract the result from the payload
                let state = app.state::<crate::commands::AppState>();
                let jobs = {
                    let store = state.0.lock().unwrap();
                    store.jobs_for_workspace_by_job(&job_id)?
                };
                let (payload, media_path, _provider) = jobs;
                let v: Value = serde_json::from_str(&payload).unwrap_or_default();
                return Ok(match status {
                    "done" => json!({
                        "status": "done",
                        "urls": extract_urls(&v),
                        "localPath": media_path,
                    }),
                    "failed" => json!({ "status": "failed", "message": failure_message(&v) }),
                    other => json!({ "status": other }),
                });
            }
        }
    }
}

/// Read the headers plus Content-Length bytes of body
async fn read_request(
    stream: &mut TcpStream,
) -> Result<(protocol::HttpRequest, String), String> {
    let mut buf = Vec::with_capacity(2048);
    let mut chunk = [0u8; 2048];

    // Up to the end of the headers (\r\n\r\n)
    let head_end = loop {
        if let Some(pos) = find_head_end(&buf) {
            break pos;
        }
        if buf.len() > 64 * 1024 {
            return Err("Request headers too large".into());
        }
        let n = stream.read(&mut chunk).await.map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("Connection closed prematurely".into());
        }
        buf.extend_from_slice(&chunk[..n]);
    };

    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let req = parse_head(&head).ok_or("Failed to parse HTTP headers")?;

    // Body cap — tool arguments are small; anything bigger is abuse or a bug
    const MAX_BODY: usize = 1024 * 1024;
    if req.content_length > MAX_BODY {
        return Err(format!("Request body too large: {}", req.content_length));
    }

    let mut body_bytes = buf[head_end + 4..].to_vec();
    while body_bytes.len() < req.content_length {
        let n = stream.read(&mut chunk).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        body_bytes.extend_from_slice(&chunk[..n]);
    }
    body_bytes.truncate(req.content_length);
    Ok((req, String::from_utf8_lossy(&body_bytes).to_string()))
}

fn find_head_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n")
}
