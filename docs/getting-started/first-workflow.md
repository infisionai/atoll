---
title: Your first workflow
description: Create a five-minute Higgsfield image workflow in Atoll and verify its locally cached result.
---

# Your first workflow

## Outcome

In about five minutes, you will connect Higgsfield, create a workspace, add an image model, estimate its cost, run it, and see the generated image in a result node.

## Prerequisites

- Atoll is installed and open.
- A Higgsfield account that can complete the browser-based OAuth sign-in.
- A Higgsfield balance sufficient for the generation.
- An internet connection for provider sign-in, catalog loading, and generation.

## Steps

1. **Connect Higgsfield.** On the dashboard, click the gear button for **Settings**. On **Provider Connections**, find **Higgsfield** and click **Connect**. Complete the OAuth sign-in in your browser. Return to Atoll and wait for the provider to show **Connected** and a balance.

2. **Create a workspace.** Return to the dashboard and click **+ New space**. Atoll creates a workspace and opens its canvas. The dashboard labels workspaces under **Workspaces**.

3. **Add an image model.** In the left **Node library**, open **Models**, select the **Higgsfield** provider tab, and choose the **Image** filter. Add an image model card to the canvas. In the current UI, clicking the model card adds the node to the canvas; you can then position the node as needed.

4. **Enter a prompt.** In the model node, click the `prompt` field and enter a short description, such as `A lighthouse at dusk, calm ocean, cinematic light`.

5. **Check the estimate.** Click the node's `$` badge. Atoll requests a pre-run estimate and displays the returned amount as credits. The estimate is a preflight check and does not submit a generation. If required inputs are missing, complete them before requesting the estimate.

6. **Run the node.** Select the model node and click **Run** in the floating node toolbar.

   ::: warning
   This spends provider credits.
   :::

   Atoll creates a pending result node, changes the generation node to **Running**, and tracks the provider job until it settles.

7. **Wait for the result.** When the job completes, the pending result node becomes a result node with the generated media. For an image workflow, the node displays the image and Atoll downloads a copy into the local media cache.

## Verify

The workflow succeeded when:

- The result node shows the generated image.
- The generating node is no longer in the **Running** state.
- A local copy is available in Atoll's media cache under `~/Library/Application Support/infision.atoll/media/` on macOS. Atoll uses the equivalent app-data directory on other platforms.

## Troubleshoot

### The `$` badge does not return an estimate

Some providers do not expose a pre-run estimate tool. In particular, Kling estimates are unsupported, so its `$` badge may remain unavailable. See [Kling](/providers/kling) for provider-specific details.

### Magnific asks for a Premium plan

Magnific MCP use may require a Premium plan. See [Magnific](/providers/magnific) for its connection and plan requirements.

### Run is unavailable or the node shows an error

Make sure the model node has all required fields, including `prompt`, and that its provider is connected. A result node is created only after Atoll can validate and submit the model inputs.

### The result is still running

Keep the workspace open while the provider job is being tracked. If the app restarts, Atoll reconciles stored jobs when the workspace is opened again.

## Next steps

- Read the [Higgsfield provider guide](/providers/higgsfield).
- Try [Magnific](/providers/magnific) or [Kling](/providers/kling) for another provider workflow.
- Learn how Atoll's [canvas](/concepts/) is organized.
