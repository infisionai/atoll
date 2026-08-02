---
title: Core concepts
description: The mental model behind Atoll's canvas, providers, jobs, and local media.
---

# Core concepts

Atoll is a local-first canvas for composing provider-backed generation workflows. The shortest useful mental model is:

**canvas → model node → typed port → run → job → result node → local media cache**

Local-first does not mean offline. Atoll stores the canvas, job records, and downloaded media locally, but generation, authentication, and model catalogs still call provider servers.

## Canvas

The canvas is a persistent node graph inside a workspace. It holds model, asset, and edit nodes plus the connections between them, so a workflow can be saved and reopened as a unit. A workspace tab is also the scope used for agent commands and job recovery.

## Model node

A model node represents one catalog model and its provider. Its fields are generated from the model schema: prompts, media inputs, required parameters, and optional advanced parameters become a form rather than an untyped bag of values. Use the provider catalog to choose the model, then fill the node before running it.

## Typed port

Ports carry `text`, `image`, `video`, `audio`, or `3d` values. Connections are directional—an output goes to an input—and only identical types connect, such as an image output to an image input; an image cannot be connected to a text prompt.

## Run

Running a model node submits its normalized values and upstream media references to that node's provider. Atoll creates a pending result node and records the returned job ID so the canvas can continue tracking the work.

::: warning
This spends provider credits. Review the node and its provider before you run it.
:::

## Job

A job is Atoll's local record of a provider-side generation: submission payload, provider, workspace, node, status, and eventual media path. The app polls the provider until the job is done or failed, using the provider's suggested interval when available. Background tracking is capped at 30 minutes; that is a tracking limit, not a provider cancellation.

`Cancel` only stops local tracking and removes the generating result node. Atoll has no provider cancellation API, so a submitted provider task is not canceled or refunded and may still consume credits.

## Result node

A result node is created when a model run is submitted and starts in a pending state. When polling finds a completed payload, Atoll attaches the result URL and turns the node into a media result; a failed job records the failure instead.

## Local media cache

When a provider returns a result URL, Atoll attempts to download the first result into its app-data `media/` directory. The node can use the local path when the download succeeds and keeps the remote URL as a fallback when it does not. Provider URLs may expire, so the cache is what lets completed work remain available locally.

## Provider

A provider is an independent account, model catalog, and credit balance. Connect providers separately, and expect each provider's catalog and balance to be fetched through that provider's server; results can still be chained across providers when port types match. See the [provider overview](/providers/).

## Credit and the `$` badge

Credit means the balance reported by the selected provider; Atoll does not merge provider balances into one wallet. The `$` badge requests a pre-run estimate for the current node values, and an estimate is not a submitted generation. Some providers or models do not expose an estimate—for example, Kling's MCP has no pre-run estimate tool—so a missing badge can be expected.

## One workflow, end to end

Start on the canvas, add a model node whose schema creates the form, and connect compatible typed ports. When you run it, the provider receives the request, Atoll records and polls a job, creates or updates the result node, and downloads the returned media into the local cache. A provider account and server connection are required at the points where Atoll needs authentication, catalogs, estimates, generation, or job status.

For agent-driven versions of the same flow, see [Agent terminal](/agents/terminal) and the [Canvas MCP tools](/reference/mcp-tools).
