import { useEffect } from 'react';
import { loadProfileDecorations, profileDecorationSrc, useProfileDecorations } from '../lib/profileDecorations';
import { useSettings } from '../lib/settings';

/** Renders banner art in the banner slot and portrait frames around the whole profile card. */
export default function ProfileDecorationOverlay({
  decorationId,
  forceDecoration = false,
}: {
  decorationId: string | null | undefined;
  forceDecoration?: boolean;
}) {
  const items = useProfileDecorations();
  const { showDecorations } = useSettings();

  useEffect(() => {
    if (decorationId) void loadProfileDecorations();
  }, [decorationId]);

  if (!decorationId || (!showDecorations && !forceDecoration)) return null;
  const item = items.find((d) => d.id === decorationId);
  if (!item) return null;

  const src = profileDecorationSrc(item);
  const isPortraitFrame = /-profile\.svg$/i.test(item.asset_path);

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={isPortraitFrame
        ? 'pointer-events-none absolute inset-0 z-0 h-full w-full object-contain'
        : 'pointer-events-none absolute left-0 top-0 z-10 h-28 w-full object-contain'}
    />
  );
}
