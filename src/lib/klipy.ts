import { supabase } from './supabase';

export interface GifResult {
  id: string;
  title: string;
  preview: string;
  full: string;
}

/** Searches GIFs through the server-side function. An empty query returns trending GIFs. */
export async function searchGifs(query: string, page = 1): Promise<GifResult[]> {
  const q = query.trim();
  const { data, error } = await supabase.functions.invoke('klipy', {
    body: { action: q ? 'search' : 'trending', q, page },
  });
  if (error) throw new Error('GIFs are unavailable right now. Try again in a moment.');
  const body = data as { gifs?: GifResult[]; error?: string } | null;
  if (body?.error === 'not_configured') {
    throw new Error('GIF search is not set up yet. The project owner needs to add the KLIPY key.');
  }
  if (body?.error) throw new Error('GIFs are unavailable right now. Try again in a moment.');
  return body?.gifs ?? [];
}
