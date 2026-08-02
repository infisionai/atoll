---
title: Install on macOS
description: Download and install the unsigned Atoll macOS app from the official GitHub Release.
---

# Install on macOS

## Outcome

You will install Atoll from the official GitHub Releases page and open the dashboard on your Mac.

GitHub Releases is the only official distribution channel for Atoll:
<https://github.com/infisionai/atoll/releases/latest>.

## Prerequisites

- A Mac with Apple Silicon or an Intel processor.
- Permission to copy an application into `/Applications`.
- A browser for provider sign-in after installation.

## Steps

1. Open the [latest Atoll release](https://github.com/infisionai/atoll/releases/latest).

2. Choose the `.dmg` that matches your Mac's chip:

   - Apple Silicon: choose the asset labeled `aarch64`.
   - Intel: choose the asset labeled `x64`.

   The release workflow builds the Apple Silicon target as `aarch64-apple-darwin` and the Intel target as `x86_64-apple-darwin`. Release asset names follow the Atoll product name and release version, so select the `.dmg` matching your chip if the exact filename changes.

3. Open the downloaded `.dmg`.

4. Drag `Atoll.app` to the `Applications` shortcut in the mounted disk image.

5. Atoll is currently unsigned. On the first launch, verify that you downloaded the app from the official GitHub Releases page, then use one of macOS's documented opening paths:

   - In Finder, open `Applications`, Control-click or right-click `Atoll.app`, choose **Open**, then confirm **Open**.
   - Or try to open the app once, then go to **System Settings > Privacy & Security** and choose **Open Anyway** for Atoll.

   For an advanced, Terminal-based alternative after verifying the download source:

   ```bash
   xattr -cr /Applications/Atoll.app
   ```

## Verify

Installation succeeded when Atoll opens and the dashboard shows **Workspaces**.

## Troubleshoot

### macOS blocks the first launch

Do not treat the warning as proof that the app is trustworthy. Confirm the source is the official [GitHub Releases page](https://github.com/infisionai/atoll/releases/latest), then use **right-click → Open** or **System Settings > Privacy & Security > Open Anyway**. The `xattr` command above is an advanced alternative only after that source check.

### The app opens but the model library is empty

Open **Settings** from the dashboard and connect a provider. Provider credentials are stored locally as JSON files (file mode 0600 on Unix) under `~/Library/Application Support/infision.atoll/`.

### I downloaded the wrong build

Apple Silicon Macs need the `aarch64` asset. Intel Macs need the `x64` asset. Return to the official release page and download the `.dmg` matching your chip.

## Next steps

Continue with [Your first workflow](/getting-started/first-workflow).
