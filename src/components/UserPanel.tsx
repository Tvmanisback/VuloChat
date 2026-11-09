import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useVoice } from '../lib/voiceContext';
import type { UserStatus } from '../lib/types';
import { profileNameStyle } from '../lib/nameEffects';
import { Icon } from './icons';
import { Avatar } from './ui';

const STATUS_OPTIONS: { value: UserStatus; label: string; color: string }[] = [
  { value: 'online', label: 'Online', color: 'bg-vulo-green' },
  { value: 'idle', label: 'Idle', color: 'bg-vulo-idle' },
  { value: 'dnd', label: 'Do not disturb', color: 'bg-vulo-dnd' },
  { value: 'offline', label: 'Invisible', color: 'bg-vulo-muted' },
];

export default function UserPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { profile, setStatus } = useAuth();
  const voice = useVoice();
  const [menu, setMenu] = useState(false);
  if (!profile) return null;

  const iconBtn = (on: boolean, danger = false) =>
    `flex h-8 w-8 items-center justify-center rounded transition ${
      danger && on ? 'text-vulo-red' : on ? 'text-vulo-red' : 'text-vulo-text'
    } hover:bg-vulo-hover disabled:opacity-40`;

  return (
    <div className="relative flex items-center gap-2 bg-vulo-rail/70 px-2 py-2">
      <button className="relative rounded-md p-1 hover:bg-vulo-hover" onClick={() => setMenu((m) => !m)} aria-label="Change status">
        <Avatar profile={profile} size="sm" status={profile.status} ringClass="border-vulo-rail" />
      </button>
      {menu && (
        <div className="absolute bottom-full left-2 z-20 mb-2 w-56 rounded bg-vulo-rail p-1.5 shadow-xl">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-vulo-text hover:bg-vulo-accent hover:text-white"
              onClick={() => {
                void setStatus(o.value);
                setMenu(false);
              }}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${o.color}`} />
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-vulo-bright" style={profileNameStyle(profile)}>{profile.display_name || profile.username}</p>
        <p className="truncate text-xs text-vulo-muted">@{profile.username}</p>
      </div>

      <button className={iconBtn(voice.muted)} onClick={voice.toggleMute} disabled={!voice.active} aria-label={voice.muted ? 'Unmute' : 'Mute'} title={voice.muted ? 'Unmute' : 'Mute'}>
        <Icon name={voice.muted ? 'micOff' : 'mic'} className="h-5 w-5" />
      </button>
      <button className={iconBtn(voice.deafened)} onClick={voice.toggleDeafen} disabled={!voice.active} aria-label={voice.deafened ? 'Undeafen' : 'Deafen'} title={voice.deafened ? 'Undeafen' : 'Deafen'}>
        <Icon name={voice.deafened ? 'deafen' : 'headphones'} className="h-5 w-5" />
      </button>
      <button className={iconBtn(false)} onClick={onOpenSettings} aria-label="User settings" title="User settings">
        <Icon name="settings" className="h-5 w-5" />
      </button>
    </div>
  );
}
