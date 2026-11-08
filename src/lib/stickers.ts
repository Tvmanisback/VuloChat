import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

export interface CustomSticker {
  id: string;
  server_id: string;
  name: string;
  asset_url: string;
  animated: boolean;
  server_name: string;
}

// Every custom sticker the signed-in user can see. The database only returns stickers from
// servers the user belongs to, so the list is already limited to what they can use.
let stickers: CustomSticker[] = [];
let loading: Promise<void> | null = null;
let listening = false;
const listeners = new Set<() => void>();

function setStickers(next: CustomSticker[]) {
  stickers = next;
  listeners.forEach((l) => l());
}

export function loadStickers(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const { data, error } = await supabase
        .from('server_stickers')
        .select('id,server_id,name,asset_url,animated,servers(name)')
        .order('name');
      if (error) {
        loading = null;
        console.error('sticker load failed', error.message);
        return;
      }
      type Row = {
        id: string;
        server_id: string;
        name: string;
        asset_url: string;
        animated: boolean;
        servers: { name: string } | null;
      };
      setStickers(
        ((data ?? []) as unknown as Row[]).map((r) => ({
          id: r.id,
          server_id: r.server_id,
          name: r.name,
          asset_url: r.asset_url,
          animated: r.animated,
          server_name: r.servers?.name ?? '',
        })),
      );
    })();
  }
  if (!listening) {
    listening = true;
    // Refresh the list when any server adds or removes a sticker.
    supabase
      .channel('server-stickers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_stickers' }, () => {
        loading = null;
        void loadStickers();
      })
      .subscribe();
  }
  return loading;
}

export function useStickers(): CustomSticker[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => stickers,
    () => stickers,
  );
}
