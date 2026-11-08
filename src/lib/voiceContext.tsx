import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { useSettings, getSettings } from './settings';
import { playCue } from './sounds';
import { VoiceSession, type VoiceSnapshot } from './voice';

interface ActiveVoice {
  serverId: string;
  channelId: string;
  channelName: string;
}

interface VoiceCtx {
  active: ActiveVoice | null;
  muted: boolean;
  deafened: boolean;
  snapshot: VoiceSnapshot;
  error: string | null;
  join: (serverId: string, channelId: string, channelName: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  clearError: () => void;
}

const EMPTY_SNAP: VoiceSnapshot = { peerIds: [], speaking: {} };
const VoiceContext = createContext<VoiceCtx | null>(null);

/** Parses an Electron-style accelerator such as "Control+Shift+M" and checks it against a keyboard event. */
export function matchesKeybind(e: KeyboardEvent, bind: string): boolean {
  if (!bind) return false;
  const parts = bind.split('+').map((p) => p.trim().toLowerCase());
  const key = parts[parts.length - 1];
  const want = {
    ctrl: parts.includes('control') || parts.includes('ctrl') || parts.includes('commandorcontrol'),
    alt: parts.includes('alt') || parts.includes('option'),
    shift: parts.includes('shift'),
    meta: parts.includes('meta') || parts.includes('super') || parts.includes('command') || parts.includes('cmd'),
  };
  if (e.ctrlKey !== want.ctrl || e.altKey !== want.alt || e.shiftKey !== want.shift || e.metaKey !== want.meta) return false;
  return e.key.toLowerCase() === key;
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const settings = useSettings();
  const userId = session?.user.id ?? '';

  const [active, setActive] = useState<ActiveVoice | null>(null);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>(EMPTY_SNAP);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<VoiceSession | null>(null);
  const activeRef = useRef<ActiveVoice | null>(null);
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);

  const persistState = useCallback(
    async (patch: { self_mute?: boolean; self_deafen?: boolean }) => {
      if (!userId) return;
      await supabase.from('voice_states').update(patch).eq('user_id', userId);
    },
    [userId],
  );

  const leave = useCallback(async () => {
    sessionRef.current?.leave();
    sessionRef.current = null;
    activeRef.current = null;
    setActive(null);
    setSnapshot(EMPTY_SNAP);
    if (userId) await supabase.from('voice_states').delete().eq('user_id', userId);
    playCue('leave', getSettings().outputVolume);
  }, [userId]);

