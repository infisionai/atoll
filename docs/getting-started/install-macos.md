---
title: Install on macOS
description: Download and install the unsigned Atoll macOS app from the official GitHub Release.
---

# Install on macOS

::: info No release published yet
The first public release has not shipped. These steps apply as soon as the first release appears on the [Releases page](https://github.com/infisionai/atoll/releases); until then, running from source is the only option.
:::

## Outcome

You will install Atoll from the official GitHub Releases page and open the dashboard on your Mac.

GitHub Releases is the only official distribution channel for Atoll:
<https://github.com/infisionai/atoll/releases>.

## Prerequisites

- A Mac with Apple Silicon or an Intel processor.
- Permission to copy an application into `/Applications`.
- A browser for provider sign-in after installation.

## Steps

1. Open the [latest Atoll release](https://github.com/infisionai/atoll/releases).

2. Choose the `.dmg` that matches your Mac's chip:

   - Apple Silicon: choose the asset labeled `aarch64`.
   - Intel: choose the asset labeled `x64`.

   The release workflow builds the Apple Silicon target as `aarch64-apple-darwin` and the Intel target as `x86_64-apple-darwin`. Release asset names follow the Atoll product name and release version, so select the `.dmg` matching your chip if the exact filename changes.

3. Open the downloaded `.dmg`.

4. Drag `Atoll.app` to the `Applications` shortcut in the mounted disk image.

5. Atoll is currently unsigned and not notarized, so recent macOS versions report the downloaded app as **"damaged"** and refuse to open it. The file is not actually damaged — this is Gatekeeper's quarantine flag on an unnotarized app. First verify that the download came from the official GitHub Releases page, then clear the flag in Terminal:

   ```bash
   xattr -cr /Applications/Atoll.app
   ```

   On older macOS versions, Control-click `Atoll.app` → **Open** → **Open**, or **System Settings > Privacy & Security > Open Anyway**, may work without the command.

## Verify

Installation succeeded when Atoll opens and the dashboard shows **Workspaces**.

## Troubleshoot

### macOS says the app is "damaged" or blocks the first launch

Do not treat the warning as proof that the app is trustworthy — confirm the source is the official [GitHub Releases page](https://github.com/infisionai/atoll/releases) first. Then run the `xattr -cr /Applications/Atoll.app` command above; on recent macOS this is required, since **right-click → Open** no longer bypasses Gatekeeper for unnotarized apps.

### The app opens but the model library is empty

Open **Settings** from the dashboard and connect a provider. Provider credentials are stored locally as JSON files (file mode 0600 on Unix) under `~/Library/Application Support/infision.atoll/`.

### I downloaded the wrong build

Apple Silicon Macs need the `aarch64` asset. Intel Macs need the `x64` asset. Return to the official release page and download the `.dmg` matching your chip.

## Next steps

Continue with [Your first workflow](/getting-started/first-workflow).
