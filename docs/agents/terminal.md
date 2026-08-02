---
title: Agent terminal
description: Run a locally installed Claude Code or Codex CLI against an Atoll workspace.
---

# Agent terminal

Atoll does not contain an agent runtime. Its terminal starts the Claude Code or Codex CLI that is already installed and logged in on your computer, inside a workspace-specific PTY. The agent can inspect and edit the open canvas through Atoll's local MCP server.

## Prerequisites

Install and authenticate the CLI you want to use before opening a session. Verify that the command is visible to your login shell:

::: code-group

```bash [Claude Code]
command -v claude && claude --version
```

```bash [Codex]
command -v codex && codex --version
```

:::

Atoll does not install either CLI or perform its account login. If the command is missing, fix the CLI installation or PATH first; see [Troubleshooting](/help/troubleshooting).

## Start, switch, and end a session

1. Open a workspace and select **Open agent terminal** in the canvas.
2. When no session is running, choose **Claude Code** or **Codex** from the agent picker.
3. Type naturally in the terminal. The header shows `Starting`, `Running`, or `Exited`.
4. Use the stop control to end the running process before switching agents. Use the close control to hide the panel; closing the panel does not end the session.

The terminal is one session per workspace. Atoll launches the selected command through the user's login shell (`$SHELL -l -c`) so the CLI's normal login-shell PATH is available.

## Workspace files and MCP registration

The PTY working directory is the app-managed `workspaces/<workspace-id>/` directory under Atoll's application data. Each time a terminal opens, Atoll refreshes these workspace-local files:

- `.mcp.json` registers `atoll-canvas` at `http://127.0.0.1:17873/mcp/<workspace-id>?t=<session-token>`.
- `CLAUDE.md` and `AGENTS.md` contain the same Atoll rules for Claude Code and Codex.
- `.claude/settings.json` contains a local Stop hook that notifies Atoll when a response ends.

Claude Code discovers the project `.mcp.json` from the working directory. Codex receives a per-session `-c` MCP URL override. Neither path edits the agent's global configuration; the generated project files are the workspace integration surface. Do not copy a session token into documentation or share it.

## Refer to canvas nodes

Select one or more nodes, then press **Cmd/Ctrl+C** or use the node toolbar's copy action. The default clipboard value is a short reference such as `@atoll:node/<id>`; the built-in agent resolves the node's full context with `canvas_state`.

For a terminal outside Atoll, use **Shift+Cmd/Ctrl+C** to copy the detailed text form instead. It includes the model or result context and, when available, a local media file path; non-image media is described without asking the agent to open it directly.

## Shortest useful example

With a workspace open and an agent session running, type:

```text
Add an image model and run it with prompt "a red paper boat on a moonlit lake"
```

The agent should inspect the canvas, use `list_models`, create a model node, set its prompt, and report what it did. Add an explicit run request when you want generation to happen.

::: warning
This spends provider credits. Atoll's workspace rules require the agent to call `canvas_run` only when the user explicitly asked it to run the generation. Asking the agent to prepare a node or workflow does not authorize a run.
:::

The full tool contract is in [Canvas MCP tools](/reference/mcp-tools).
