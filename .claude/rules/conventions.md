# Project Conventions

Atoll — a Tauri desktop app that connects MCP providers (Magnific, Higgsfield, Kling, …) into a canvas-based generation workflow.

## Stack

- **Tauri** + **React** + **Vite** + TypeScript

## No external libraries

- Canvas, state management, UI, and utilities are **built in-house by default**. Ask the maintainers first before adding any dependency.
- Approved exceptions:
  - **Xterm.js** — in-app terminal integration
  - Standard test runners (Vitest, `cargo test`)
  - **Storybook** — dev tool. Components are managed as stories for styling consistency (not part of the runtime bundle)
  - **SQLite** — project storage (nodes, edges, result metadata), used on the Rust side
  - **reqwest/tokio** — HTTP and async runtime for the Rust MCP client (de facto standard)
  - **sha2/base64/rand** — crypto/encoding utilities for the OAuth PKCE implementation
  - **portable-pty** — PTY spawning for the terminal panel (Rust, de facto standard from the wezterm family)
  - **three.js** — in-node viewer for 3D results (GLB) (de facto standard WebGL renderer)
- "It's just a small utility" is not an exception either. Write date-fns/lodash/clsx-style helpers yourself.

## Language

- **Everything in the codebase is English**: comments, commit messages, identifiers, UI text, error messages, and logs.
- The one exception: functional Korean data in the Korean IME handling (`korean-ime.ts` and its tests) — those characters are inputs under test, not prose.
- Internal planning docs (dev_docs, private) stay in Korean.

## Unverifiable values

- Do not guess values that are hard to verify, like provider pricing or credit costs — **ask the maintainers**.
