import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import type { Nameplate } from './types';

// The nameplate catalog is small and rarely changes, so it is loaded once per session
// and shared by every member row and profile card on screen.
let nameplates: Nameplate[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function loadNameplates(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const { data, error } = await supabase.from('nameplates').select('*').order('position');
      if (error) {
        loading = null;
        console.error('nameplates load failed', error.message);
        return;
      }
      nameplates = (data as Nameplate[] | null) ?? [];
      listeners.forEach((l) => l());
    })();
  }
  return loading;
}

export function useNameplates(): Nameplate[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => nameplates,
    () => nameplates,
  );
}

/** Nameplate files ship with the site (public/nameplates), so they follow the build's base path. */
export function nameplateSrc(n: Pick<Nameplate, 'asset_path'>): string {
  return `${import.meta.env.BASE_URL}${n.asset_path}`;
}
