import { supabase } from './supabase';

export interface ImageCheck {
  allowed: boolean;
  reason?: string;
}

const COULD_NOT_CHECK = 'That image could not be checked right now. Try again in a moment.';

/**
 * Asks the server to check an image for explicit content before it is uploaded.
 * Only image files are checked. Other files go straight through.
 */
// The check service only accepts images under 12 MB. Anything over this is checked through a copy.
const CHECK_MAX_BYTES = 11 * 1024 * 1024;
const CHECK_MAX_SIDE = 2048;

/**
 * An image small enough for the check service. Small images are used as they are. A larger image
 * is redrawn at a smaller size, and the copy is what gets checked. The upload itself is unchanged.
 * Animated GIFs are redrawn as their first frame only.
 */
async function smallCopyForCheck(file: File): Promise<File | null> {
  if (file.size <= CHECK_MAX_BYTES) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    let scale = Math.min(1, CHECK_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // JPEG has no transparency, so a white background stops transparent areas turning black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (blob && blob.size <= CHECK_MAX_BYTES) return new File([blob], 'check.jpg', { type: 'image/jpeg' });
      scale *= 0.7;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

export async function checkImage(file: File): Promise<ImageCheck> {
  if (!file.type.startsWith('image/')) return { allowed: true };
  const copy = await smallCopyForCheck(file);
  if (!copy) return { allowed: false, reason: `${file.name} could not be prepared for the content check.` };
  const body = new FormData();
  body.append('media', copy);
  const { data, error } = await supabase.functions.invoke('moderate-image', { body });
  if (error) {
    console.error('image check request failed', error);
    return { allowed: false, reason: `${COULD_NOT_CHECK} (${error.message})` };
  }
  const result = data as { allowed?: boolean; reason?: string; error?: string } | null;
  if (!result || result.error) {
    console.error('image check refused the request', result);
    return { allowed: false, reason: `${COULD_NOT_CHECK} (${result?.error ?? 'no response'})` };
  }
  return { allowed: result.allowed !== false, reason: result.reason };
}
