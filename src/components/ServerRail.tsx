import type { Server } from '../lib/types';
import { Icon } from './icons';
import { Logo } from './ui';

interface Props {
  servers: Server[];
  activeServerId: string | null;
  onHome: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onJoin: () => void;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

export default function ServerRail({ servers, activeServerId, onHome, onSelect, onCreate, onJoin }: Props) {
  const railButton = (active: boolean) =>
    `group relative flex h-12 w-12 items-center justify-center transition-all ${
      active ? 'rounded-2xl bg-vulo-accent text-white' : 'rounded-[24px] bg-vulo-chat text-vulo-text hover:rounded-2xl hover:bg-vulo-accent hover:text-white'
    }`;
  const pill = (active: boolean) =>
    `absolute -left-3 w-1 rounded-r bg-vulo-bright transition-all ${active ? 'h-10' : 'h-0 group-hover:h-5'}`;

  return (
    <nav className="scroll-thin flex h-full w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-vulo-rail py-3" aria-label="Servers">
      <div className="relative flex items-center justify-center">
        <span className={pill(activeServerId === null)} />
        <button onClick={onHome} className={railButton(activeServerId === null)} aria-label="Direct messages and friends" title="Home">
          <Logo className="h-7 w-7" />
        </button>
      </div>

      <div className="my-1 h-[2px] w-8 rounded bg-vulo-chat" />

      {servers.map((s) => (
        <div key={s.id} className="relative flex items-center justify-center">
          <span className={pill(activeServerId === s.id)} />
          <button
            onClick={() => onSelect(s.id)}
            className={railButton(activeServerId === s.id)}
            aria-label={s.name}
            title={s.name}
          >
            {s.icon_url ? (
              <img src={s.icon_url} alt="" className="h-full w-full rounded-[inherit] object-cover" />
            ) : (
              <span className="text-sm font-semibold">{initials(s.name)}</span>
            )}
          </button>
        </div>
      ))}

      <div className="relative flex items-center justify-center">
        <button onClick={onCreate} className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-vulo-chat text-vulo-green transition-all hover:rounded-2xl hover:bg-vulo-green hover:text-white" aria-label="Create a server" title="Create a server">
          <Icon name="plus" className="h-6 w-6" />
        </button>
      </div>
      <div className="relative flex items-center justify-center">
        <button onClick={onJoin} className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-vulo-chat text-vulo-green transition-all hover:rounded-2xl hover:bg-vulo-green hover:text-white" aria-label="Join a server" title="Join a server with an invite">
          <Icon name="userPlus" className="h-5 w-5" />
        </button>
      </div>
    </nav>
  );
}
