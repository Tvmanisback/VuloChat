import { useSyncExternalStore } from 'react';

export interface Keybinds {
  toggleMute: string;
  toggleDeafen: string;
  pushToTalk: string;
}

export interface Settings {
  compact: boolean;
  showTimestamps: boolean;
  inputDeviceId: string;
  outputDeviceId: string;
  inputVolume: number; // 0–200
  outputVolume: number; // 0–200
  noiseSuppression: boolean;
  echoCancellation: boolean;
  pushToTalkEnabled: boolean;
  keybinds: Keybinds;
  desktopNotifications: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  compact: false,
  showTimestamps: true,
  inputDeviceId: '',
  outputDeviceId: '',
  inputVolume: 100,
  outputVolume: 100,
  noiseSuppression: true,
  echoCancellation: true,
  pushToTalkEnabled: false,
  keybinds: { toggleMute: 'Control+Shift+M', toggleDeafen: 'Control+Shift+D', pushToTalk: 'Alt+V' },
  desktopNotifications: true,
};

const KEY = 'vulochat.settings.v1';
let current: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed, keybinds: { ...DEFAULT_SETTINGS.keybinds, ...parsed.keybinds } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch, keybinds: { ...current.keybinds, ...patch.keybinds } };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage may be unavailable (private mode) */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => DEFAULT_SETTINGS,
  );
}
