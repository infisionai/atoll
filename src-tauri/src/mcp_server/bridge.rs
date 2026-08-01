//! Rust ↔ canvas command bridge — forwards MCP tool calls to the canvas reducer and awaits the reply.
//!
//! The source of truth for the graph lives in the canvas (React reducer). Rust emits commands
//! as events (`canvas/command`); the frontend executes them and replies via the
//! `canvas_command_result` invoke. Id correlation and timeouts are managed here.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

#[derive(Default)]
pub struct CanvasBridge {
    pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    next_id: AtomicU64,
}

/// Send a command to the canvas and wait for the reply.
/// Ends in a timeout if the corresponding workspace tab is not open
pub async fn canvas_request(
    app: &AppHandle,
    workspace_id: &str,
    command: Value,
    timeout: std::time::Duration,
) -> Result<Value, String> {
    use tauri::Manager;
    let bridge = app.state::<CanvasBridge>();
    let id = bridge.next_id.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = oneshot::channel();
    bridge.pending.lock().unwrap().insert(id, tx);

    let _ = app.emit(
        "canvas/command",
        json!({ "id": id, "workspaceId": workspace_id, "command": command }),
    );

    let result = tokio::time::timeout(timeout, rx).await;
    match result {
        Ok(Ok(v)) => {
            if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
                Err(err.to_string())
            } else {
                Ok(v)
            }
        }
        _ => {
            app.state::<CanvasBridge>()
                .pending
                .lock()
                .unwrap()
                .remove(&id);
            Err("No response from the canvas — make sure the workspace tab is open".into())
        }
    }
}

/// The frontend (GraphCanvas) replies with the command execution result
#[tauri::command]
pub fn canvas_command_result(
    state: tauri::State<CanvasBridge>,
    id: u64,
    result: Value,
) -> Result<(), String> {
    if let Some(tx) = state.pending.lock().unwrap().remove(&id) {
        let _ = tx.send(result);
    }
    Ok(())
}