  const join = useCallback(
    async (serverId: string, channelId: string, channelName: string) => {
      if (!userId) return;
      if (activeRef.current?.channelId === channelId) return;
      if (sessionRef.current) await leave();

      const s = getSettings();
      const vs = new VoiceSession({
        userId,
        channelId,
        inputDeviceId: s.inputDeviceId,
        noiseSuppression: s.noiseSuppression,
        echoCancellation: s.echoCancellation,
        outputDeviceId: s.outputDeviceId,
        outputVolume: s.outputVolume,
        onChange: setSnapshot,
        onError: setError,
      });
      sessionRef.current = vs;
      try {
        await vs.join();
        // Start muted if push-to-talk is on: audio only flows while the key is held.
        const startMuted = s.pushToTalkEnabled || mutedRef.current;
        vs.setMuted(startMuted);
        vs.setDeafened(deafenedRef.current);
        mutedRef.current = startMuted;
        setMuted(startMuted);

        const { error: upErr } = await supabase.from('voice_states').upsert(
          {
            user_id: userId,
            server_id: serverId,
            channel_id: channelId,
            self_mute: startMuted,
            self_deafen: deafenedRef.current,
          },
          { onConflict: 'user_id' },
        );
        if (upErr) throw upErr;

        activeRef.current = { serverId, channelId, channelName };
        setActive({ serverId, channelId, channelName });
        playCue('join', s.outputVolume);
      } catch (e) {
        vs.leave();
        sessionRef.current = null;
        setError(e instanceof Error ? e.message : 'Could not join voice.');
      }
    },
    [userId, leave],
  );

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    let nextDeaf = deafenedRef.current;
    // Un-muting while deafened also undeafens, as in most chat apps.
    if (!next && deafenedRef.current) {
      nextDeaf = false;
      deafenedRef.current = false;
      setDeafened(false);
      sessionRef.current?.setDeafened(false);
    }
    mutedRef.current = next;
    setMuted(next);
    sessionRef.current?.setMuted(next);
    void persistState({ self_mute: next, self_deafen: nextDeaf });
    playCue(next ? 'mute' : 'unmute', getSettings().outputVolume);
  }, [persistState]);

  const toggleDeafen = useCallback(() => {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
    sessionRef.current?.setDeafened(next);
    // Deafening also mutes the microphone. Undeafening restores the microphone.
    mutedRef.current = next;
    setMuted(next);
    sessionRef.current?.setMuted(next);
    void persistState({ self_mute: next, self_deafen: next });
    playCue(next ? 'deafen' : 'undeafen', getSettings().outputVolume);
  }, [persistState]);

  // Keep the output volume of live peers in sync with settings.
  useEffect(() => {
    sessionRef.current?.setOutputVolume(settings.outputVolume);
  }, [settings.outputVolume]);

  // Keyboard shortcuts (web) and global hotkeys (desktop shell).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !activeRef.current) return;
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      const s = getSettings();
      if (matchesKeybind(e, s.keybinds.toggleMute)) {
        e.preventDefault();
        toggleMute();
      } else if (matchesKeybind(e, s.keybinds.toggleDeafen)) {
        e.preventDefault();
        toggleDeafen();
      } else if (s.pushToTalkEnabled && !typing && matchesKeybind(e, s.keybinds.pushToTalk)) {
        mutedRef.current = false;
        setMuted(false);
        sessionRef.current?.setMuted(false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const s = getSettings();
      if (s.pushToTalkEnabled && activeRef.current && e.key.toLowerCase() === s.keybinds.pushToTalk.split('+').pop()?.toLowerCase()) {
        mutedRef.current = true;
        setMuted(true);
        sessionRef.current?.setMuted(true);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [toggleMute, toggleDeafen]);

  // Desktop shell: global hotkeys arrive over the preload bridge.
  useEffect(() => {
    if (!window.vulo?.isDesktop) return;
    window.vulo.setShortcuts({
      toggleMute: settings.keybinds.toggleMute,
      toggleDeafen: settings.keybinds.toggleDeafen,
      pushToTalk: settings.keybinds.pushToTalk,
    });
    return window.vulo.onHotkey((action) => {
      if (!activeRef.current) return;
      if (action === 'toggleMute') toggleMute();
      if (action === 'toggleDeafen') toggleDeafen();
      if (action === 'pttToggle') {
        mutedRef.current = !mutedRef.current;
        setMuted(mutedRef.current);
        sessionRef.current?.setMuted(mutedRef.current);
      }
    });
  }, [settings.keybinds, toggleMute, toggleDeafen]);

  // A page reload leaves no live session, so clear any stale presence row from the last visit.
  useEffect(() => {
    if (userId) void supabase.from('voice_states').delete().eq('user_id', userId);
  }, [userId]);

  // Leave the room when the window is closing so others see us go.
  useEffect(() => {
    const onUnload = () => {
      if (activeRef.current && userId) {
        // Best effort: the RLS policy allows deleting our own row.
        void supabase.from('voice_states').delete().eq('user_id', userId);
      }
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [userId]);

  return (
    <VoiceContext.Provider
      value={{
        active,
        muted,
        deafened,
        snapshot,
        error,
        join,
        leave,
        toggleMute,
        toggleDeafen,
        clearError: () => setError(null),
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceCtx {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used inside VoiceProvider');
  return ctx;
}
