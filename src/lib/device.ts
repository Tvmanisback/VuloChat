import { useSyncExternalStore } from 'react';

export type DeviceKind = 'mobile' | 'desktop';

/** Phones and tablets: a mobile user agent, or a touch screen on a narrow window. */
function detect(): DeviceKind {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua)) return 'mobile';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const narrow = window.matchMedia?.('(max-width: 767px)').matches ?? false;
  return coarse && narrow ? 'mobile' : 'desktop';
}

let current: DeviceKind = detect();
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  document.documentElement.dataset.device = current;
  // A window that is resized across the phone width, or a rotated tablet, switches over.
  window.addEventListener('resize', () => {
    const next = detect();
    if (next === current) return;
    current = next;
    document.documentElement.dataset.device = next;
    listeners.forEach((l) => l());
  });
}

export function getDevice(): DeviceKind {
  return current;
}

export function useDevice(): DeviceKind {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => 'desktop',
  );
}
