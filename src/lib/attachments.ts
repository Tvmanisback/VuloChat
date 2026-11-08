import { supabase } from './supabase';
import type { Attachment, Embed } from './types';

// Files can be up to 1 GB. Images are also checked for explicit content before they upload, and
// the check service only accepts images under 12 MB, so larger images are refused.
export const MAX_ATTACHMENT_BYTES = 1024 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Why a file can't be attached, or null when it can. */
export function attachmentLimitError(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name} is larger than 1 GB.`;
  if (file.type.startsWith('image/') && file.size > MAX_IMAGE_BYTES) {
    return `${file.name} is larger than 12 MB. Images that size can't be checked, so they can't be sent.`;
  }
  return null;
}
const URL_RE = /\bhttps?:\/\/[^\s<>()]+[^\s<>()*_.,!?;:'"]/gi;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;

/** Builds link and image embeds from URLs in a message. Runs on send, so the data is stored with the message. */
export function extractEmbeds(text: string): Embed[] {
  const seen = new Set<string>();
  const out: Embed[] = [];
  for (const match of text.matchAll(URL_RE)) {
    const url = match[0];
    if (seen.has(url) || out.length >= 3) continue;
    seen.add(url);
    let host = '';
    try {
      host = new URL(url).host;
    } catch {
      continue;
    }
    out.push({ type: IMAGE_RE.test(url) ? 'image' : 'link', url, host });
  }
  return out;
}

/** Uploads a file to the private attachments bucket under the user's folder. */
export async function uploadAttachment(userId: string, file: File): Promise<Attachment> {
  const problem = attachmentLimitError(file);
  if (problem) throw new Error(problem);
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('attachments').upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  return { name: file.name, path, type: file.type, size: file.size };
}

/** Short-lived link to a private attachment. */
export async function attachmentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
