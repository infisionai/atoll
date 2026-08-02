---
title: Connect Kling
description: Connect Kling to Atoll and use its live image and video catalog with membership credit status.
---

# Connect Kling

Kling exposes image and video generation modes through its live account catalog. Atoll also queries Kling's membership and credit response so the remaining credit balance can be shown in the app.

## Outcome

After setup, Kling is available for live-catalog image and video generation. Atoll displays the remaining credit value returned by Kling's membership/credit query; a pre-run `$` estimate is not available.

## Prerequisites

- A Kling account that can authorize the MCP connection.
- Atoll running on macOS for the verified browser-launch flow.

::: warning
Provider OAuth connection on Windows is not verified. The current connection layer invokes the macOS `open` command to launch the browser.
:::

## Steps

1. Open **Settings → Provider Connections**.
2. Find **Kling** and choose **Connect**.
3. Complete the login and consent flow in the browser.
4. Return to Atoll after the browser reports that login is complete.

Kling uses OAuth with PKCE and the scopes needed for generation, task status, and account credit access. Its account is independent from the other providers.

::: warning
Submitting a Kling image or video generation job spends provider credits. Kling MCP does not provide a pre-run estimate, so no `$` estimate is expected before submission.
:::

## Verify

After connecting:

- Kling appears as **Connected** in Provider Connections, with the authorized account when available.
- Atoll reads the live `who_am_i` response and caches the account-specific catalog. Model names, parameters, and available membership-dependent entries are not copied into this page.
- The catalog supports four modes: text-to-image, image-to-image, text-to-video, and image-to-video. These normalize to image or video output types.
- **Refresh balance** calls `query_membership_and_credits`. Atoll selects a remaining-credit field rather than the membership total, then displays the resulting credit value in Settings and the canvas balance chip.
- Kling has no cost-estimate operation. The absence of a `$` estimate is normal.

## Media input requirements

Kling image inputs must be provider-accessible HTTPS URLs. Atoll sends them as URL inputs; a local file path or a direct local file object is not accepted by the Kling adapter.

For an image-to-image or image-to-video node, make sure the media has an `https://` URL before running it. Text-to-image and text-to-video nodes do not need a media input.

::: warning
A submission with a media input is still billable. Verify that the HTTPS URL is reachable by Kling before submitting.
:::

## Troubleshoot

### Connection fails

Check that no other provider connection is waiting for the browser callback. Higgsfield, Magnific, and Kling share local callback port `17872`, so only one connection flow can use it at a time.

### Membership or balance is not shown

Choose **Refresh balance**. Kling's response contains membership and credit fields; Atoll displays the remaining-credit value selected by the provider parser. If no recognized remaining-credit field is returned, the balance cannot be displayed until the provider response is available in a supported shape.

### The session expired

Choose **Reconnect** on the expired Kling card and complete the browser login again. If token refresh fails, a fresh OAuth login is required.

### A media input is rejected

Confirm that the input has an `https://` URL and is accessible to Kling. A local path, `http://` URL, or an unavailable URL will not satisfy the adapter's input check.

For broader connection, credential, and callback checks, see [Troubleshooting](/help/troubleshooting).

## Next steps

- [Provider overview](/providers/)
- [Connect Higgsfield](/providers/higgsfield)
- [Connect Magnific](/providers/magnific)
