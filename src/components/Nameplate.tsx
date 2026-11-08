import { useEffect } from 'react';
import { loadNameplates, nameplateSrc, useNameplates } from '../lib/nameplates';

/**
 * Paints a member's nameplate behind their row or card. The parent must be `relative`
 * and `overflow-hidden`, and its content must be `relative` so it sits above this.
 */
export default function NameplateBackdrop({ nameplateId }: { nameplateId: string | null | undefined }) {
  const nameplates = useNameplates();

  useEffect(() => {
    if (nameplateId) void loadNameplates();
  }, [nameplateId]);

  const plate = nameplateId ? nameplates.find((n) => n.id === nameplateId) : undefined;
  if (!plate) return null;

  return (
    <>
      <img
        src={nameplateSrc(plate)}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      {/* Darkens the left side so names stay readable over the artwork. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent"
      />
    </>
  );
}
