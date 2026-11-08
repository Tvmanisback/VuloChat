import { useMemo, useState } from 'react';
import type { Channel, MemberRow, Server, VoiceState } from '../lib/types';
import { hasPerm, PERM } from '../lib/permissions';
import { useVoice } from '../lib/voiceContext';
import { Icon } from './icons';
import { Avatar } from './ui';
import VoiceBar from './VoiceBar';
import UserPanel from './UserPanel';

interface Props {
  server: Server;
  channels: Channel[];
  voiceStates: VoiceState[];
  members: MemberRow[];
  perms: number;
  isOwner: boolean;
  activeChannelId: string | null;
  onSelectChannel: (c: Channel) => void;
  onCreateChannel: (parentCategoryId: string | null) => void;
  onInvite: () => void;
  onServerSettings: () => void;
  onLeaveServer: () => void;
  onOpenUserSettings: () => void;
}

export default function ChannelSidebar(props: Props) {
  const { server, channels, voiceStates, members, perms, isOwner, activeChannelId } = props;
  const voice = useVoice();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCategory = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const canManage = hasPerm(perms, PERM.MANAGE_CHANNELS);
  const canInvite = hasPerm(perms, PERM.CREATE_INVITE);
  const canManageServer = hasPerm(perms, PERM.MANAGE_SERVER);

  const profileById = useMemo(() => {
    const m = new Map<string, MemberRow['profiles']>();
    members.forEach((r) => m.set(r.user_id, r.profiles));
    return m;
  }, [members]);

  const categories = channels.filter((c) => c.type === 'category').sort((a, b) => a.position - b.position);
  const orphans = channels.filter((c) => c.type !== 'category' && !c.parent_id).sort((a, b) => a.position - b.position);

  const renderChannel = (c: Channel) => {
    const isActive = activeChannelId === c.id;
    const inVoice = voice.active?.channelId === c.id;
    const occupants = voiceStates.filter((v) => v.channel_id === c.id);

    return (
      <div key={c.id}>
        <button
          onClick={() => {
            if (c.type === 'voice') {
              void voice.join(server.id, c.id, c.name);
            }
            props.onSelectChannel(c);
          }}
          className={`group flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[15px] transition ${
            isActive ? 'bg-vulo-active text-vulo-bright' : 'text-vulo-muted hover:bg-vulo-hover hover:text-vulo-text'
          }`}
        >
          <Icon name={c.type === 'voice' ? 'speaker' : 'hash'} className="h-5 w-5 shrink-0 opacity-70" />
          <span className="flex-1 truncate">{c.name}</span>
          {inVoice && <span className="h-2 w-2 rounded-full bg-vulo-green" aria-label="Connected" />}
        </button>

        {c.type === 'voice' && occupants.length > 0 && (
          <ul className="ml-6 mt-0.5 space-y-0.5 pb-1">
            {occupants.map((v) => {
              const p = profileById.get(v.user_id);
              const speaking = voice.snapshot.speaking[v.user_id];
              return (
                <li key={v.user_id} className="flex items-center gap-2 rounded px-1.5 py-0.5 text-sm text-vulo-text">
                  <span className={`rounded-full p-[1px] ${speaking ? 'ring-2 ring-vulo-green' : ''}`}>
                    <Avatar profile={p ?? null} size="xs" speaking={!!speaking} />
                  </span>
                  <span className="flex-1 truncate">{p?.display_name || p?.username || 'Unknown'}</span>
                  {v.self_deafen ? <Icon name="deafen" className="h-3.5 w-3.5 text-vulo-red" /> : v.self_mute ? <Icon name="micOff" className="h-3.5 w-3.5 text-vulo-red" /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-vulo-side">
      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex h-12 w-full items-center justify-between border-b border-vulo-rail px-4 text-left font-semibold text-vulo-bright shadow-sm hover:bg-vulo-hover"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="truncate">{server.name}</span>
          <Icon name="chevronDown" className="h-4 w-4 shrink-0" />
        </button>
        {menuOpen && (
          <div role="menu" className="absolute left-2 right-2 top-12 z-30 rounded bg-vulo-rail p-1.5 text-sm shadow-xl">
            {canInvite && <MenuItem label="Invite people" onClick={() => { setMenuOpen(false); props.onInvite(); }} />}
            {canManageServer && <MenuItem label="Server settings" onClick={() => { setMenuOpen(false); props.onServerSettings(); }} />}
            {canManage && <MenuItem label="Create channel" onClick={() => { setMenuOpen(false); props.onCreateChannel(null); }} />}
            {!isOwner && <MenuItem label="Leave server" danger onClick={() => { setMenuOpen(false); props.onLeaveServer(); }} />}
          </div>
        )}
      </div>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {orphans.length > 0 && <div className="space-y-0.5">{orphans.map(renderChannel)}</div>}

        {categories.map((cat) => {
          const kids = channels.filter((c) => c.parent_id === cat.id).sort((a, b) => a.position - b.position);
          return (
            <section key={cat.id}>
              <div className="group mb-1 flex items-center justify-between px-1">
                <h3>
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    aria-expanded={!collapsed[cat.id]}
                    className="flex min-w-0 items-center gap-0.5 text-xs font-semibold uppercase tracking-wide text-vulo-muted hover:text-vulo-text"
                  >
                    <Icon name="chevronDown" className={`h-3 w-3 shrink-0 transition-transform ${collapsed[cat.id] ? '-rotate-90' : ''}`} />
                    <span className="truncate">{cat.name}</span>
                  </button>
                </h3>
                {canManage && (
                  <button
                    onClick={() => props.onCreateChannel(cat.id)}
                    className="text-vulo-muted opacity-0 transition hover:text-vulo-text group-hover:opacity-100"
                    aria-label={`Create channel in ${cat.name}`}
                  >
                    <Icon name="plus" className="h-4 w-4" />
                  </button>
                )}
              </div>
              {!collapsed[cat.id] && <div className="space-y-0.5">{kids.map(renderChannel)}</div>}
            </section>
          );
        })}
      </div>

      <VoiceBar />
      <UserPanel onOpenSettings={props.onOpenUserSettings} />
    </aside>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`block w-full rounded px-2 py-1.5 text-left ${danger ? 'text-vulo-red hover:bg-vulo-red hover:text-white' : 'text-vulo-text hover:bg-vulo-accent hover:text-white'}`}
    >
      {label}
    </button>
  );
}
