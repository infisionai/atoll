mod commands;
mod mcp;
mod mcp_server;
mod provider;
mod store;
mod terminal;

use commands::{AppState, ProviderState};
use std::sync::Arc;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      commands::list_workspaces,
      commands::create_workspace,
      commands::rename_workspace,
      commands::duplicate_workspace,
      commands::delete_workspace,
      commands::load_graph,
      commands::save_graph,
      commands::list_providers,
      commands::connect_provider,
      commands::set_provider_api_key,
      commands::disconnect_provider,
      commands::refresh_balance,
      commands::get_catalog,
      commands::get_presets,
      commands::submit_generation,
      commands::list_jobs,
      commands::cancel_job,
      commands::estimate_cost,
      terminal::terminal_start,
      terminal::terminal_write,
      terminal::terminal_resize,
      terminal::terminal_kill,
      mcp_server::bridge::canvas_command_result,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Open the SQLite DB in the app data folder (created if missing)
      let dir = app.path().app_data_dir()?;
      std::fs::create_dir_all(&dir)?;
      let store = store::SqliteStore::open(&dir.join("atoll.db"))
        .map_err(|e| std::io::Error::other(e))?;
      app.manage(AppState(Mutex::new(store)));
      app.manage(terminal::TerminalState::default());
      app.manage(mcp_server::bridge::CanvasBridge::default());
      app.manage(ProviderState(provider::Providers(vec![
        Arc::new(provider::Provider::Higgsfield(
          provider::higgsfield::Higgsfield::new(dir.clone()),
        )),
        Arc::new(provider::Provider::Magnific(
          provider::magnific::Magnific::new(dir.clone()),
        )),
        Arc::new(provider::Provider::Kling(
          provider::kling::Kling::new(dir.clone()),
        )),
        Arc::new(provider::Provider::ElevenLabs(
          provider::elevenlabs::ElevenLabs::new(dir.clone()),
        )),
      ])));

      // Local MCP server — entry point for Claude Code to manipulate the canvas
      mcp_server::start(app.handle().clone());

      // Restart recovery — resume tracking of unfinished jobs
      let open = {
        let state = app.state::<AppState>();
        let jobs = state.0.lock().unwrap().open_jobs();
        jobs.unwrap_or_default()
      };
      for (job_id, workspace_id, node_id, provider_id) in open {
        if provider_id == provider::elevenlabs::PROVIDER_ID {
          log::info!("Closing lost synchronous ElevenLabs job after restart: {job_id}");
          commands::fail_lost_native_job(
            app.handle(),
            &job_id,
            &workspace_id,
            &node_id,
          );
        } else {
          log::info!("Resuming unsettled job: {job_id} ({provider_id})");
          commands::spawn_job_poll(app.handle().clone(), job_id, workspace_id, node_id, provider_id);
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
