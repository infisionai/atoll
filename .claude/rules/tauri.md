---
paths:
  - "src-tauri/**"
---

# Tauri / Rust Rules

## Structure

- The Rust core lives in `src-tauri/`. Entry is `main.rs` → `atoll_lib::run()` (`lib.rs`); keep logic on the lib side (testable).
- Write domain logic as **pure modules** separated from Tauri handlers — `#[tauri::command]` functions are thin adapters. Unit tests attach to pure modules only (`cargo test`).

## IPC

- Command names are snake_case and map 1:1 to the type definitions in the frontend's `src/ipc/`. When adding or changing a command, always update both sides.
- Rust → frontend pushes use Tauri events (`emit`). The local HTTP server is only for external processes (agent MCP connections).
- Payloads are explicit serde-serializable structs — don't overuse `serde_json::Value`.

## Dependencies

- Adding crates follows the external-library principle in conventions.md — only near-standard crates (serde, rusqlite, official Tauri plugins); ask the maintainers first for anything else.

## Configuration

- The identifier in `tauri.conf.json` is `infision.atoll` — do not change it.
- Default window 1440×900, minimum 1024×640.
- Never commit `src-tauri/target/` or `src-tauri/gen/`.

## Verification

- After Rust changes, run `cargo check` (fast feedback) and `cargo test`. Use `npm run app:dev` when the frontend needs to be verified together.
