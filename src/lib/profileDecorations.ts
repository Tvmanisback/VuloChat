import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import type { ProfileDecoration } from './types';

// The profile decoration catalog is small and rarely changes, so it is loaded once per session
// and shared by every profile card on screen.
let items: ProfileDecoration[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function loadProfileDecorations(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const { data, error } = await supabase.from('profile_decorations').select('*').order('position');
      if (error) {
        loading = null;
        console.error('profile decorations load failed', error.message);
        return;
      }
      items = (data as ProfileDecoration[] | null) ?? [];
      listeners.forEach((l) => l());
    })();
  }
  return loading;
}

export function useProfileDecorations(): ProfileDecoration[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => items,
  );
}

/** Profile decoration files ship with the site (public/profile-decorations), so they follow the build's base path. */
export function profileDecorationSrc(d: Pick<ProfileDecoration, 'asset_path'>): string {
  return `${import.meta.env.BASE_URL}${d.asset_path}`;
}
