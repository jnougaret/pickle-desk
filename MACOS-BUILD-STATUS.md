# macOS build status

Build date: 2026-08-18

## Produced locally

The supported arm64 release executable was built successfully:

```text
/Users/joshua/Projects/tournament-desk/src-tauri/target/aarch64-apple-darwin/release/tournament-desk
```

Build command:

```sh
npx tauri build --target aarch64-apple-darwin --no-bundle --ci
```

The executable is a 64-bit arm64 Mach-O binary. It remains under `src-tauri/target/`, which is intentionally gitignored because build output should be generated locally or by the release workflow.

## Universal DMG status

The configured universal DMG command was attempted:

```sh
npm run tauri:build:mac
```

It built the arm64 release target, then stopped before packaging because this machine does not have the `x86_64-apple-darwin` Rust target installed:

```text
failed to build x86_64-apple-darwin binary: Target x86_64-apple-darwin is not installed
```

No DMG was produced locally. To produce it on this Mac, install the full Xcode toolchain and the missing Rust target, then rerun the command:

```sh
rustup target add x86_64-apple-darwin
npm run tauri:build:mac
```

The tagged GitHub Actions release workflow builds the universal DMG on `macos-latest`; it can also produce signed artifacts when the documented Apple signing secrets are configured.
