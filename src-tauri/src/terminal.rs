//! Agent terminal — PTY spawn and relay (the PTY bridge).
//!
//! One session per workspace. cwd is the app-managed folder `<app data>/workspaces/<id>/`.
//! PTY output may split UTF-8 sequences across chunks, so it is carried in events as base64.

use base64::Engine;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub struct TerminalState(pub Mutex<HashMap<String, Session>>);

impl Default for TerminalState {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

pub struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    workspace_id: String,
    /// PTY output chunk (base64)
    data: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalExit {
    workspace_id: String,
}

/// Workspace-specific folder — created if missing
pub fn workspace_dir(app: &AppHandle, workspace_id: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("workspaces")
        .join(workspace_id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Write the agent glue files — local MCP server registration (.mcp.json) + Stop hook.
/// Rewritten every time a terminal opens (so port/format changes propagate automatically)
fn write_agent_glue(dir: &std::path::Path, workspace_id: &str) -> Result<(), String> {
    let port = crate::mcp_server::MCP_PORT;
    let token = crate::mcp_server::session_token();

    // Project MCP config that Claude Code auto-detects from the cwd —
    // the workspace id routes to the canvas, the session token authenticates
    // (the local server rejects unauthenticated calls — they can spend credits)
    let mcp = serde_json::json!({
        "mcpServers": {
            "atoll-canvas": {
                "type": "http",
                "url": format!("http://127.0.0.1:{port}/mcp/{workspace_id}?t={token}")
            }
        }
    });
    std::fs::write(
        dir.join(".mcp.json"),
        serde_json::to_string_pretty(&mcp).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    // Hook: notifies the app when a response ends — a one-shot POST
    let hooks = serde_json::json!({
        "hooks": {
            "Stop": [{
                "hooks": [{
                    "type": "command",
                    "command": format!("curl -s -m 2 -X POST 'http://127.0.0.1:{port}/hook/{workspace_id}?t={token}' -d '{{\"event\":\"stop\"}}' >/dev/null 2>&1 || true")
                }]
            }]
        }
    });
    let claude_dir = dir.join(".claude");
    std::fs::create_dir_all(&claude_dir).map_err(|e| e.to_string())?;
    std::fs::write(
        claude_dir.join("settings.json"),
        serde_json::to_string_pretty(&hooks).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    // Agent behavior rules — the canvas takes priority even when global MCP servers (other generation tools) exist.
    // claude reads CLAUDE.md, codex reads AGENTS.md — the same rules are written to both
    let rules = agent_rules();
    std::fs::write(dir.join("CLAUDE.md"), rules).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("AGENTS.md"), rules).map_err(|e| e.to_string())?;
    Ok(())
}

/// Shared rules for workspace agents
fn agent_rules() -> &'static str {
    r#"# Atoll Canvas Workspace

This folder is a canvas workspace of the Atoll desktop app. You are running in the terminal
on the right side of the canvas, and the user continues working on your results as canvas nodes.

## Generation requests must go through the canvas

Perform image, video, and other generation requests on the canvas via the **atoll-canvas MCP tools**.
Do not use other generation MCP tools (global connectors, etc.) even if they are visible — if results
leak outside the canvas, the user cannot continue working with them.

Procedure:
1. Check the current graph with `canvas_state`
2. Pick a model with `list_models` (filter by output_type)
3. `canvas_add_node` (kind=model, ref=model id) → `canvas_set_value` (prompt, etc.) → `canvas_connect` if needed
4. `canvas_run` — **this spends real credits.** Run only when the user explicitly asked for it
5. Wait for completion with `job_wait`, then report the result

## Node references pasted by the user

`@atoll:node/<id>` points to a specific node on the canvas. Usually only the token is pasted —
the convention is that you look up the full context yourself:

1. Find the node with that id via `canvas_state` and check its kind, model, values (prompt, options), and connections
2. If `media.localPath` in the node values (the local cache path) is an **image**, you may open it directly with Read.
   Do not open video, audio, or 3D files — judge from the prompt and option context instead.
   (When the detailed long form is pasted, the `File:` line is the same path)
3. Base follow-up work (variations, regeneration, comparison) on that node —
   when creating a new node, connect it to the original with `canvas_connect`
"#
}

/// Agent profile → launch command. MCP registration differs per agent:
/// - claude: auto-detects .mcp.json in the cwd (generated by write_agent_glue)
/// - codex: injects the URL via a per-session -c override so the global config stays untouched
fn agent_command(agent: &str, workspace_id: &str) -> String {
    let port = crate::mcp_server::MCP_PORT;
    let token = crate::mcp_server::session_token();
    match agent {
        "codex" => format!(
            r#"codex -c 'mcp_servers.atoll_canvas.url="http://127.0.0.1:{port}/mcp/{workspace_id}?t={token}"'"#
        ),
        _ => "claude".into(),
    }
}

/// Workspace ids are app-generated (`ws-<hex>`) — reject anything else before the id
/// reaches a filesystem path or a shell command line
fn is_valid_workspace_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Start a session — no-op if one already exists. Goes through the login shell to avoid PATH issues
#[tauri::command]
pub fn terminal_start(
    app: AppHandle,
    state: tauri::State<TerminalState>,
    workspace_id: String,
    agent: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), String> {
    if !is_valid_workspace_id(&workspace_id) {
        return Err(format!("Invalid workspace id: {workspace_id}"));
    }
    let mut sessions = state.0.lock().unwrap();
    if sessions.contains_key(&workspace_id) {
        return Ok(());
    }

    let cwd = workspace_dir(&app, &workspace_id)?;
    write_agent_glue(&cwd, &workspace_id)?;
    let pty = native_pty_system()
        .openpty(PtySize {
            cols: cols.unwrap_or(80),
            rows: rows.unwrap_or(24),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // GUI apps get a sparse PATH — launch the agent through the user's login shell
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let agent_cmd = agent_command(agent.as_deref().unwrap_or("claude"), &workspace_id);
    let mut cmd = CommandBuilder::new(shell);
    cmd.args(["-l", "-c", &agent_cmd]);
    cmd.cwd(&cwd);

    let child = pty.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let killer = child.clone_killer();
    let writer = pty.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pty.master.try_clone_reader().map_err(|e| e.to_string())?;

    // Output pump — on EOF (process exit), clean up the session and emit the exit event
    {
        let app = app.clone();
        let workspace_id = workspace_id.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let _ = app.emit(
                            "terminal/output",
                            TerminalOutput {
                                workspace_id: workspace_id.clone(),
                                data: base64::engine::general_purpose::STANDARD.encode(&buf[..n]),
                            },
                        );
                    }
                }
            }
            if let Some(state) = app.try_state::<TerminalState>() {
                state.0.lock().unwrap().remove(&workspace_id);
            }
            let _ = app.emit("terminal/exit", TerminalExit { workspace_id });
        });
    }

