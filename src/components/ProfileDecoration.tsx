import { useEffect } from 'react';
import { loadProfileDecorations, profileDecorationSrc, useProfileDecorations } from '../lib/profileDecorations';
import { useSettings } from '../lib/settings';

/** Renders the selected decoration as a full-profile overlay, behind profile content. */
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

  return (
    <img
      src={profileDecorationSrc(item)}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-fill"
    />
  );
}
