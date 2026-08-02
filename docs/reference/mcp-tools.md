---
title: Canvas MCP tools
description: The local MCP tool contract for reading and editing an Atoll canvas.
---

# Canvas MCP tools

Atoll exposes eight tools through a local streamable HTTP MCP server. The server is bound only to `127.0.0.1:17873`; a workspace-specific URL and session token route calls to the open canvas.

## Connection

Use this endpoint shape:

```text
http://127.0.0.1:17873/mcp/<workspace-id>?t=<session-token>
```

Atoll writes the URL automatically to the workspace `.mcp.json` when an agent terminal opens. The token is required on every request. Keep it local, and open the workspace tab before calling a canvas tool: canvas mutations are bridged to the React canvas and time out if that tab is not open.

Successful MCP tool calls return the payload in `structuredContent` and also as a JSON string in a text content item. Tool failures return `isError: true` with a text message.

## Classification

`Read` reads local canvas or provider/job state. `Write` changes the local canvas. `Billable` means the operation can submit provider work and spend provider credits.

## `canvas_state`

Read the current graph. The response includes nodes with their kind, model or reference, values, status-related values, and model field metadata, plus the graph edges. Check it before changing the canvas; a pasted `@atoll:node/<id>` refers to these node IDs.

Input schema:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| — | — | No | No properties. |

Response shape: `{ "nodes": [...], "edges": [...] }`. Model nodes include `fields` entries with `name`, `kind`, `required`, and `connectable`.

Classification: **Read**

## `list_models`

Read the merged catalog of connected providers. Use the returned `ref` as the model `ref` in `canvas_add_node`.

Input schema:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `output_type` | string enum: `image`, `video`, `audio`, `3d` | No | Filter by output type; omit for all types. |

Response shape: `{ "models": [...] }`, where each entry contains `ref`, `name`, `output_type`, `developer`, `description`, and `provider`. Unconnected providers are skipped; if no provider catalog can be returned, the tool reports the last catalog error.

Classification: **Read**

## `canvas_add_node`

Add a node to the canvas. For `kind: "model"`, `ref` must be a model ID from `list_models`; for an asset, use `image` or `video`; for an edit node, use an edit operation ID.

Input schema:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | string enum: `model`, `asset`, `edit` | Yes | Node kind to add. |
| `ref` | string | Yes | Model ID, asset type, or edit operation ID. |
| `x` | number | No | Canvas x position. If omitted, Atoll places the node near the viewport center. |
| `y` | number | No | Canvas y position. If omitted, Atoll places the node near the viewport center. |
| `values` | object | No | Initial field values, for example `{ "prompt": "..." }`. |

Response shape: `{ "nodeId": "..." }`.

Classification: **Write**

## `canvas_set_value`

Set one field value on an existing node. Use `canvas_state` first to discover the model's field names.

Input schema:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `nodeId` | string | Yes | Target node ID. |
| `name` | string | Yes | Field name, such as `prompt` or `aspect_ratio`. |
| `value` | any JSON value | Yes | Value to store. The schema intentionally leaves this type unspecified. |

Response shape: `{ "ok": true }`.

Classification: **Write**

## `canvas_connect`

Connect a node output to another node's input port. The canvas validates that the output-to-input direction is correct and that the port types match exactly.

Input schema:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `fromNode` | string | Yes | Source node ID. Its output port is used. |
| `toNode` | string | Yes | Destination node ID. |
| `toPort` | string | Yes | Destination input field name from `canvas_state`. |

Response shape: `{ "ok": true }`.

Classification: **Write**

## `canvas_disconnect`

Remove a connection between a node output and an input port.

Input schema:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `fromNode` | string | Yes | Source node ID. |
| `toNode` | string | Yes | Destination node ID. |
| `toPort` | string | Yes | Destination input port name. |

Response shape: `{ "ok": true }`.

Classification: **Write**

## `canvas_run`

Submit a model node for generation. Atoll creates pending result nodes automatically and returns the provider job IDs; use `job_wait` to observe completion.

Input schema:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `nodeId` | string | Yes | Model node to run. |

Response shape: `{ "jobIds": ["..."] }`.

::: danger
`canvas_run` is billable. This spends provider credits. Call it only after the user explicitly asks for generation.
:::

Classification: **Write · Billable**

## `job_wait`

Wait for a generation job belonging to the current workspace. The tool watches the locally tracked status while Atoll's polling worker checks the provider.

Input schema:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `jobId` | string | Yes | Job ID returned by `canvas_run`. |
| `timeoutSeconds` | number | No | Maximum wait; defaults to `180` seconds and is clamped to 5–600 seconds. |

Response shapes:

- Done: `{ "status": "done", "urls": [...], "localPath": "..." }` (`localPath` can be absent).
- Failed: `{ "status": "failed", "message": "..." }`.
- Still running at the requested wait limit: `{ "status": "running", "note": "Still in progress — call job_wait again" }`.

Classification: **Read**
