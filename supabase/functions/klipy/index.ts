// Supabase Edge Function: searches KLIPY GIFs for signed-in users.
//
// The KLIPY key is read from the function secret KLIPY_API_KEY and is never sent to the
// browser. Supabase checks the user's session before this code runs (JWT verification is on).
//
// Request:  POST { "action": "search" | "trending", "q"?: string, "page"?: number }
// Response: { "gifs": [{ "id", "title", "preview", "full" }] }
//           { "error": "not_configured" }   when the key has not been set yet
//           { "error": "..." } with a 4xx or 5xx status for other failures

import { customerIdFrom, itemsFrom, normalize, type GifResult } from './parse.ts';

const API_BASE = 'https://api.klipy.com/api/v1';
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; gifs: GifResult[] }>();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const key = Deno.env.get('KLIPY_API_KEY');
  if (!key) return json({ error: 'not_configured' });

  let body: { action?: unknown; q?: unknown; page?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const q = typeof body.q === 'string' ? body.q.trim().slice(0, 100) : '';
  const isSearch = body.action === 'search' && q.length > 0;
  const page = Math.min(Math.max(Number(body.page) || 1, 1), 20);
  const cacheKey = `${isSearch ? 'search' : 'trending'}:${q.toLowerCase()}:${page}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return json({ gifs: hit.gifs });

  const customerId = await customerIdFrom(req.headers.get('authorization'));

  // The key is part of the URL path for KLIPY. This URL is never logged or returned.
  const url = new URL(`${API_BASE}/${encodeURIComponent(key)}${isSearch ? '/gifs/search' : '/gifs/trending'}`);
  url.searchParams.set('per_page', '24');
  url.searchParams.set('page', String(page));
  url.searchParams.set('rating', 'pg-13');
  url.searchParams.set('customer_id', customerId);
  if (isSearch) url.searchParams.set('q', q);

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    return json({ error: 'upstream_unreachable' }, 502);
  }
  if (!upstream.ok) {
    console.error('klipy: upstream returned status', upstream.status);
    return json({ error: 'upstream_error', status: upstream.status }, 502);
  }

  const payload = await upstream.json().catch(() => null);
  const gifs = itemsFrom(payload)
    .map(normalize)
    .filter((g): g is GifResult => g !== null);

  if (gifs.length === 0) {
    // Nothing usable came back. Log the start of the response so the function logs show its shape.
    console.warn('klipy: no GIFs parsed. Response starts with:', JSON.stringify(payload)?.slice(0, 300));
    return json({ gifs: [] });
  }

  cache.set(cacheKey, { at: Date.now(), gifs });
  return json({ gifs });
});
