import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import type { AvatarDecoration } from './types';

// The decoration catalog is small and rarely changes, so it is loaded once per session
// and shared by every avatar on screen.
let decorations: AvatarDecoration[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function loadDecorations(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const { data, error } = await supabase.from('avatar_decorations').select('*').order('position');
      if (error) {
        loading = null;
        console.error('decorations load failed', error.message);
        return;
      }
      decorations = (data as AvatarDecoration[] | null) ?? [];
      listeners.forEach((l) => l());
    })();
  }
  return loading;
}

export function useDecorations(): AvatarDecoration[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => decorations,
    () => decorations,
  );
}

/** Decoration files ship with the site (public/decorations), so they follow the build's base path. */
export function decorationSrc(d: Pick<AvatarDecoration, 'asset_path'>): string {
  return `${import.meta.env.BASE_URL}${d.asset_path}`;
}

/**
 * Tinting draws a decoration as a mask, and the desktop app's pages open from file://,
 * where browsers refuse that mask. There the original art is shown instead.
 */
export const TINT_SUPPORTED = typeof window !== 'undefined' && window.location.protocol !== 'file:';
