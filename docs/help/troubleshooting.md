---
title: Troubleshooting
description: Fast checks for installation, providers, jobs, the agent terminal, and MCP.
---

# Troubleshooting

Start with the symptom table, then use the port reference and focused checks below. Keep macOS, Windows, and provider security controls enabled; do not disable firewall, SmartScreen, or other protection globally as a workaround.

## Fast path

| Symptom | Fastest check | Fix |
| --- | --- | --- |
| macOS says “damaged” or “can't be opened” | Confirm this is an unsigned preview build and that Atoll came from the intended release | Follow the [macOS installation steps](/getting-started/install-macos). Do not disable Gatekeeper globally. |
| Windows shows SmartScreen or Smart App Control | Confirm the installer came from the intended Atoll release | Follow the [Windows installation steps](/getting-started/install-windows) and use the documented per-app trust flow. Do not turn off SmartScreen or Smart App Control globally. |
| Provider connect does not open a browser, or the callback fails | Check whether `17872` is already listening | Run `lsof -i :17872`, finish any other provider login, then retry. The callback is bound to `127.0.0.1:17872`; Windows provider OAuth is not verified in the current implementation. |
| Magnific reports “premium required” | Check the plan on the Magnific account in the browser | Magnific MCP access is restricted to premium plans. Upgrade or switch to an eligible plan, allow entitlement changes to propagate, then reconnect or refresh the provider. |
| The `$` estimate does not appear | Check which provider/model the node uses | A `$` badge is an on-demand pre-run estimate, not an automatic promise. Kling has no pre-run estimate tool, so a missing quote there is expected; use the provider's pricing and balance before running. |
| A job times out after 30 minutes, or results are missing after restart | Open the affected workspace tab and wait for job reconciliation | Atoll stops local polling after 30 minutes. Reopen the workspace to resync stored jobs and completed results; a tracking timeout does not cancel the provider task. |
| Agent terminal says `claude` or `codex` is not found | Run `command -v claude` or `command -v codex` in a login shell | Install and log in to the CLI, ensure its directory is in the login-shell PATH, then restart the Atoll terminal session. |
| MCP tools are not visible to the agent | Check port `17873` and restart the session | Run `lsof -i :17873`, confirm the Atoll local MCP server is listening, then end and restart the agent session so it reloads the workspace `.mcp.json` or Codex per-session override. Keep the workspace tab open. |

## Provider connection and callback

Atoll starts a loopback callback listener on `127.0.0.1:17872` before opening the provider login URL. Only one provider connection can use the fixed callback port at a time. If a previous connection is still waiting, finish it or let its callback wait expire before trying again.

If the browser did not open, use the authorization URL from the Atoll log and open it manually. The current OAuth connection code invokes macOS `open`; provider OAuth on Windows is therefore a known unverified limitation.

## Magnific plan propagation

A connected account can still show a usage restriction when the provider rejects the balance request with a premium-account error. The app surfaces this as “Magnific MCP is available on premium plans only — upgrade your plan to use it.” After changing a plan, allow the provider to propagate the entitlement, then refresh the balance or reconnect instead of repeatedly retrying the same request.

## Estimates and credits

The `$` badge calls the provider's estimate/preflight path only after the node has valid required values. It does not submit a job and does not spend credits. Kling's provider adapter explicitly returns `estimate-unsupported`, because its MCP does not provide a pre-run estimate; this is normal and is different from a failed generation.

::: warning
Running a node spends provider credits. A missing estimate is not confirmation that a run is free; check the provider balance and pricing before using Run.
:::

## Job timeout and restart recovery

The background polling worker has a 30-minute maximum. When it reaches that limit, Atoll marks local tracking as timed out; it does not call a provider cancellation endpoint because providers do not expose one through the current app path.

Jobs are stored with their workspace and provider. When a workspace tab loads, the canvas subscribes to job updates and calls the local job list to reconcile updates that arrived during app restart or before the tab was open. Open the workspace tab first when checking for a result after a restart.

## Agent terminal and MCP

The terminal launches the CLI through a login shell and writes workspace-local integration files each time a session starts. If the CLI works in an interactive terminal but not in Atoll, compare the login-shell PATH and restart the session after changing it.

For MCP visibility, the local server must be listening on `127.0.0.1:17873`, the session URL must include its token, and the workspace tab must be open for canvas bridge commands. Restarting the agent session regenerates the workspace registration and reloads the connection.

## Port reference

All Atoll development and local integration listeners bind to loopback addresses, not public interfaces.

| Port | Owner process | Purpose | Check |
| --- | --- | --- | --- |
| `9010` | Vite/Tauri development server | Development only; the configured dev URL | `lsof -i :9010` |
| `17872` | Atoll provider connection flow | OAuth browser callback, only while connecting | `lsof -i :17872` |
| `17873` | Atoll local MCP server | Canvas MCP HTTP endpoint for agent sessions | `lsof -i :17873` |

If a port is occupied, identify the owning process before stopping anything. Stop only the process that owns the specific development or connection flow, and keep network security features enabled.
