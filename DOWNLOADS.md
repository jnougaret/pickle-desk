# Pickle Desk downloads

Choose the version that matches the device you will use during the tournament:

- [Open the Web app](https://pickledesk.joshuanougaret.com/)
- [Microsoft Store download](https://apps.microsoft.com/detail/9P8ST763N7F3)
- [Download the macOS desktop app](https://github.com/jnougaret/pickle-desk/releases/latest/download/Pickle-Desk-macOS-universal.dmg)
- [View the latest release notes and checksums](https://github.com/jnougaret/pickle-desk/releases/latest)

This is the canonical public distribution page for Pickle Desk. The Web app is delivered by Cloudflare Pages at the custom domain; desktop installers are delivered through GitHub Releases and the Microsoft Store. The Microsoft Store version is the recommended Windows option; the bundled installer is documented in the Windows offline-install instructions below.

## Install for offline use

While online, open the [Pickle Desk Web app](https://pickledesk.joshuanougaret.com/), install it using the steps below, and open the new icon once. Then you can use it in Airplane Mode. The Web app saves tournaments in the current browser profile, so export a `.tournament` backup before switching devices or versions.

### iOS (iPhone)

- **Safari:** Open Pickle Desk in Safari. Tap **Share → Add to Home Screen**, turn on **Open as Web App**, then tap **Add**.
- **Chrome:** Open Pickle Desk in Chrome. Tap **Share** beside the address bar, then **Add to Home Screen → Add**. iPhone Chrome uses the Share menu; it does not use Android’s **Install app** menu.

### Android

- **Chrome:** Open Pickle Desk in Chrome. Tap **⋮ → Install app** and confirm. If Chrome shows **Add to home screen → Create shortcut** instead, tap **Add**, then open the new icon once before going offline.

### iPadOS (iPad)

- **Safari:** Open Pickle Desk in Safari. Tap **Share → More → Add to Home Screen**, turn on **Open as Web App**, then tap **Add**.
- **Chrome:** Open Pickle Desk in Chrome. Tap **Share** beside the address bar, then **Add to Home Screen → Add**.

### macOS

- **Chrome Web app:** Open Pickle Desk in Chrome. Choose **⋮ → Cast, save, and share → Install page as app** (or use the install icon in the address bar), then open it once from Applications or the Dock.
- **Safari Web app:** On macOS Sonoma 14 or later, open Pickle Desk in Safari and choose **File → Add to Dock**, then **Add**.
- **Native desktop app:** For the DMG above, drag Pickle Desk to Applications. If macOS blocks the first launch, Control-click the app and choose **Open**, or use **System Settings → Privacy & Security → Open Anyway**. Only approve the official download.

### Windows

- **Chrome Web app:** Open Pickle Desk in Chrome. Choose **⋮ → Cast, save, and share → Install page as app** (or use the install icon in the address bar), then open it once from the desktop or Start menu.
- **Microsoft Store app:** Recommended for most Windows users. Use the [Microsoft Store listing](https://apps.microsoft.com/detail/9P8ST763N7F3) above and choose **Get** or **Install**. Microsoft handles the signed package and Store updates.
- **Bundled installer:** Need a standalone installer or no Store access? The bundled EXE is available as a secondary option. [Download bundled installer (EXE)](https://github.com/jnougaret/pickle-desk/releases/latest/download/Pickle-Desk-windows-setup.exe). It includes WebView2, but the unsigned installer may show **Windows protected your PC**; choose **More info → Run anyway** only for the official download.

The Web app is not a release binary, so it does not appear as a downloadable asset in the GitHub Release. The latest release page links to it for discoverability; this page is the canonical installation guide. The macOS download is a universal build for Apple silicon and Intel Macs. Both desktop apps run locally without Node, Rust, or an internet connection after installation.
