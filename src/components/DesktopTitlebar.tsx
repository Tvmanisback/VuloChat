import type { CSSProperties } from 'react';
import { Icon } from './icons';

// Only rendered inside the desktop shell (Pc/), where the native window frame is turned off.
const drag = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties;

export default function DesktopTitlebar() {
  if (!window.vulo?.isDesktop) return null;
  const control = (action: 'minimize' | 'maximize' | 'close', label: string, icon: 'x' | 'minus' | 'square', danger = false) => (
    <button
      key={action}
      onClick={() => window.vulo?.windowControl(action)}
      className={`flex h-full w-11 items-center justify-center text-vulo-text ${danger ? 'hover:bg-vulo-red hover:text-white' : 'hover:bg-vulo-hover'}`}
      aria-label={label}
      style={noDrag}
    >
      {icon === 'x' && <Icon name="x" className="h-4 w-4" />}
      {icon === 'minus' && (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      )}
      {icon === 'square' && (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      )}
    </button>
  );

  return (
    <div className="flex h-8 shrink-0 select-none items-center justify-between bg-vulo-rail" style={drag}>
      <span className="pl-3 text-xs font-semibold text-vulo-muted">VuloChat</span>
      <div className="flex h-full" style={noDrag}>
        {control('minimize', 'Minimise window', 'minus')}
        {control('maximize', 'Maximise window', 'square')}
        {control('close', 'Close to tray', 'x', true)}
      </div>
    </div>
  );
}
