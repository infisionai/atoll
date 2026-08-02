---
title: Provider overview
description: Compare Atoll's Higgsfield, Magnific, and Kling provider connections.
---

# Provider overview

Atoll connects to Higgsfield, Magnific, and Kling through their MCP services. Choose a provider in the model library after connecting it in Settings. Each provider has its own account, session, catalog, balance, and credit rules.

## Compare providers

| Provider | Output types | Cost estimate | Media input | Account requirement | Balance | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Higgsfield | Live catalog-defined types, including image and video where exposed | Supported for supported generation kinds (`$`) | Higgsfield media IDs/UUIDs; cross-provider results are imported from a media URL | Higgsfield account via OAuth | Displayed in Settings and the canvas balance chip | Last verified: 2026-08 |
| Magnific | Image and video | Supported (`$`); Auto-family models are excluded from the catalog | Image creation identifiers; video uses one start frame as a URL or creation identifier | Magnific Premium plan is required for MCP use | Displayed when the account can answer `account_balance`; Premium access is required | Last verified: 2026-08 |
| Kling | Image and video | Not available; no `$` estimate is expected | Provider-accessible HTTPS media URLs only (`inputType: URL`) | Kling account via OAuth | Remaining credits are parsed from membership/credit data and displayed | Last verified: 2026-08 |

The app's live catalog is authoritative for model availability, parameters, supported media ports, and account-specific Kling models. Model names are intentionally not copied into this documentation.

::: warning
Submitting a generation job spends provider credits. Catalog reads, balance refreshes, and supported pre-run estimates do not submit a generation job; Kling has no estimate operation.
:::

## Shared connection behavior

### Browser login

All three providers use OAuth with PKCE. In Settings, choose **Connect**; Atoll opens the provider's login page in the default browser, waits for the local callback, and returns you to the app after authorization.

Provider accounts are independent. Connecting or disconnecting one provider does not connect, disconnect, or replace the credentials for another provider.

Credentials are stored locally as JSON files (file mode 0600 on Unix). The app data directory is:

- macOS: `~/Library/Application Support/infision.atoll/`
- Windows: `%APPDATA%\\infision.atoll\\`

::: warning
Provider OAuth connection on Windows is not verified. The current connection layer invokes the macOS `open` command to launch the browser.
:::

### Disconnecting a provider

1. Open **Settings → Provider Connections**.
2. Find the connected provider.
3. Choose **Disconnect**.

Disconnect removes that provider's local credential file, clears its cached balance, resets its MCP session, and leaves the other providers unchanged. To use the provider again, choose **Connect** and complete OAuth again.

## Troubleshoot

If a provider cannot connect, the balance is missing, or the session has expired, see [Troubleshooting](/help/troubleshooting).

## Next steps

- [Connect Higgsfield](/providers/higgsfield)
- [Connect Magnific](/providers/magnific)
- [Connect Kling](/providers/kling)
