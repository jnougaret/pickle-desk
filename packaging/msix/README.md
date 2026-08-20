# Microsoft Store MSIX packaging

This is a Windows desktop distribution of Pickle Desk. The other two app versions are the universal macOS desktop app and the installable browser PWA for Android/iPadOS; use the repository [downloads page](../../DOWNLOADS.md) to direct users to the appropriate version.

The cross-platform migration record and the distinction between visible branding and immutable Store identity are in the [Pickle Desk project handoff](../../docs/PICKLE-DESK-HANDOFF.md).

Pickle Desk is a Tauri Win32 desktop app. The Store package wraps the
release executable in a manually authored MSIX manifest, which is the command-
line packaging flow documented by Microsoft for desktop apps that are not
built from a Visual Studio packaging project.

The `Pickle Desk` product name is reserved in Partner Center. The package
identity values must come from that app reservation. In particular, `MSIX_PACKAGE_NAME`, `MSIX_PUBLISHER`, and
`MSIX_PUBLISHER_DISPLAY_NAME` must match Product identity exactly, including
case and punctuation. The visible product name is Pickle Desk, while the
existing package identity and manifest application id remain
`JoshuaNougaret.TournamentDesk` and `TournamentDesk` so Store updates preserve
the installed app identity. The Store re-signs an MSIX package after
certification; this script intentionally does not add a local signing
certificate.

After reserving the `Pickle Desk` product name, run:

```powershell
$env:MSIX_PACKAGE_NAME = '<Product identity Package/Identity/Name>'
$env:MSIX_PUBLISHER = '<Product identity Package/Identity/Publisher>'
$env:MSIX_PUBLISHER_DISPLAY_NAME = '<Product identity Publisher display name>'
npm run tauri:package:msix
```

The script expects the x64 Tauri executable at
`src-tauri/target/release/pickle-desk.exe` and writes the ignored package
under `src-tauri/target/release/bundle/msix/`.

## Partner Center submission checklist

This package is for the Windows desktop family, including Windows 11. Partner
Center may label the package section **Windows 10 packages** even when the
manifest targets both Windows 10 and Windows 11. Confirm the uploaded package
details show:

- Architecture: `X64`
- Device family: `Windows.Desktop`
- Minimum version: `10.0.19041.0`
- Device-family availability: check **Windows 10/11 Desktop**. Do not select
  Mobile, Xbox, Team, or Mixed Reality for this desktop-only package.

The `1` shown in the package-family table is the package ranking; it does not
replace checking the **Windows 10/11 Desktop** availability box. If Partner
Center shows the controls as read-only, check the application overview before
taking action. A submission in certification should not be cancelled just to
change this setting; make the correction in the next editable submission if
the warning remains.

### `runFullTrust` approval

The package intentionally declares `runFullTrust`. Pickle Desk is a packaged
Tauri/Win32 desktop app (`packagedClassicApp`, `mediumIL`), so this restricted
capability is part of the desktop launch contract. The Partner Center warning
means Store approval is required; it does not mean the capability was added by
mistake. Do not remove it unless the desktop runtime is replaced with an
AppContainer-compatible implementation.

In **Submission Options**, request approval with a rationale such as:

> Pickle Desk is a packaged Tauri/Win32 desktop app. `runFullTrust` is required
> for the MSIX package to launch the desktop executable and support
> user-initiated local workflows, including CSV roster import and tournament
> data save/export. The app does not run background services, request
> administrator privileges, collect telemetry, or transmit tournament data.

Microsoft Store may show the capability warning while the submission is in
certification. Re-check certification status and the public Store listing
after certification completes; do not treat a read-only Packages page as an
instruction to cancel an in-flight submission.
