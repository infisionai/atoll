---
title: Connect Higgsfield
description: Connect Higgsfield to Atoll and use its live catalog, balances, and cost estimates.
---

# Connect Higgsfield

Connect a Higgsfield account to browse its live model catalog, check the provider balance, and request a pre-run `$` estimate where the selected generation kind supports it.

## Outcome

After setup, Higgsfield is available as an independent provider in Atoll. Its live catalog is loaded and cached, its balance can be checked, and supported generation nodes can show a pre-run `$` estimate.

## Prerequisites

- A Higgsfield account that can authorize the MCP connection.
- Atoll running on macOS for the verified browser-launch flow.

::: warning
Provider OAuth connection on Windows is not verified. The current connection layer invokes the macOS `open` command to launch the browser.
:::

## Steps

1. Open **Settings → Provider Connections**.
2. Find **Higgsfield** and choose **Connect**.
3. Complete the login and consent flow in the browser.
4. Return to Atoll after the browser reports that login is complete.

The OAuth flow uses PKCE and a local callback. If the browser does not open, the authorization URL is logged so it can be opened manually on the verified platform.

::: warning
Running a Higgsfield generation job spends provider credits. Use the `$` pre-run estimate shown for the selected model or generation kind before submitting when it is available.
:::

## Verify

After the connection succeeds:

- Higgsfield appears as **Connected** in Provider Connections, with the authorized account when available.
- Atoll loads Higgsfield's live model catalog through `models_explore` and caches it for later use. The catalog, not this page, is the source of truth for model names and parameters.
- The balance appears as a credit value in Settings and in the canvas balance chip. Use **Refresh balance** to query Higgsfield's `balance` operation again.
- A supported generation node can show a `$` estimate. The estimate is a preflight and does not submit the job.

## Connect media from another provider

Higgsfield can receive a result produced by the same provider or by another provider.

- A Higgsfield result keeps its Higgsfield job UUID as the media value.
- A result from another provider carries a remote media URL. Before submission, Atoll resolves that cross-provider reference through Higgsfield's `media_import_url` operation, then uses the returned Higgsfield media ID.

This is URL-based media import; the source provider's internal media ID is not sent as if it were a Higgsfield ID.

## Troubleshoot

### Connection fails

Check that no other provider connection is in progress, then try again. The providers share local callback port `17872`, so a second simultaneous connection can fail while the first one is waiting for the browser callback.

### Balance is not shown

Choose **Refresh balance** in Settings. A connected provider with a missing balance is refreshed automatically once; a failed lookup is shown as a notice, while manual refresh remains available.

### The session expired

Choose **Reconnect** on the expired provider card and complete the browser login again. If refresh-token renewal fails, Atoll requires a new OAuth login.

For broader connection, credential, and callback checks, see [Troubleshooting](/help/troubleshooting).

## Next steps

- [Provider overview](/providers/)
- [Connect Magnific](/providers/magnific)
- [Connect Kling](/providers/kling)
