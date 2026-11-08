import { useEffect } from 'react';
import { loadProfileDecorations, profileDecorationSrc, useProfileDecorations } from '../lib/profileDecorations';
import { useSettings } from '../lib/settings';

/**
 * Adds a subtle animated frame around the complete profile card. The parent must be relative and
 * overflow-hidden.
 */
export default function ProfileDecorationOverlay({
  decorationId,
  forceDecoration = false,
}: {
  decorationId: string | null | undefined;
  /** Shows the decoration even when the viewer has turned decorations off. Used by the settings previews. */
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
      className="pointer-events-none absolute inset-0 z-0 h-full w-full object-fill"
    />
  );
}
