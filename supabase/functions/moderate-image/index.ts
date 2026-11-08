// Supabase Edge Function: checks an image for explicit nudity before it is uploaded to a chat.
//
// Uses Sightengine. Its API user and secret are function secrets: SIGHTENGINE_USER and
// SIGHTENGINE_SECRET. If they are not set, the image is allowed and the response says it was
// not checked. If the check itself fails, the image is refused, so nothing goes unchecked silently.
//
// Request:  POST multipart/form-data with a field named "media" (one image file)
// Response: { "allowed": boolean, "checked": boolean, "reason"?: string }
//           { "error": "..." } with a 4xx or 5xx status for other failures

// Scores run from 0 to 1. An image is refused when its worst explicit score reaches this.
const BLOCK_AT = 0.6;
// The check service only accepts images under 12 MB.
const MAX_BYTES = 12 * 1024 * 1024;

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

  const user = Deno.env.get('SIGHTENGINE_USER');
  const secret = Deno.env.get('SIGHTENGINE_SECRET');
  if (!user || !secret) return json({ allowed: true, checked: false });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const media = form.get('media');
  if (!(media instanceof File) || media.size === 0) return json({ error: 'bad_request' }, 400);
  if (!media.type.startsWith('image/')) return json({ error: 'not_an_image' }, 400);
  if (media.size > MAX_BYTES) return json({ error: 'too_large' }, 413);

  const out = new FormData();
  out.append('media', media);
  out.append('models', 'nudity-2.0');
  out.append('api_user', user);
  out.append('api_secret', secret);

  let res: Response;
  try {
    res = await fetch('https://api.sightengine.com/1.0/check.json', { method: 'POST', body: out });
  } catch {
    return json({ error: 'check_unreachable' }, 502);
  }

  const data = (await res.json().catch(() => null)) as
    | { status?: string; nudity?: Record<string, unknown>; error?: { type?: string; message?: string } }
    | null;
  if (!res.ok || data?.status !== 'success' || !data.nudity) {
    // Sightengine's error message says what it rejected. It never contains the secret.
    console.error(
      'moderate-image: the check failed with status',
      res.status,
      data?.error?.type ?? 'no_error_type',
      data?.error?.message ?? 'no_error_message',
    );
    return json({ error: 'check_failed' }, 502);
  }

  const score = (key: string) => {
    const v = data.nudity?.[key];
    return typeof v === 'number' ? v : 0;
  };
  const worst = Math.max(score('sexual_activity'), score('sexual_display'), score('erotica'));
  if (worst >= BLOCK_AT) {
    return json({ allowed: false, checked: true, reason: 'This image was blocked by the content filter.' });
  }
  return json({ allowed: true, checked: true });
});