    sessions.insert(
        workspace_id,
        Session {
            writer,
            master: pty.master,
            killer,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn terminal_write(
    state: tauri::State<TerminalState>,
    workspace_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state.0.lock().unwrap();
    let session = sessions
        .get_mut(&workspace_id)
        .ok_or_else(|| format!("No session: {workspace_id}"))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_resize(
    state: tauri::State<TerminalState>,
    workspace_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.0.lock().unwrap();
    let session = sessions
        .get(&workspace_id)
        .ok_or_else(|| format!("No session: {workspace_id}"))?;
    session
        .master
        .resize(PtySize {
            cols,
            rows,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

/// Force-kill a session — cleanup before restart. The output pump's EOF handles the rest (map removal and exit event)
#[tauri::command]
pub fn terminal_kill(state: tauri::State<TerminalState>, workspace_id: String) -> Result<(), String> {
    let mut sessions = state.0.lock().unwrap();
    if let Some(session) = sessions.get_mut(&workspace_id) {
        let mut killer = session.killer.clone_killer();
        let _ = killer.kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_id_validation() {
        assert!(is_valid_workspace_id("ws-18c7afd62aa9a8b8"));
        assert!(!is_valid_workspace_id(""));
        assert!(!is_valid_workspace_id("../escape"));
        assert!(!is_valid_workspace_id("a;rm -rf /"));
        assert!(!is_valid_workspace_id(&"x".repeat(65)));
    }
}
