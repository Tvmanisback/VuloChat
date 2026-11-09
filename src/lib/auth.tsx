import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { CONFIRM_URL } from './site';
import { loadDecorations } from './decorations';
import { loadNameplates } from './nameplates';
import { loadEmojis } from './emojis';
import { loadStickers } from './stickers';
import { registerDeviceIdentity } from './e2ee';
import type { Profile, UserStatus } from './types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setStatus: (status: UserStatus) => Promise<void>;
  updateProfile: (
    patch: Partial<
      Pick<
        Profile,
        | 'display_name'
        | 'about'
        | 'avatar_url'
        | 'animated_avatar'
        | 'decoration_id'
        | 'nameplate_id'
        | 'profile_decoration_id'
        | 'banner_url'
        | 'animated_banner'
        | 'custom_status'
        | 'accent_color'
        | 'visible_badge_ids'
      >
    >,
  ) => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) console.error('profile load failed', error.message);
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (s) await loadProfile(s.user.id);
      else setProfile(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // The decoration catalog and custom emojis need a signed-in user, so they load once a session exists.
  useEffect(() => {
    if (session) {
      void loadDecorations();
      void loadNameplates();
      void loadEmojis();
      void loadStickers();
      void registerDeviceIdentity(session.user.id).catch((error) => {
        console.error('E2EE device registration failed', error);
      });
    }
  }, [session]);

  // Keep the profile row in sync when another device or tab changes it.
  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel(`profile:${session.user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
        (payload) => setProfile(payload.new as Profile))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [session]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, username: string) => {
    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{2,32}$/.test(clean)) {
      throw new Error('Usernames use 2–32 lowercase letters, numbers, underscores or dots.');
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: clean, display_name: username.trim() },
        emailRedirectTo: CONFIRM_URL,
      },
    });
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?reset-password=true`,
    });
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  const signOut = async () => {
    if (session) {
      await supabase.from('profiles').update({ status: 'offline' }).eq('id', session.user.id);
    }
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (session) await loadProfile(session.user.id);
  };

  const setStatus = async (status: UserStatus) => {
    if (!session) return;
    await supabase.from('profiles').update({ status, updated_at: new Date().toISOString() }).eq('id', session.user.id);
  };

  const updateProfile: AuthState['updateProfile'] = async (patch) => {
    if (!session) return;
    const { error } = await supabase
      .from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', session.user.id);
    if (error) throw error;
    await loadProfile(session.user.id);
  };

  return (
    <AuthCtx.Provider
      value={{ session, profile, loading, signIn, signUp, resetPassword, updatePassword, signOut, refreshProfile, setStatus, updateProfile }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
