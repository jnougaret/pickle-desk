# Pickle Desk project handoff

This is the final handoff for the project formerly branded as Tournament Desk. The product name, GitHub repository, custom-domain PWA, release assets, and user-facing documentation now use Pickle Desk.

## Canonical locations

- Source repository: [github.com/jnougaret/pickle-desk](https://github.com/jnougaret/pickle-desk)
- Source branch: `main`
- Browser PWA: [pickledesk.joshuanougaret.com](https://pickledesk.joshuanougaret.com/)
- Distribution page: [DOWNLOADS.md](../DOWNLOADS.md)
- Latest GitHub release: [pickle-desk/releases/latest](https://github.com/jnougaret/pickle-desk/releases/latest)
- Microsoft Store listing: [Pickle Desk](https://apps.microsoft.com/detail/9P8ST763N7F3)

The local checkout directory may still be named `tournament-desk`; that filesystem name is not the product or repository identity. A future checkout should use `pickle-desk`.

## Shipped distribution model

Pickle Desk has three supported versions:

| Version | Distribution | Storage boundary |
| --- | --- | --- |
| PWA | Cloudflare Pages at `pickledesk.joshuanougaret.com` for Android and iPadOS | Browser `localStorage` under `pickle-desk:tournaments` |
| Windows desktop | NSIS installer and Microsoft Store MSIX | Local SQLite through Tauri |
| macOS desktop | Universal Intel/Apple-silicon DMG | Local SQLite through Tauri |

All three versions share the tournament engine and `.tournament` import/export format. They do not synchronize automatically. Export a `.tournament` file when moving between devices or versions.

## Release and deployment rules

- Push source changes to `main`; `.github/workflows/pwa-ci.yml` builds the root production PWA and runs the PWA smoke test. Publish the resulting `dist` directory to the Cloudflare Pages project `pickledesk` at `https://pickledesk.joshuanougaret.com/`.
- Create a version tag such as `v0.2.0` to run `.github/workflows/release.yml` and publish the Windows and macOS installers, optional MSIX, and `SHA256SUMS.txt` to a GitHub Release.
- Do not commit generated `dist` or `src-tauri/target` output, and do not upload the PWA as a release binary. The custom-domain URL is the PWA distribution channel.
- Windows signing is conditional on the documented certificate secrets. macOS signing and notarization are conditional on the documented Apple secrets. Without them, installers may trigger SmartScreen or Gatekeeper warnings.
- The existing `v0.1.0` release was cleaned to use Pickle Desk asset names. A new version tag is required when publishing installer artifacts for changes made after that release.

## Compatibility values that must remain stable

The following old `Tournament Desk` strings are intentional and must not be removed as part of a display-name cleanup:

- Browser migration source key: `tournament-desk:tournaments`
- Tauri database path: `sqlite:tournament-desk.db`
- Legacy `.tournament` file format marker: `tournament-desk`
- Older service-worker cache prefix: `tournament-desk-`
- Microsoft Store package identity: `JoshuaNougaret.TournamentDesk`
- Microsoft Store manifest application id: `TournamentDesk`
- Tauri identifier: `com.tournamentdesk.desktop`

They preserve existing browser data, desktop databases, imported files, service-worker upgrades, and Store in-place updates. New visible names, paths, URLs, screenshots, and release artifacts should use Pickle Desk.

## Verification carried forward from the final project threads

- The live PWA was tested through tournament creation, editing, deletion guards, CSV and `.tournament` import/export, pools, scheduling, score sheets, standings, playoffs, reload persistence, offline cache launch, 390px phone layout, and 768px tablet layout. No functional failures, horizontal overflow, or browser console warnings/errors were reported.
- Repository verification included the unit suite, TypeScript checking, production Vite build, PWA smoke test, Tauri packaging smoke test, and Rust checks. Re-run the commands in [README.md](../README.md) after any source change.
- A Windows NSIS installer was built with the offline WebView2 payload and relaunched successfully in an isolated install. The full interactive create/result/export/import UI sequence was not completed because Windows UI-control approval timed out; do not claim that scenario as verified without repeating it in a normal interactive environment.
- Physical Android/iPadOS installation, home-screen launch, airplane-mode behavior, platform file-provider behavior, and native print dialogs remain device-level checks. Desktop browser emulation is not a substitute for them.

## External/account follow-ups

- Re-check the public Microsoft Store page after the latest Partner Center submission has finished publishing; Partner Center state and the public page can lag each other.
- The Partner Center package is a Windows desktop MSIX, not a Windows 10-only app: its package details are `Windows.Desktop`, `X64`, and minimum version `10.0.19041.0`, which covers Windows 11. In Partner Center, the **Windows 10 packages** heading is the platform label used for Windows 10/11 desktop packages; the **Windows 10/11 Desktop** device-family availability box must be selected for new customers.
- The package intentionally declares the restricted `runFullTrust` capability because the Tauri/Win32 executable is a packaged classic desktop app. The warning requires Store approval and an explanation in Submission Options; it is not a reason to remove the capability. If a submission is already in certification and the Packages page is read-only, leave it in flight and apply any device-family correction in the next editable submission.
- Configure and verify Windows Authenticode and Apple signing/notarization secrets before calling a release trusted for broad distribution.
- Before the next release, decide whether the Tauri bundle publisher metadata should remain `Joshua Nougaret` or be changed to `Driftwood Pickleball`; this is separate from the immutable Microsoft Store publisher identity.

This handoff is the project-level source of truth for the migration. Product implementation details remain in the source and the focused platform documents linked from [README.md](../README.md).
