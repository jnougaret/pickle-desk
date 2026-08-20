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
