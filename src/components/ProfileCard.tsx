import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { bannerBackground } from '../lib/banner';
import { loadDecorations } from '../lib/decorations';
import { useProfileBadges } from '../lib/badges';
import type { Profile, UserStatus } from '../lib/types';
import { profileNameStyle } from '../lib/nameEffects';
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
  const [activity, setActivity] = useState<{provider:string;title:string;subtitle:string|null;image_url:string|null;external_url:string|null;provider_username:string|null;provider_profile_url:string|null}[]>([]);

  useEffect(() => {
    void loadDecorations();
    let active = true;
    const loadActivity = async () => { const {data} = await supabase.from('profile_activity').select('provider,title,subtitle,image_url,external_url,provider_username,provider_profile_url').eq('user_id',profile.id).eq('is_public',true); if(active) setActivity(data || []); };
    void loadActivity();
    const timer = window.setInterval(() => void loadActivity(), 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [profile.id]);

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
        className="relative max-h-[90vh] w-full max-w-[340px] overflow-y-auto overscroll-contain rounded-lg bg-vulo-rail shadow-2xl"
      >
        <ProfileDecorationOverlay decorationId={profile.profile_decoration_id} />
        {/* Banner: the uploaded image, or a plain gradient when none is set. GIF banners play as they load. */}
        <div className="relative z-0 h-28 w-full overflow-hidden" style={{ background: bannerBackground(profile.accent_color) }}>
          {profile.banner_url && <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />}
        </div>

        <div className="relative z-10 isolate overflow-visible px-4 pb-4">
          <div className="relative z-20 -mt-12 mb-2 w-fit rounded-full bg-vulo-rail p-1.5">
            <Avatar profile={profile} size="lg" status={profile.status} ringClass="border-vulo-rail" />
          </div>

          <div className="relative z-10 overflow-hidden rounded-lg bg-transparent p-3">
            <div className="relative z-10">
              {/* Nameplates are shown in member lists and sidebars, not on the profile card. */}
              <p className="relative z-10 mb-1 truncate px-1 text-lg font-bold text-vulo-bright" style={profileNameStyle(profile)}>{name}</p>
              <p className="truncate text-sm text-vulo-muted">@{profile.username}</p>

              {activity.length > 0 && (
                <div className="mt-3 border-t border-vulo-line pt-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-vulo-muted">Listening / Playing</p>
                  <div className="space-y-2">
                    {activity.map((item) => (
                      <div key={item.provider} className="rounded-lg bg-vulo-side p-2">
                        <div className="flex items-center gap-3">
                          {item.image_url && <img src={item.image_url} alt="" className="h-10 w-10 rounded object-cover" />}
                          <span className="min-w-0">
                            <span className="block text-[10px] font-bold uppercase text-vulo-muted">{item.provider === 'spotify' ? 'Spotify' : 'Steam'}</span>
                            {item.external_url ? <a href={item.external_url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-vulo-bright hover:underline">{item.title}</a> : <span className="block truncate text-sm font-semibold text-vulo-bright">{item.title}</span>}
                            {item.subtitle && <span className="block truncate text-xs text-vulo-muted">{item.subtitle}</span>}
                            {item.provider === 'spotify' && item.provider_username && <a href={item.provider_profile_url || undefined} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-xs text-vulo-accent hover:underline">Spotify · {item.provider_username}</a>}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
