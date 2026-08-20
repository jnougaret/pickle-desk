# Pickle Desk PWA release and maintenance notes

## Status

The PWA is now a shipped third version of Pickle Desk. GitHub Pages deploys the browser build at [jnougaret.github.io/pickle-desk](https://jnougaret.github.io/pickle-desk/) from `main`. The PWA is the mobile distribution for Android and iPadOS; Windows and macOS remain native desktop distributions.

For the complete migration record, release contract, compatibility identifiers, and carried-forward QA limits, see the [Pickle Desk project handoff](PICKLE-DESK-HANDOFF.md).

## Objective

Maintain Pickle Desk as an installable, offline-capable web app for Android and iPadOS without changing the tournament engine or weakening the existing Windows NSIS/MSIX and macOS DMG packaging paths.

## Product boundaries

- The browser PWA remains the browser repository: `localStorage` under `pickle-desk:tournaments` is the durable store, with one-time fallback to the legacy `tournament-desk:tournaments` key, and `.tournament` files remain the portable backup/transfer format.
- Tauri continues to select the SQLite repository through `__TAURI_INTERNALS__`; its installers continue to consume Vite's `dist` directory and keep their current offline WebView2, NSIS, MSIX, and macOS bundle configuration.
- The service worker is a web-only enhancement. It must not be registered for Tauri's non-HTTP application URL and must not intercept desktop database or plugin behavior.
- No network API is required for tournament operation. Cached application assets, browser storage, file import/export, and `window.print()` are the offline operating surface.
- The production PWA is hosted at `/pickle-desk/` on GitHub Pages. Vite's `BASE_PATH` keeps that project-site path separate from the root path used by local browser development and Tauri.

## Shipped behavior

### Installability and metadata

1. A production Vite build contains a valid `manifest.webmanifest` with the Pickle Desk name, short name, standalone display mode, root start URL/scope, theme/background colors, and 192px/512px icons.
2. The HTML document links the manifest, sets the theme color, and includes iPadOS-friendly mobile web-app metadata and an Apple touch icon.
3. The web icon files are committed source assets derived from the existing Pickle Desk artwork, not generated only on one developer machine.
4. The normal `npm run build` command creates the PWA artifacts automatically; no separate packaging step is required before Tauri builds.

### Offline runtime

5. A production build contains a service worker with an explicit build-versioned precache containing `index.html`, the manifest, icons, CSS, JavaScript, and other local build assets.
6. The service worker uses cache-first behavior for same-origin static assets and a network-first navigation strategy with `/index.html` as the offline fallback.
7. Service-worker activation removes older Pickle Desk caches and claims open clients after an update; failed cache entries do not make the build silently incomplete.
8. The app registers the service worker only in a production browser HTTP(S) context. Tauri continues to run without service-worker registration or service-worker errors.
9. A browser refresh and browser restart preserve saved tournaments through the existing browser repository. The service worker does not replace, namespace-conflict with, or clear that storage.

### Touch operation and tournament workflows

10. Pool assignment remains drag-and-drop-capable for mouse/desktop users.
11. Every pool team also has a keyboard/touch-operable, labelled destination control so an iPad/Android user can move a team without drag-and-drop.
12. Moving a team through the touch/keyboard control uses the same domain mutation and persistence path as drag-and-drop and rejects cross-division moves.
13. Browser file import, `.tournament` export, score-sheet printing, scheduling, result entry, standings, and playoff workflows remain available in the PWA build.
14. No external fonts, stylesheets, scripts, images, or network-only dependencies are introduced into the runtime asset graph.

### Desktop compatibility and release safety

15. `npm run build` still produces the frontend directory expected by Tauri.
16. `npm run tauri:smoke` still passes, including the current frontend path, icons, targets, SQLite preload, offline WebView2 installer, and offline CSS checks.
17. The release workflow remains tag-driven and continues to build the existing macOS universal DMG, Windows NSIS installer, and optional Microsoft Store MSIX from the same `dist` output.
18. `.github/workflows/pages.yml` builds the production PWA with `BASE_PATH=/pickle-desk/`, runs the PWA smoke check, and deploys `dist` through GitHub Pages.

## Deployment and release procedure

1. Merge changes to `main`; the Pages workflow builds the PWA and deploys it to `https://jnougaret.github.io/pickle-desk/`.
2. For a local Pages-path build, set `BASE_PATH=/pickle-desk/` before `npm run build` and `npm run pwa:smoke`. Normal local and Tauri builds leave `BASE_PATH` unset and use `/`.
3. Open the deployed HTTPS URL once on each target device before relying on offline launch. Verify the browser's install flow, home-screen launch, persistence, import/export, and printing on physical Android and iPadOS hardware.
4. Keep the PWA link in both `DOWNLOADS.md` and the latest release notes for discovery. Do not upload a PWA binary to the GitHub Release; the Pages URL is the PWA distribution channel.
5. Run the desktop release workflow separately for tagged Windows and macOS installers. Those native builds use the same frontend source but retain their Tauri/SQLite storage boundary.

## Verification matrix

| Area | Local evidence | Device/follow-up evidence |
| --- | --- | --- |
| GitHub Pages deployment | Pages workflow builds with the project-site base path, runs `npm run pwa:smoke`, and uploads `dist` | Open the deployed HTTPS URL and verify the manifest/service worker from the delivered site |
| Build/install metadata | Manifest JSON, icon dimensions, generated service-worker precache, TypeScript/build tests | Install from a deployed HTTPS origin on Android Chrome and iPadOS Safari |
| Offline reload | Production preview, service-worker cache inspection, network-disabled/fallback test where browser tooling permits | Airplane-mode launch after one online visit on both target platforms |
| Persistence | Browser repository tests plus browser restart/reload smoke | Kill/reopen installed PWA and confirm tournament/results remain |
| Touch pools | Responsive browser viewport and labelled control interaction | Real iPad/Android touch interaction; confirm no accidental scroll or drag dependency |
| Import/export | File input and download path in browser smoke; JSON round-trip tests | Real Files app/Android Files import and export |
| Printing | `window.print()` invocation and print CSS/build inspection | iPadOS/Android print sheet and printer/PDF handoff |
| Desktop installers | Tauri smoke, Vite build, Rust check when available, unchanged release workflow review | Native Windows/macOS release runners and signed installer validation |

## Known QA boundary

This checkout can validate the production build, service-worker files, responsive behavior, persistence contract, and desktop packaging inputs. It cannot truthfully certify physical iPadOS/Android installation, airplane-mode launch, native file-provider behavior, or platform print dialogs without those devices. Those checks remain explicit release acceptance items rather than being claimed from desktop emulation.
