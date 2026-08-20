# Pickle Desk downloads

Choose the version that matches the device you will use during the tournament:

- [Open Pickle Desk PWA for Android and iPadOS](https://jnougaret.github.io/pickle-desk/)
- [Download the Windows desktop app](https://github.com/jnougaret/pickle-desk/releases/latest/download/Pickle-Desk-windows-setup.exe)
- [Install the Windows desktop app from Microsoft Store](https://apps.microsoft.com/detail/9P8ST763N7F3)
- [Download the macOS desktop app](https://github.com/jnougaret/pickle-desk/releases/latest/download/Pickle-Desk-macOS-universal.dmg)
- [View the latest release notes and checksums](https://github.com/jnougaret/pickle-desk/releases/latest)

## PWA for Android and iPadOS

The PWA is the mobile version of Pickle Desk. It runs from the official HTTPS GitHub Pages site and can continue to launch after the app shell has been cached:

1. Open [Pickle Desk PWA](https://jnougaret.github.io/pickle-desk/) while online.
2. Install it from the browser: choose **Install app** or **Add to Home screen** in Android Chrome; on iPadOS Safari, choose **Share → Add to Home Screen**.
3. Open Pickle Desk from the new home-screen icon. Keep the device online for the first launch and whenever a new release needs to be downloaded.

The PWA stores tournaments in the current browser profile, just like a normal browser session. It does not share the desktop SQLite database or synchronize automatically with Windows/macOS. Export a `.tournament` file before switching devices or app versions, and keep important backups outside the browser profile.

The PWA is not a release binary, so it does not appear as a downloadable asset in the GitHub Release. The latest release page links to it for discoverability; this page is the canonical installation guide.

## Windows

1. Open the downloaded `.exe` installer.
2. Follow the prompts to install Pickle Desk for your Windows user.
3. Launch Pickle Desk from the Start menu or desktop shortcut.

The installer includes WebView2, so a separate WebView2 download should not be necessary. If Windows SmartScreen displays a warning, choose **More info** and then **Run anyway** only when the file came from the official links above. Unsigned releases may show this warning.

## macOS

1. Open the downloaded `.dmg` file.
2. Drag Pickle Desk to the Applications folder.
3. Open Pickle Desk from Applications.

The download is a universal build for Apple silicon and Intel Macs. If macOS blocks the first launch, open **System Settings → Privacy & Security**, then choose **Open Anyway** only when the file came from the official links above. Releases may require this step until Apple signing and notarization are configured.

Pickle Desk runs locally and does not require Node, Rust, or an internet connection after installation. The Windows and macOS desktop apps use SQLite, while the PWA uses browser storage. Export important tournaments before installing a major update or moving between app versions so you have a portable backup.
