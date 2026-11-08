import { useEffect, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { decorationSrc, TINT_SUPPORTED, useDecorations } from '../lib/decorations';
import type { Profile, UserStatus } from '../lib/types';

export function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#7c5cff" />
      <path d="M14 18h8l10 22 10-22h8L34 48h-4z" fill="#ffffff" />
      <circle cx="50" cy="16" r="5" fill="#23a55a" />
    </svg>
  );
}

export function Splash({ label = 'Loading VuloChat…' }: { label?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-vulo-chat">
      <Logo className="h-14 w-14 animate-pulse" />
      <p className="text-sm text-vulo-muted">{label}</p>
    </div>
  );
}

const STATUS_COLOR: Record<UserStatus, string> = {
  online: 'bg-vulo-green',
  idle: 'bg-vulo-idle',
  dnd: 'bg-vulo-dnd',
  offline: 'bg-vulo-muted',
};

export function StatusDot({ status, ring }: { status: UserStatus; ring: string }) {
  return (
    <span
      className={`absolute bottom-0 right-0 block h-3.5 w-3.5 rounded-full border-[3px] ${ring} ${STATUS_COLOR[status]}`}
      aria-label={status}
    >
      {status === 'dnd' && <span className="absolute left-[2px] right-[2px] top-1/2 h-[2px] -translate-y-1/2 bg-vulo-chat" />}
    </span>
  );
}

const AVATAR_COLORS = ['#5865f2', '#3ba55d', '#faa61a', '#ed4245', '#eb459e', '#7c5cff', '#00a8fc'];

// A decoration reflects the owner's status: away looks faded, do not disturb looks red,
// and offline looks grey.
const STATUS_DECORATION: Record<UserStatus, CSSProperties> = {
  online: {},
  idle: { opacity: 0.6 },
  dnd: { filter: 'hue-rotate(-35deg) saturate(1.6)' },
  offline: { filter: 'grayscale(1)', opacity: 0.6 },
};

// Pictures are drawn larger than the avatar so the picture sits inside the ring.
const FRAME_CLASS = 'pointer-events-none absolute left-1/2 top-1/2 h-[136%] w-[136%] max-w-none -translate-x-1/2 -translate-y-1/2';

export function Avatar({
  profile,
  size = 'md',
  status,
  ringClass = 'border-vulo-chat',
  className = '',
  speaking = false,
}: {
  profile: (Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'decoration_id'> & { accent_color?: string | null }) | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  status?: UserStatus;
  ringClass?: string;
  className?: string;
  /** True while this person is talking in a voice channel. Voice-reactive decorations pulse. */
  speaking?: boolean;
}) {
  const decorations = useDecorations();
  const name = profile?.display_name || profile?.username || '?';
  const seed = (profile?.id ?? name).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const dims = { xs: 'h-6 w-6 text-[10px]', sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-20 w-20 text-2xl' }[size];
  const decorationId = profile?.decoration_id ?? null;
  const decoration = decorationId ? decorations.find((d) => d.id === decorationId) : undefined;
  // A tintable decoration takes the owner's accent colour: the frame becomes a mask filled with it.
  const tinted = !!decoration?.tintable && !!profile?.accent_color && TINT_SUPPORTED;
  const frameMask = decoration ? `url("${decorationSrc(decoration)}")` : undefined;
  const voicePulse = decoration?.reacts_to_voice && speaking ? 'animate-pulse' : '';
  return (
    <div className={`relative shrink-0 ${className}`}>
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="" className={`${dims} rounded-full object-cover`} />
      ) : (
        <div
          className={`${dims} flex items-center justify-center rounded-full font-semibold text-white`}
          style={{ background: AVATAR_COLORS[seed % AVATAR_COLORS.length] }}
        >
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      {decoration &&
        (tinted ? (
          <span
            aria-hidden="true"
            style={{
              ...(status ? STATUS_DECORATION[status] : {}),
              background: profile?.accent_color ?? undefined,
              WebkitMaskImage: frameMask,
              maskImage: frameMask,
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
            }}
            className={`${FRAME_CLASS} ${voicePulse}`}
          />
        ) : (
          <img
            src={decorationSrc(decoration)}
            alt=""
            aria-hidden="true"
            style={status ? STATUS_DECORATION[status] : undefined}
            className={`${FRAME_CLASS} ${voicePulse}`}
          />
        ))}
      {status && <StatusDot status={status} ring={ringClass} />}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 'max-w-md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full ${width} flex-col overflow-hidden rounded-md bg-vulo-chat shadow-2xl`}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-lg font-semibold text-vulo-bright">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-vulo-muted hover:text-vulo-bright" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="scroll-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 bg-vulo-side px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const styles = {
    primary: 'bg-vulo-accent hover:bg-vulo-accentHover text-white',
    secondary: 'bg-vulo-input hover:bg-vulo-active text-vulo-bright',
    danger: 'bg-vulo-red hover:brightness-110 text-white',
    ghost: 'bg-transparent hover:underline text-vulo-text',
  }[variant];
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center rounded px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-4 block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-vulo-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-vulo-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded bg-vulo-rail px-3 py-2.5 text-vulo-text placeholder:text-vulo-muted outline-none focus:ring-2 focus:ring-vulo-accent';

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="mb-3 rounded bg-vulo-red/10 px-3 py-2 text-sm text-vulo-red">{children}</p>;
}
