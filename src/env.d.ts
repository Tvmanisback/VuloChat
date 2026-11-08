/// <reference types="vite/client" />

// Optional bridges injected by the desktop (Pc/) and Android (Capacitor) shells.
interface VuloDesktop {
  isDesktop: true;
  onHotkey: (cb: (action: 'toggleMute' | 'toggleDeafen' | 'pttToggle') => void) => () => void;
  setShortcuts: (binds: Record<string, string>) => void;
  notify: (title: string, body: string) => void;
  windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
}

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  Plugins?: {
    App?: {
      addListener: (event: 'backButton', cb: () => void) => unknown;
      minimizeApp?: () => void;
    };
    StatusBar?: {
      setStyle?: (opts: { style: 'DARK' | 'LIGHT' }) => Promise<void>;
      setBackgroundColor?: (opts: { color: string }) => Promise<void>;
    };
  };
}

interface Window {
  vulo?: VuloDesktop;
  Capacitor?: CapacitorBridge;
}
