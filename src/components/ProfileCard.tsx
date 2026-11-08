import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { bannerBackground } from '../lib/banner';
import { useProfileBadges } from '../lib/badges';
import type { Profile, UserStatus } from '../lib/types';
import BadgeIcon from './BadgeIcon';
import Markdown from './Markdown';
import ProfileDecorationOverlay from './ProfileDecoration';
import ReportDialog from './ReportDialog';
import { Avatar } from './ui';

const STATUS_LABEL: Record<UserStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do not disturb',
  offline: 'Offline',
};

export default function ProfileCard({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const badges = useProfileBadges(profile.id);
  const name = profile.display_name || profile.username;
  const joined = new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const { session } = useAuth();
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name}'s profile`}
        className="w-full max-w-[340px] overflow-hidden rounded-lg bg-vulo-rail shadow-2xl"
      >
        {/* Banner: the uploaded image, or a plain gradient when none is set. GIF banners play as they load. */}
        <div className="relative h-28 w-full overflow-hidden" style={{ background: bannerBackground(profile.accent_color) }}>
          {profile.banner_url && <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />}
          <ProfileDecorationOverlay decorationId={profile.profile_decoration_id} />
        </div>

        <div className="relative isolate px-4 pb-4">
          <div className="relative z-10 -mt-10 mb-2 w-fit rounded-full bg-vulo-rail p-1.5">
            <Avatar profile={profile} size="lg" status={profile.status} ringClass="border-vulo-rail" />
          </div>

          <div className="relative z-10 overflow-hidden rounded-lg bg-vulo-chat p-3">
            <div className="relative">
              <p className="truncate text-lg font-bold text-vulo-bright">{name}</p>
              <p className="truncate text-sm text-vulo-muted">@{profile.username}</p>
              <p className="mt-1 text-xs text-vulo-muted">{STATUS_LABEL[profile.status]}</p>

              {profile.custom_status && <p className="mt-2 break-words text-sm text-vulo-text">{profile.custom_status}</p>}

              {badges.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Badges">
                  {badges.map((b) => (
                    <li key={b.id}>
                      <BadgeIcon badge={b} />
                    </li>
                  ))}
                </ul>
              )}

              {profile.about && (
                <div className="mt-3 border-t border-vulo-line pt-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-vulo-muted">About me</p>
                  <Markdown text={profile.about} />
                </div>
              )}

              <p className="mt-3 border-t border-vulo-line pt-3 text-xs text-vulo-muted">Member since {joined}</p>

              {session && session.user.id !== profile.id && (
                <>
                  <button type="button" onClick={() => setReporting(true)} className="mt-2 block text-xs text-vulo-muted hover:text-vulo-red">
                    Report user
                  </button>
                  {reporting && (
                    <ReportDialog
                      target={{ type: 'profile', id: profile.id, userId: profile.id, serverId: null, snapshot: null, what: 'profile' }}
                      onClose={() => setReporting(false)}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
