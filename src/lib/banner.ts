const DEFAULT_BANNER = 'linear-gradient(135deg, #7c5cff, #00a8fc)';
const HEX = /^#[0-9a-f]{6}$/i;

/** Background for a profile banner with no image. Uses the user's profile color when one is set. */
export function bannerBackground(accent: string | null | undefined): string {
  if (!accent || !HEX.test(accent)) return DEFAULT_BANNER;
  return `linear-gradient(135deg, ${accent}, #1e1f22)`;
}
