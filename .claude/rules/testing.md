# Testing Rules

## Principle: unit tests only

- Write **unit tests only**. No E2E or browser-automation tests.
- Test core logic by **extracting it into pure functions**: canvas graph operations, the MCP session state machine, cost estimation, schema→form mapping, and so on.
- If a test becomes slow or non-deterministic, fix the design, not the test.

## What we do not test (no implementation details)

- React component rendering, styles, or markup structure
- Tauri IPC glue code
- Anything that actually calls an external MCP provider — **it requires login and executable tools spend real credits. Never.**
- Tests that force private functions or internal state into the open

## The one exception: the MCP client layer

OAuth token refresh, `Mcp-Session-Id` session keeping, and SSE response parsing can't catch protocol-ordering bugs when sliced into pure units.
This layer alone gets a few tests against a **local fake MCP server**.
They must run locally with no external network, and stay fast and deterministic like everything else.

## Running

- Test runners are the standard tools only: Vitest (frontend) / `cargo test` (Rust). No additional test libraries.
- When a feature is done, write the relevant tests with it; the full suite must pass before committing.
