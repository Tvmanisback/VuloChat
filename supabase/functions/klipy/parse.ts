// Helpers for the klipy function. They turn KLIPY's response into the short list the app uses.
// They live apart from index.ts so they can be tested without running the function.

export interface GifResult {
  id: string;
  title: string;
  preview: string;
  full: string;
}

// Size names used inside KLIPY's file object, from smallest to largest.
const SIZE_RANK: Record<string, number> = {
  tiny: 0,
  xs: 0,
  thumb: 0,
  sm: 1,
  small: 1,
  preview: 1,
  md: 2,
  medium: 2,
  hd: 3,
  large: 3,
  full: 4,
  original: 4,
};

interface MediaUrl {
  path: string[];
  url: string;
}

function isGifLike(url: string, path: string[]): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  // Video and still-image formats can't animate in a GIF picker.
  if (/\.(mp4|webm|jpe?g|png)(\?|$)/i.test(url)) return false;
  return /\.(gif|webp)(\?|$)/i.test(url) || path.includes('gif') || path.includes('webp');
}

// Collects every GIF or WebP link in an item, along with the keys it sits under.
function collect(node: unknown, path: string[], out: MediaUrl[]): void {
  if (typeof node === 'string') {
    if (isGifLike(node, path)) out.push({ path, url: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((value, i) => collect(value, [...path, String(i)], out));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      collect(value, [...path, key], out);
    }
  }
}

function sizeOf(path: string[]): number {
  let rank = 2;
  for (const seg of path) {
    if (Object.prototype.hasOwnProperty.call(SIZE_RANK, seg)) rank = SIZE_RANK[seg];
  }
  return rank;
}

function isGif(m: MediaUrl): boolean {
  return /\.gif(\?|$)/i.test(m.url) || m.path.includes('gif');
}

/** Turns one KLIPY item into a small preview and a larger image. Returns null when it has no usable link. */
export function normalize(item: unknown): GifResult | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const id = String(o.id ?? o.slug ?? '');
  const media: MediaUrl[] = [];
  collect(o, [], media);
  if (!id || media.length === 0) return null;

  // The smallest size is the preview and the largest is shown full. At the same size, GIF beats WebP.
  const sorted = [...media].sort(
    (a, b) => sizeOf(a.path) - sizeOf(b.path) || Number(isGif(b)) - Number(isGif(a)),
  );
  const largest = sizeOf(sorted[sorted.length - 1].path);
  const full = sorted.filter((m) => sizeOf(m.path) === largest)[0];
  return { id, title: String(o.title ?? 'GIF'), preview: sorted[0].url, full: full.url };
}

/** Finds the array of GIF items in a KLIPY response, whatever wrapper it sits in. */
export function itemsFrom(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  for (const candidate of [p.data, p.gifs, p.results, p.items]) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const inner = candidate as Record<string, unknown>;
      for (const list of [inner.data, inner.gifs, inner.results, inner.items]) {
        if (Array.isArray(list)) return list;
      }
    }
  }
  return [];
}

/**
 * KLIPY wants a customer_id for each user. This is a SHA-256 hash of the user's id, so the
 * raw id is never sent to KLIPY. Requests without a user id share one anonymous value.
 */
export async function customerIdFrom(authorization: string | null): Promise<string> {
  const token = (authorization ?? '').replace(/^Bearer\s+/i, '');
  let sub = '';
  try {
    const b64 = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    if (typeof payload.sub === 'string') sub = payload.sub;
  } catch {
    // Not a readable token. The anonymous value below is used instead.
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub || 'anonymous'));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
