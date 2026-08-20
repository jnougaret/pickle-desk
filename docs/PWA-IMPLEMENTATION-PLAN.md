# Tournament Desk PWA implementation plan

## Objective

Ship Tournament Desk as an installable, offline-capable web app for Android and iPadOS without changing the tournament engine or weakening the existing Windows NSIS/MSIX and macOS DMG packaging paths.

## Product boundaries

- The browser PWA remains the browser repository: `localStorage` under `tournament-desk:tournaments` is the durable store and `.tournament` files remain the portable backup/transfer format.
- Tauri continues to select the SQLite repository through `__TAURI_INTERNALS__`; its installers continue to consume Vite's `dist` directory and keep their current offline WebView2, NSIS, MSIX, and macOS bundle configuration.
- The service worker is a web-only enhancement. It must not be registered for Tauri's non-HTTP application URL and must not intercept desktop database or plugin behavior.
- No network API is required for tournament operation. Cached application assets, browser storage, file import/export, and `window.print()` are the offline operating surface.

## Acceptance criteria

### Installability and metadata

1. A production Vite build contains a valid `manifest.webmanifest` with the Tournament Desk name, short name, standalone display mode, root start URL/scope, theme/background colors, and 192px/512px icons.
2. The HTML document links the manifest, sets the theme color, and includes iPadOS-friendly mobile web-app metadata and an Apple touch icon.
3. The web icon files are committed source assets derived from the existing Tournament Desk artwork, not generated only on one developer machine.
4. The normal `npm run build` command creates the PWA artifacts automatically; no separate packaging step is required before Tauri builds.

### Offline runtime

5. A production build contains a service worker with an explicit build-versioned precache containing `index.html`, the manifest, icons, CSS, JavaScript, and other local build assets.
6. The service worker uses cache-first behavior for same-origin static assets and a network-first navigation strategy with `/index.html` as the offline fallback.
7. Service-worker activation removes older Tournament Desk caches and claims open clients after an update; failed cache entries do not make the build silently incomplete.
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
18. The final change is committed and pushed to `main` only after local tests and packaging smoke checks pass. No unrelated worktree changes are staged.

## Implementation sequence

1. Add this plan and identify the stable browser/desktop repository boundary.
2. Add web manifest metadata and committed 192px/512px icon assets, reusing the existing application icon.
3. Add a deterministic post-build generator that writes the service worker from the actual `dist` file list and update the build script to run it.
4. Register the service worker from the browser entry point with a safe production/HTTP(S) guard.
5. Add a labelled pool destination select/button flow while retaining desktop drag-and-drop.
6. Add focused tests for service-worker generation invariants, manifest/build output, and the existing browser persistence contract; run the complete repository checks.
7. Test the built app with a production preview, including responsive touch layout, persistence across reload/restart, service-worker cache/fallback behavior, import/export, and printing where the local browser permits.
8. Run Tauri smoke and available Rust/package checks to prove desktop packaging was not disturbed, then review, commit, push `main`, and verify the remote tip.

## Verification matrix

| Area | Local evidence | Device/follow-up evidence |
| --- | --- | --- |
| Build/install metadata | Manifest JSON, icon dimensions, generated service-worker precache, TypeScript/build tests | Install from a deployed HTTPS origin on Android Chrome and iPadOS Safari |
| Offline reload | Production preview, service-worker cache inspection, network-disabled/fallback test where browser tooling permits | Airplane-mode launch after one online visit on both target platforms |
| Persistence | Browser repository tests plus browser restart/reload smoke | Kill/reopen installed PWA and confirm tournament/results remain |
| Touch pools | Responsive browser viewport and labelled control interaction | Real iPad/Android touch interaction; confirm no accidental scroll or drag dependency |
| Import/export | File input and download path in browser smoke; JSON round-trip tests | Real Files app/Android Files import and export |
| Printing | `window.print()` invocation and print CSS/build inspection | iPadOS/Android print sheet and printer/PDF handoff |
| Desktop installers | Tauri smoke, Vite build, Rust check when available, unchanged release workflow review | Native Windows/macOS release runners and signed installer validation |

## Known QA boundary

This checkout can validate the production build, service-worker files, responsive behavior, persistence contract, and desktop packaging inputs. It cannot truthfully certify physical iPadOS/Android installation, airplane-mode launch, native file-provider behavior, or platform print dialogs without those devices. Those checks remain explicit release acceptance items rather than being claimed from desktop emulation.
