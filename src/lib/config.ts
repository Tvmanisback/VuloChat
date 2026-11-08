// Supabase connection values. Kept apart from the client so that pages which need
// their own client (the email confirmation page) can read the same values.
// The publishable key is designed for browsers. Row Level Security on every table
// (see supabase/schema.sql) is what protects the data.
export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://yejtrubajgyphbggtjrd.supabase.co';

export const SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  'sb_publishable_kt21VISR5aniPn7DV2T_TQ_We5J7vmv';
