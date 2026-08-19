# Tournament Desk

Offline-first pickleball tournament operations desk built with Svelte and TypeScript.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL in a browser. Tournament data is stored in local browser storage and can be exported as a portable, versioned `.tournament` JSON file for backup or restore. The app does not require a server or internet connection during tournament operation.

## Verify

```bash
npm test
npx tsc --noEmit
npm run build
npm run tauri:smoke
```

The pure tournament engine lives in `src/lib/tournament/`: pool assignment, round-robin generation, court scheduling, standings, playoff brackets, CSV import, and persistence adapters are separate from the UI.

## Persistence architecture

Application code uses the async `TournamentRepository` contract. The browser adapter keeps using the existing origin/profile-specific `tournament-desk:tournaments` key, migrating its original raw array format on the next save. The Tauri adapter uses `sqlite:tournament-desk.db`, which Tauri resolves under the per-user application data directory; it stores one versioned JSON payload per tournament and applies Rust-registered migrations transactionally.

`.tournament` files are the stable transfer and backup format. New files contain `format`, `schemaVersion`, and `exportedAt`; legacy raw Tournament JSON remains importable. Moving from browser to desktop is explicit: export a `.tournament` file in the browser, install the desktop app, and import the file there. Browser localStorage is not automatically visible to the desktop app.

## Desktop development and packaging

```bash
npm run tauri:dev
npm run tauri:check
npm run tauri:build:mac       # universal-apple-darwin DMG on macOS
npm run tauri:build:windows  # NSIS setup.exe on Windows
```

The installed app contains the built frontend and SQLite plugin; it does not require Node, npm, Rust, or a separately installed SQLite runtime. The NSIS configuration embeds the offline WebView2 installer, so first installation does not need internet access; test the large installer on a clean supported Windows image.

The release workflow in `.github/workflows/release.yml` builds a universal macOS DMG and a Windows NSIS installer on their native runners. macOS signing/notarization requires `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` (or the documented App Store Connect API variables). Windows signing is enabled when `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`, and optionally `WINDOWS_TIMESTAMP_URL` are supplied; otherwise the workflow produces an unsigned installer that may trigger SmartScreen warnings.

## Public release downloads

Send users to the [Tournament Desk downloads page](DOWNLOADS.md). It provides stable Windows and macOS links to the latest GitHub Release, release notes, checksums, and the short installation guidance users may need for unsigned builds.

## V1 workflow

Create a tournament, add divisions and teams (or import CSV), generate and adjust pools, create round-robin matches, generate a fixed-court schedule, print two score sheets per letter page, enter results, review live standings, and create/advance single-elimination playoffs with a third-place match.
