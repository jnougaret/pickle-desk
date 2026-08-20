# Pickle Desk

Offline-first pickleball tournament operations desk built with Svelte and TypeScript.

The project has completed its migration from Tournament Desk to Pickle Desk. The canonical source is [jnougaret/pickle-desk](https://github.com/jnougaret/pickle-desk) on `main`; see the [project handoff](docs/PICKLE-DESK-HANDOFF.md) for the final distribution, compatibility, QA, and follow-up record.

## Choose your app version

Pickle Desk is available in three app versions. They share the same tournament workflows and `.tournament` backup format, but each keeps data in its own local storage:

| Version | Best for | Data and installation |
| --- | --- | --- |
| [PWA for Android and iPadOS](https://jnougaret.github.io/pickle-desk/) | Phones and tablets, including offline tournament-day use | Open the HTTPS app once, then install it from the browser. Tournaments stay in that browser profile. |
| Windows desktop | Windows laptops and desktops | Install the NSIS setup from the [downloads page](DOWNLOADS.md), or [install from the Microsoft Store](https://apps.microsoft.com/detail/9P8ST763N7F3). Tournaments use the desktop SQLite database. |
| macOS desktop | Intel and Apple silicon Macs | Install the universal DMG from the [downloads page](DOWNLOADS.md). Tournaments use the desktop SQLite database. |

The PWA is the mobile version; it is not a fourth native installer and it does not automatically synchronize with either desktop version. Export a `.tournament` file when moving a tournament between versions.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL in a browser. This is the same browser repository used by the PWA: tournament data is stored in local browser storage and can be exported as a portable, versioned `.tournament` JSON file for backup or restore. After the PWA has been opened once online, its cached app shell can launch without a connection.

## Verify

```bash
npm test
npx tsc --noEmit
npm run build
npm run pwa:smoke
npm run tauri:smoke
```

The pure tournament engine lives in `src/lib/tournament/`: pool assignment, round-robin generation, court scheduling, standings, playoff brackets, CSV import, and persistence adapters are separate from the UI.

## Persistence architecture

Application code uses the async `TournamentRepository` contract. The browser adapter uses the Pickle Desk `pickle-desk:tournaments` key and migrates the prior `tournament-desk:tournaments` key on the next save. The Tauri adapter intentionally keeps `sqlite:tournament-desk.db` as its compatibility-stable database path so installed desktop data is not orphaned during the rename; it stores one versioned JSON payload per tournament and applies Rust-registered migrations transactionally.

`.tournament` files are the stable transfer and backup format. New files contain `format`, `schemaVersion`, and `exportedAt`; legacy raw Tournament JSON remains importable. Moving from browser to desktop is explicit: export a `.tournament` file in the browser, install the desktop app, and import the file there. Browser localStorage is not automatically visible to the desktop app.

## Desktop development and packaging

```bash
npm run tauri:dev
npm run tauri:check
npm run tauri:build:mac       # universal-apple-darwin DMG on macOS
npm run tauri:build:windows  # NSIS setup.exe on Windows
npm run tauri:package:msix   # Microsoft Store MSIX from the Windows Tauri executable
```

The installed app contains the built frontend and SQLite plugin; it does not require Node, npm, Rust, or a separately installed SQLite runtime. The NSIS configuration embeds the offline WebView2 installer, so first installation does not need internet access; test the large installer on a clean supported Windows image.

The release workflow in `.github/workflows/release.yml` builds a universal macOS DMG and a Windows NSIS installer on their native runners. The Pages workflow in `.github/workflows/pages.yml` builds and deploys the third, browser-based PWA at `https://jnougaret.github.io/pickle-desk/`. macOS signing/notarization requires `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` (or the documented App Store Connect API variables). Windows signing is enabled when `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`, and optionally `WINDOWS_TIMESTAMP_URL` are supplied; otherwise the workflow produces an unsigned installer that may trigger SmartScreen warnings.

The Microsoft Store MSIX path is documented in `packaging/msix/README.md`. It
wraps the x64 Tauri executable with a Store-compatible Windows 10/11 desktop
manifest and uses the exact package identity values reserved in Partner
Center. Partner Center's **Windows 10 packages** heading includes Windows 11;
the authoritative target is `Windows.Desktop` with minimum version
`10.0.19041.0`. The
display name is Pickle Desk; the package identity and Tauri identifier retain
their original compatibility values so installed legacy copies can upgrade in
place and keep their data. Microsoft re-signs MSIX packages
submitted to the Store after certification.

## Public release downloads

Send users to the [Pickle Desk downloads page](https://pickledesk.joshuanougaret.com/downloads), with the source and full distribution guide in [DOWNLOADS.md](DOWNLOADS.md). It provides the live PWA entry point, stable Windows and macOS links to the latest GitHub Release, release notes, checksums, and the short installation guidance users may need for unsigned builds.

The downloads page is the canonical public distribution guide. Do not replace its release links with binaries committed to the source repository.

## V1 workflow

Create a tournament, add divisions and teams (or import CSV), generate and adjust pools, create round-robin matches, generate a fixed-court schedule, print two score sheets per letter page, enter results, review live standings, and create/advance single-elimination playoffs with a third-place match.
