// Narrow bridge between the website and the desktop shell.
// Only these functions are exposed on window.vulo. The page gets no Node access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vulo', {
  isDesktop: true,

  onHotkey(callback) {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('vulo:hotkey', handler);
    return () => ipcRenderer.removeListener('vulo:hotkey', handler);
  },

  setShortcuts(binds) {
    ipcRenderer.send('vulo:shortcuts', binds);
  },

  notify(title, body) {
    ipcRenderer.send('vulo:notify', { title: String(title), body: String(body) });
  },

  windowControl(action) {
    ipcRenderer.send('vulo:window', action);
  },
});
