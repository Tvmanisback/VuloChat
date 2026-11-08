// VuloChat desktop shell (Electron).
// Loads the website bundled in ./www and adds: a frameless window, a tray icon with
// background running, global hotkeys for mute/deafen/push-to-talk, and native notifications.

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, Notification, nativeImage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const APP_ID = 'chat.vulo.desktop';
let mainWindow = null;
let tray = null;
let quitting = false;

// One instance only. A second launch brings the existing window forward.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => showWindow());

function iconPath() {
  const candidates = [path.join(__dirname, 'build', 'icon.ico'), path.join(__dirname, 'build', 'icon.png')];
  return candidates.find((p) => fs.existsSync(p));
}

function createWindow() {
  const icon = iconPath();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: 'VuloChat',
    frame: false,
    backgroundColor: '#313338',
    show: false,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'www', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Closing the window hides it to the tray so voice and notifications keep working.
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Keep the app on its own page. Links open in the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const icon = iconPath();
  const image = icon ? nativeImage.createFromPath(icon) : nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip('VuloChat');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open VuloChat', click: () => showWindow() },
      { type: 'separator' },
      {
        label: 'Toggle mute',
        click: () => mainWindow?.webContents.send('vulo:hotkey', 'toggleMute'),
      },
      {
        label: 'Toggle deafen',
        click: () => mainWindow?.webContents.send('vulo:hotkey', 'toggleDeafen'),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('double-click', () => showWindow());
}

// Global hotkeys. The renderer sends its keybinds in Electron accelerator format,
// e.g. "Control+Shift+M". Electron cannot report key release for global shortcuts,
// so push-to-talk works as a toggle on the desktop app.
function registerShortcuts(binds) {
  globalShortcut.unregisterAll();
  const map = {
    toggleMute: 'toggleMute',
    toggleDeafen: 'toggleDeafen',
    pushToTalk: 'pttToggle',
  };
  for (const [key, action] of Object.entries(map)) {
    const accelerator = binds?.[key];
    if (!accelerator) continue;
    try {
      globalShortcut.register(accelerator, () => mainWindow?.webContents.send('vulo:hotkey', action));
    } catch (err) {
      console.warn(`Could not register ${accelerator}:`, err.message);
    }
  }
}

ipcMain.on('vulo:shortcuts', (_event, binds) => registerShortcuts(binds));

ipcMain.on('vulo:notify', (_event, { title, body }) => {
  if (!Notification.isSupported()) return;
  const note = new Notification({ title: String(title).slice(0, 120), body: String(body).slice(0, 240), silent: false });
  note.on('click', () => showWindow());
  note.show();
});

ipcMain.on('vulo:window', (_event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  if (action === 'close') mainWindow.close();
});

app.setAppUserModelId(APP_ID);

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  createWindow();
  createTray();
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('activate', () => showWindow());

// Keep running in the tray when the last window is hidden. Quit only from the tray menu.
app.on('window-all-closed', (event) => {
  if (!quitting) event.preventDefault();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
