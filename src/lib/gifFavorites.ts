import { supabase } from './supabase';
import type { GifResult } from './klipy';

type Row = { gif_id: string; title: string; preview_url: string; full_url: string };

/** The signed-in user's saved GIFs, newest first. They are stored in the database, so they follow the account. */
export async function loadFavorites(userId: string): Promise<GifResult[]> {
  const { data, error } = await supabase
    .from('gif_favorites')
    .select('gif_id,title,preview_url,full_url')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Favorites could not be loaded.');
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.gif_id,
    title: r.title,
    preview: r.preview_url,
    full: r.full_url,
  }));
}

export async function addFavorite(userId: string, gif: GifResult): Promise<void> {
  const { error } = await supabase.from('gif_favorites').insert({
    user_id: userId,
    gif_id: gif.id,
    title: gif.title.slice(0, 200),
    preview_url: gif.preview,
    full_url: gif.full,
  });
  // 23505 means this GIF is already saved, which is fine.
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function removeFavorite(userId: string, gifId: string): Promise<void> {
  const { error } = await supabase.from('gif_favorites').delete().eq('user_id', userId).eq('gif_id', gifId);
  if (error) throw new Error(error.message);
}
