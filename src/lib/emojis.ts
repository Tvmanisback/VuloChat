import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

export interface CustomEmoji {
  id: string;
  server_id: string;
  name: string;
  asset_url: string;
  animated: boolean;
  server_name: string;
}

// Every custom emoji the signed-in user can see. The database only returns emojis from
// servers the user belongs to, so the list is already limited to what they can use.
let emojis: CustomEmoji[] = [];
let byName = new Map<string, CustomEmoji[]>();
let loading: Promise<void> | null = null;
let listening = false;
const listeners = new Set<() => void>();

function setEmojis(next: CustomEmoji[]) {
  emojis = next;
  byName = new Map();
  for (const e of next) {
    const list = byName.get(e.name) ?? [];
    list.push(e);
    byName.set(e.name, list);
  }
  listeners.forEach((l) => l());
}

export function loadEmojis(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const { data, error } = await supabase
        .from('server_emojis')
        .select('id,server_id,name,asset_url,animated,servers(name)')
        .order('name');
      if (error) {
        loading = null;
        console.error('emoji load failed', error.message);
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
      setEmojis(
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
    // Refresh the list when any server adds or removes an emoji.
    supabase
      .channel('server-emojis')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_emojis' }, () => {
        loading = null;
        void loadEmojis();
      })
      .subscribe();
  }
  return loading;
}

export function useEmojis(): CustomEmoji[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => emojis,
    () => emojis,
  );
}

/** Finds an emoji by name. When the same name exists in more than one server, prefer the given server. */
export function findEmoji(name: string, preferServerId?: string): CustomEmoji | undefined {
  const matches = byName.get(name);
  if (!matches || matches.length === 0) return undefined;
  return matches.find((e) => e.server_id === preferServerId) ?? matches[0];
}

const CODE_SPLIT = /(```[\s\S]*?```|`[^`\n]+`)/;
const SHORTCODE = /:([a-z0-9_]{2,32}):/g;

/**
 * Replaces :name: with a Markdown image for each known custom emoji. Code spans and
 * code blocks are left alone, so `:name:` inside code shows as typed.
 */
export function expandEmojiShortcodes(text: string, preferServerId?: string): string {
  return text
    .split(CODE_SPLIT)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(SHORTCODE, (match, name: string) => {
        const emoji = findEmoji(name, preferServerId);
        return emoji ? `![${name}](${emoji.asset_url})` : match;
      });
    })
    .join('');
}
