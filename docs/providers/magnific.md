---
title: Connect Magnific
description: Connect Magnific to Atoll with Premium MCP access and generate images or single-clip videos.
---

# Connect Magnific

Magnific provides image and video generation in Atoll. Its MCP connection requires a Premium plan, and its live catalog supplies the available models and parameters.

## Outcome

After setup, Magnific can generate images and single-clip videos through its Premium MCP connection. The app can refresh the account balance and show pre-run estimates for models that support them.

## Prerequisites

::: warning
Magnific MCP use requires a **Premium plan before you log in**. If you purchase or upgrade the plan immediately before connecting, the entitlement can take time to propagate. Wait briefly, then retry the connection or balance refresh.
:::

- A Magnific account with Premium MCP access.
- Atoll running on macOS for the verified browser-launch flow.

::: warning
Provider OAuth connection on Windows is not verified. The current connection layer invokes the macOS `open` command to launch the browser.
:::

## Steps

1. Confirm that the Magnific Premium plan is active.
2. Open **Settings → Provider Connections**.
3. Find **Magnific** and choose **Connect**.
4. Complete the login and consent flow in the browser.
5. Return to Atoll after the browser reports that login is complete.

The connection uses OAuth with PKCE and a local callback. Magnific's account is independent from Higgsfield and Kling.

::: warning
Submitting an image or video generation job spends Magnific credits. Use the available pre-run estimate before submitting when the selected model supports it.
:::

## Verify

After connecting:

- Magnific appears as **Connected** in Provider Connections, with the authorized account when available.
- Atoll loads and caches a live catalog from `images_models_list` and `video_models_list`. Model names are not copied into this page; the live catalog is authoritative.
- The balance is queried through Magnific's `account_balance` operation and shown in Settings and the canvas balance chip when the account can provide it.
- Image models use image creation identifiers for references.
- Video generation is sent directly to `video_generate` with one clip. Atoll does not use the multi-clip `video_plan` path.
- A video start frame can be represented by an asset URL or a creation identifier. A cross-provider result is passed as its remote URL.
- Auto-family entries, which let the server pick the execution model at run time, are excluded from Atoll's catalog; every listed Magnific model supports the pre-run `$` estimate.

## Troubleshoot

### Login or balance lookup is rejected

Check that Premium MCP access is active. After a new purchase or upgrade, allow the plan change to propagate and retry. Atoll can show the connected state while a Premium-only balance operation still returns a plan restriction.

### The connection is expired

Choose **Reconnect** in the Magnific provider card and complete OAuth again. Token refresh failures are surfaced as an expired session and require a new login.

### Balance is missing

Choose **Refresh balance**. If the account is not Premium, the balance lookup can remain unavailable until the plan is upgraded and propagated.

For broader connection, credential, and callback checks, see [Troubleshooting](/help/troubleshooting).

## Next steps

- [Provider overview](/providers/)
- [Connect Higgsfield](/providers/higgsfield)
- [Connect Kling](/providers/kling)
