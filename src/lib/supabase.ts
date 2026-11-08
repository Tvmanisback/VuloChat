import { createClient } from '@supabase/supabase-js';

// The publishable key is designed for browsers. Row Level Security on every table
// (see supabase/schema.sql) is what protects the data.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://yejtrubajgyphbggtjrd.supabase.co';
const key =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  'sb_publishable_kt21VISR5aniPn7DV2T_TQ_We5J7vmv';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 20 } },
});
