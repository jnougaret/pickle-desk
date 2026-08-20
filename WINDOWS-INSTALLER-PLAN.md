# Windows installer plan

This document covers the Windows desktop version only. Pickle Desk also ships as a macOS desktop app and as an installable browser PWA for Android and iPadOS; direct users to [DOWNLOADS.md](DOWNLOADS.md) when they need to choose between the three versions.

The repository migration and final cross-platform release contract are recorded in the [Pickle Desk project handoff](docs/PICKLE-DESK-HANDOFF.md).

This document contains a ready-to-run prompt for a Windows machine with the repository checked out. It builds the NSIS installer, validates the application, and verifies that the installed app works offline. The Microsoft Store MSIX flow is documented separately in `packaging/msix/README.md`.

## Prerequisites

Install these before running the prompt:

- Git for Windows
- Node.js 22 LTS or newer
- Rust stable with the `x86_64-pc-windows-msvc` target
- Visual Studio 2022 Build Tools with “Desktop development with C++” and the Windows 10/11 SDK
- PowerShell 7 or Windows PowerShell

The repository’s Tauri configuration embeds the offline WebView2 installer. The build machine may need internet access to download npm, Cargo, and Tauri build dependencies, but the resulting installer should not need internet access to install WebView2 or run Pickle Desk.

## Ready-to-run prompt

Paste this prompt into the coding agent running on Windows from the repository root:

```text
Work in the checked-out Pickle Desk repository. Produce and verify the Windows NSIS installer.

First inspect the current branch, git status, git diff, git remote -v, and the repository instructions. Preserve intentional user work. Do not reset, clean, or discard files. Do not change the Svelte UI or tournament engine unless a build error requires a minimal fix.

Use PowerShell commands and keep all generated build output under the existing ignored target/dist directories.

1. Verify prerequisites:
   - node --version
   - npm --version
   - rustc --version
   - cargo --version
   - rustup target list --installed
   - npx tauri --version
   Confirm that the MSVC Rust target is installed. If it is missing, install only `x86_64-pc-windows-msvc` with rustup.

2. Install exactly from the lockfiles:
   npm ci

3. Run the repository checks:
   npm test
   npx tsc --noEmit
   npm run build
   npm run tauri:smoke
   cargo check --manifest-path src-tauri/Cargo.toml

4. Build the Windows NSIS installer:
   - If Windows signing secrets are configured, import the PFX certificate into the current-user certificate store, determine its thumbprint, write a temporary `src-tauri/tauri.windows.conf.json` containing `certificateThumbprint`, `digestAlgorithm: "sha256"`, and a timestamp URL, then run:

       npm run tauri:build:windows -- --config src-tauri/tauri.windows.conf.json

   - If signing credentials are not configured, run:

       npm run tauri:build:windows

     Clearly label the result unsigned. Do not invent a signature or claim SmartScreen approval.

5. Locate and report the installer:
   - Expected path: `src-tauri/target/release/bundle/nsis/*-setup.exe`
   - Record the exact filename, byte size, SHA-256 hash, and Authenticode status.
   - Confirm that the artifact is an NSIS setup executable and that the offline WebView2 installer is configured.

6. Perform an offline smoke test on a clean Windows test account or VM:
   - Install the setup executable with network access disabled if the test image already has the required Windows components, or install using the embedded offline WebView2 path.
   - Launch Pickle Desk with network access disabled.
   - Create a small tournament, add one division and teams, generate pools/matches, and save a result.
   - Exit and relaunch the installed app; verify the tournament and result remain present.
   - Export a `.tournament` file, delete only the test tournament, then import the exported file and verify it restores correctly.
   - Do not touch any user’s existing tournament data.

7. At the end, report:
   - commands run and pass/fail status
   - exact installer path and SHA-256 hash
   - whether the installer is signed
   - whether the offline install and offline relaunch tests passed
   - any remaining limitation requiring credentials, another machine, or manual review

Do not push, delete, or rewrite unrelated files. Leave the installer in the ignored `src-tauri/target` output directory and keep the repository source changes reviewable.
```

## Optional signing variables

For the signed path, provide the certificate and password to the Windows build agent using its secret store. The release workflow uses:

- `WINDOWS_CERTIFICATE`: base64-encoded PFX certificate
- `WINDOWS_CERTIFICATE_PASSWORD`: PFX export password
- `WINDOWS_TIMESTAMP_URL`: optional RFC 3161 timestamp URL

The certificate must be a Windows code-signing certificate, not an SSL/TLS certificate. Unsigned installers can run, but Windows SmartScreen may warn users.
