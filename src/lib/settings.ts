import { useSyncExternalStore } from 'react';
import { CUSTOM_DEFAULT, isDark, resolvePalette, toTriple, type CustomThemeColors, type ThemeName } from './themes';

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
  /** Text size as a percentage of the browser's default. */
  textScale: number;
  /** Stops animations and transitions across the app, on top of the system setting. */
  reduceMotion: boolean;
  /** Hides avatar, nameplate and profile decorations on this screen only. Others still see theirs. */
  showDecorations: boolean;
  /** Shows previews under links and images in chat. */
  showLinkPreviews: boolean;
  theme: ThemeName;
  customTheme: CustomThemeColors;
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
  textScale: 100,
  reduceMotion: false,
  showDecorations: true,
  showLinkPreviews: true,
  theme: 'violet',
  customTheme: CUSTOM_DEFAULT,
};

const KEY = 'vulochat.settings.v1';
let current: Settings = load();
const listeners = new Set<() => void>();
applyTheme(current);

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      keybinds: { ...DEFAULT_SETTINGS.keybinds, ...parsed.keybinds },
      customTheme: { ...DEFAULT_SETTINGS.customTheme, ...parsed.customTheme },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Writes the chosen theme into CSS variables, so every color class follows it. */
function applyTheme(s: Settings) {
  if (typeof document === 'undefined') return;
  const palette = resolvePalette(s.theme, s.customTheme);
  const style = document.documentElement.style;
  for (const token of Object.keys(palette) as (keyof typeof palette)[]) {
    style.setProperty(`--vulo-${token}`, toTriple(palette[token]));
  }
  // Native scrollbars and form controls follow the theme's lightness.
  style.setProperty('color-scheme', isDark(palette.chat) ? 'dark' : 'light');
  // Text size, and the in-app reduce-motion switch that index.css reads.
  document.documentElement.style.fontSize = `${s.textScale}%`;
  document.documentElement.dataset.reduceMotion = s.reduceMotion ? 'on' : 'off';
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = {
    ...current,
    ...patch,
    keybinds: { ...current.keybinds, ...patch.keybinds },
    customTheme: { ...current.customTheme, ...patch.customTheme },
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage may be unavailable (private mode) */
  }
  applyTheme(current);
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
