// Supabase Edge Function: permanently deletes the signed-in user's account.
//
// Supabase checks the caller's session before this code runs (JWT verification is on). The service
// role key is provided to the function by Supabase and never reaches the browser.
//
// Request:  POST (no body needed)
// Response: { "ok": true }                       on success
//           { "error": "..." } with a 4xx or 5xx status otherwise

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  // Find out who is calling from their own token, so nobody can delete someone else's account.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: who, error: whoErr } = await caller.auth.getUser(token);
  if (whoErr || !who.user) return json({ error: 'Log in again, then try deleting your account.' }, 401);
  const uid = who.user.id;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Servers you own would be deleted with you, along with everyone else's chat in them.
  // Stop here so the owner deletes them or hands them over first.
  const { count, error: countErr } = await admin
    .from('servers')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', uid);
  if (countErr) return json({ error: 'Could not check your servers. Try again.' }, 500);
  if (count && count > 0) {
    const noun = count === 1 ? 'server' : 'servers';
    const pronoun = count === 1 ? 'it' : 'them';
    return json({ error: `You own ${count} ${noun}. Delete ${pronoun} first, then try again.` }, 409);
  }

  // Note the files this account sent. They are removed after the account is gone, because the
  // cascade below removes the message rows that record them.
  const attachmentPaths = new Set<string>();
  const [channelRows, dmRows] = await Promise.all([
    admin.from('messages').select('attachments').eq('author_id', uid),
    admin.from('direct_messages').select('attachments').eq('sender_id', uid),
  ]);
  for (const res of [channelRows, dmRows]) {
    for (const row of (res.data ?? []) as { attachments: { path?: string }[] | null }[]) {
      for (const a of row.attachments ?? []) {
        if (a.path) attachmentPaths.add(a.path);
      }
    }
  }
  const { data: pictures } = await admin.storage.from('avatars').list(uid, { limit: 1000 });
  const pictureFiles = (pictures ?? []).map((f) => `${uid}/${f.name}`);

  // Deleting the login removes the profile, messages, direct messages, friendships, badges,
  // server memberships and GIF favourites through the database's cascade rules.
  const { error: deleteErr } = await admin.auth.admin.deleteUser(uid);
  if (deleteErr) return json({ error: 'Could not delete your account. Try again later.' }, 500);

  const removeFiles = async (bucket: string, paths: string[]) => {
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) console.error(`delete-account: could not remove files from ${bucket}:`, error.message);
    }
  };
  await removeFiles('attachments', [...attachmentPaths]);
  await removeFiles('avatars', pictureFiles);

  return json({ ok: true });
});
