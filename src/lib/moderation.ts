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
export async function checkImage(file: File): Promise<ImageCheck> {
  if (!file.type.startsWith('image/')) return { allowed: true };
  const body = new FormData();
  body.append('media', file);
  const { data, error } = await supabase.functions.invoke('moderate-image', { body });
  if (error) return { allowed: false, reason: COULD_NOT_CHECK };
  const result = data as { allowed?: boolean; reason?: string; error?: string } | null;
  if (!result || result.error) return { allowed: false, reason: COULD_NOT_CHECK };
  return { allowed: result.allowed !== false, reason: result.reason };
}
