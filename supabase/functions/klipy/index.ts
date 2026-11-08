// Supabase Edge Function: searches KLIPY GIFs for signed-in users.
//
// The KLIPY key is read from the function secret KLIPY_API_KEY and is never sent to the
// browser. Requests from the app must include the user's session, which Supabase checks
// before this code runs (JWT verification is on by default for edge functions).
//
// Request:  POST { "action": "search" | "trending", "q"?: string, "page"?: number }
// Response: { "gifs": [{ "id", "title", "preview", "full" }] }
//           { "error": "not_configured" }   when the key has not been set yet
//           { "error": "..." } with a 4xx or 5xx status for other failures

const API_BASE = 'https://api.klipy.com/api/v1';
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; gifs: GifResult[] }>();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface GifResult {
  id: string;
  title: string;
  preview: string;
  full: string;
}

interface MediaUrl {
  path: string;
  url: string;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Lists every GIF or WebP link in the item's media object, with the key path it came from.
function mediaUrls(files: unknown): MediaUrl[] {
  const out: MediaUrl[] = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') {
      if (/^https:\/\//.test(node) && /\.(gif|webp)(\?|$)/i.test(node)) out.push({ path, url: node });
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        walk(value, `${path}.${key}`);
      }
    }
  };
  walk(files, '');
  return out;
}

// Turns one KLIPY item into a small preview and a larger image. The field names are read
// from the response, so an unexpected layout drops that item instead of breaking the list.
function normalize(item: unknown): GifResult | null {
  const o = item as Record<string, unknown> | null;
  const id = String(o?.id ?? o?.slug ?? '');
  const urls = mediaUrls(o?.files);
  if (!id || urls.length === 0) return null;
  const preview = urls.find((u) => /preview|tiny|thumb|small|sm/i.test(u.path)) ?? urls[0];
  const full = urls.find((u) => /hd|md|full|original|large|gif/i.test(u.path)) ?? urls[urls.length - 1];
  return { id, title: String(o?.title ?? 'GIF'), preview: preview.url, full: full.url };
}

function itemsFrom(payload: unknown): unknown[] {
  const p = payload as { data?: unknown } | null;
  const inner = p?.data as { data?: unknown } | unknown[] | undefined;
  if (Array.isArray(inner)) return inner;
  if (inner && typeof inner === 'object' && Array.isArray((inner as { data?: unknown }).data)) {
    return (inner as { data: unknown[] }).data;
  }
  return [];
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

  // The key is part of the URL path for KLIPY. This URL is never logged or returned.
  const url = new URL(`${API_BASE}/${encodeURIComponent(key)}${isSearch ? '/gifs/search' : '/gifs/trending'}`);
  url.searchParams.set('per_page', '24');
  url.searchParams.set('page', String(page));
  url.searchParams.set('rating', 'pg-13');
  if (isSearch) url.searchParams.set('q', q);

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    return json({ error: 'upstream_unreachable' }, 502);
  }
  if (!upstream.ok) return json({ error: 'upstream_error', status: upstream.status }, 502);

  const payload = await upstream.json().catch(() => null);
  const gifs = itemsFrom(payload)
    .map(normalize)
    .filter((g): g is GifResult => g !== null);

  cache.set(cacheKey, { at: Date.now(), gifs });
  return json({ gifs });
});
