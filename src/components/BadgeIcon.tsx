import { useEffect, useRef, useState } from 'react';
import type { Badge } from '../lib/types';

/** A badge shown as an icon only. Clicking it opens a small panel with the badge name and what it means. */
export default function BadgeIcon({ badge, size = 'normal' }: { badge: Badge; size?: 'normal' | 'small' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={badge.name}
        aria-expanded={open}
        className={`flex items-center justify-center rounded-full bg-vulo-side transition hover:bg-vulo-hover focus-visible:ring-2 focus-visible:ring-vulo-accent ${size === 'small' ? 'h-5 w-5' : 'h-7 w-7'}`}
        style={{ boxShadow: `inset 0 0 0 2px ${badge.color}` }}
      >
        {badge.icon_path ? (
          <img src={`${import.meta.env.BASE_URL}${badge.icon_path}`} alt="" aria-hidden="true" className={size === 'small' ? 'h-4 w-4' : 'h-5 w-5'} />
        ) : (
          <span aria-hidden="true">{badge.emoji}</span>
        )}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-40 mb-2 block w-56 -translate-x-1/2 rounded-md bg-vulo-rail p-3 text-left shadow-xl"
        >
          <span className="block text-sm font-semibold text-vulo-bright">{badge.name}</span>
          {badge.description && <span className="mt-1 block text-xs text-vulo-muted">{badge.description}</span>}
        </span>
      )}
    </span>
  );
}
