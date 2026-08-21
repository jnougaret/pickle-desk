# macOS build status

This document covers the macOS desktop version. The installable browser PWA for Android and iPadOS is deployed separately through Cloudflare Pages at [pickledesk.joshuanougaret.com](https://pickledesk.joshuanougaret.com/); see [DOWNLOADS.md](DOWNLOADS.md) for the three-version distribution guide.

See the [Pickle Desk project handoff](docs/PICKLE-DESK-HANDOFF.md) for the canonical repository, release, compatibility, and QA status.

Latest recorded local build: 2026-08-18

## Produced locally

The universal release executable was built successfully:

```text
/Users/joshua/Projects/pickle-desk/src-tauri/target/universal-apple-darwin/release/pickle-desk
```

The resulting Mach-O contains both `arm64` and `x86_64` slices. The standalone arm64 executable is also available at:

```text
/Users/joshua/Projects/pickle-desk/src-tauri/target/aarch64-apple-darwin/release/pickle-desk
```

The universal build command was:

```sh
rustup target add x86_64-apple-darwin
npm run tauri:build:mac
```

Both executables remain under `src-tauri/target/`, which is intentionally gitignored because build output should be generated locally or by the release workflow.

## Universal DMG

The installer was produced here:

```text
/Users/joshua/Projects/pickle-desk/src-tauri/target/universal-apple-darwin/release/bundle/macos/Pickle Desk_0.1.0_universal.dmg
```

Verification:

```text
SHA-256: d140da1d8df1784f2e3d57844551f18193a5b6d7f66a79521d4aee3d52ae9d68
Architectures in the embedded app: x86_64 arm64
```

The standard Tauri bundle command reached its optional Finder-layout AppleScript, which does not complete in this environment. The final DMG was created with the same generated `create-dmg` script using `--skip-jenkins`; this affects Finder icon positioning only, not the application or installer contents.

The app is ad hoc/linker-signed and has no Apple Developer Team ID, so this DMG is not signed or notarized for Gatekeeper distribution. Configure Apple signing and notarization secrets in the release workflow for a distributable signed release.

The tagged GitHub Actions release workflow builds the universal DMG on `macos-latest`; it can also produce signed artifacts when the documented Apple signing secrets are configured.
