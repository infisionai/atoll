---
title: Install on Windows
description: Download and install the Atoll Windows installer from the official GitHub Release.
---

# Install on Windows

## Outcome

You will install Atoll from the official GitHub Releases page and open the dashboard on Windows.

GitHub Releases is the only official distribution channel for Atoll:
<https://github.com/infisionai/atoll/releases/latest>.

## Prerequisites

- A Windows machine.
- Permission to run an installer.
- A browser for provider sign-in when the Windows OAuth limitation below does not apply.

## Steps

1. Open the [latest Atoll release](https://github.com/infisionai/atoll/releases/latest).

2. In the release assets, choose a Windows installer: either the `.exe` NSIS installer or the `.msi` package. Choose the asset whose filename matches the Atoll release version.

3. Open the installer and follow its prompts. Keep the installer from the official GitHub release page so that you can verify the file's source before approving Windows security prompts.

4. If Microsoft Defender SmartScreen shows a warning for the unsigned installer, select **More info**, verify the app and source, then select **Run anyway**.

   Windows 11 Smart App Control is a separate control. It may block an unsigned app without offering an individual **Run anyway** path. Do not disable Smart App Control or other system-wide security protections to install Atoll; use an installer permitted by your organization's policy or wait for a signed build.

### Remove Atoll

To uninstall the app, open **Settings > Apps > Installed apps**, find **Atoll**, open its menu, and choose **Uninstall**. An MSI installation can also be removed from **Control Panel > Programs and Features**.

## Verify

Installation succeeded when Atoll opens and the dashboard shows **Workspaces**. Seeing the dashboard confirms the app installation; it does not confirm that provider OAuth works on Windows.

## Troubleshoot

### SmartScreen still blocks the installer

Confirm that the installer came from the official [GitHub Releases page](https://github.com/infisionai/atoll/releases/latest). For the standard SmartScreen prompt, use **More info → Run anyway** only after checking the source. Smart App Control may not provide an individual bypass; do not turn off system security protections.

### Where Atoll stores data

Atoll's application data is stored under `%APPDATA%\infision.atoll\`. Provider credentials are stored locally as JSON files (file mode 0600 on Unix) in the app data directory. Generated media is kept in the app's local `media` cache beneath that directory.

## Known limitation

Provider OAuth connections on Windows have not been verified. The current connection implementation invokes the macOS `open` command to launch the OAuth browser flow, so do not assume that **Settings > Provider Connections > Connect** will complete on Windows. The Windows installer can open the dashboard, but a provider-connected workflow on Windows remains unvalidated.

## Next steps

If your provider connection environment is supported, continue with [Your first workflow](/getting-started/first-workflow). For provider OAuth on Windows, see the limitation above before relying on this path.
