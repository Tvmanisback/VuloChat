# VuloChat for Windows (`Pc/`)

Electron shell around the VuloChat website. It adds a frameless window, a tray icon that keeps the app running, global hotkeys, and native notifications.

## What the shell does

| Feature | Where |
| --- | --- |
| Frameless window with minimise, maximise and close | `main.js` (window setup), `src/components/DesktopTitlebar.tsx` (controls) |
| Tray icon and background running | `main.js` (`createTray`, close-to-tray) |
| Global mute, deafen and push-to-talk hotkeys | `main.js` (`registerShortcuts`), `preload.js` |
| Native notifications for DMs and new messages | `vulo:notify` IPC, driven by `src/components/AppShell.tsx` |

Push-to-talk works as a toggle in the desktop app. Electron cannot report key release for global shortcuts.

## Building

The website is copied into `www/` before packaging. CI does this automatically. To do it by hand:

```bash
# from the repository root
npm install && npm run build
rm -rf Pc/www && cp -r dist Pc/www

cd Pc
npm install
npm run dist:win     # writes the installer and portable .exe to Pc/dist/
```

Requires Node 20 or later and Windows (or Wine) for the NSIS installer.

## Icons

Put `build/icon.ico` (256×256, multi-size) and optionally `build/icon.png` in `Pc/build/`. Without them, Electron's default icon is used.
