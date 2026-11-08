import { useMemo } from 'react';
import type { MemberRow, MemberRoleRow, Role, UserStatus } from '../lib/types';
import { Avatar } from './ui';

interface Props {
  members: MemberRow[];
  roles: Role[];
  memberRoles: MemberRoleRow[];
  ownerId: string;
}

export default function MemberList({ members, roles, memberRoles, ownerId }: Props) {
  // The highest-positioned role with a name and colour sets a member's name colour.
  const roleColor = useMemo(() => {
    const byId = new Map<string, Role>(roles.map((r) => [r.id, r] as const));
    const colorFor = new Map<string, string>();
    for (const m of members) {
      const mine = memberRoles
        .filter((mr) => mr.user_id === m.user_id && mr.server_id === m.server_id)
        .map((mr) => byId.get(mr.role_id))
        .filter((r): r is Role => !!r && !r.is_default)
        .sort((a, b) => b.position - a.position);
      if (m.user_id === ownerId) colorFor.set(m.user_id, '#f0b232');
      else if (mine[0]) colorFor.set(m.user_id, mine[0].color);
    }
    return colorFor;
  }, [members, roles, memberRoles, ownerId]);

  const sorted = [...members].sort((a, b) => {
    const na = (a.profiles?.display_name || a.profiles?.username || '').toLowerCase();
    const nb = (b.profiles?.display_name || b.profiles?.username || '').toLowerCase();
    return na.localeCompare(nb);
  });
  const online = sorted.filter((m) => m.profiles && m.profiles.status !== 'offline');
  const offline = sorted.filter((m) => !m.profiles || m.profiles.status === 'offline');

  const section = (title: string, list: MemberRow[]) =>
    list.length === 0 ? null : (
      <section className="mb-4">
        <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-vulo-muted">
          {title} — {list.length}
        </h3>
        <ul className="space-y-0.5">
          {list.map((m) => {
            const p = m.profiles;
            const name = m.nickname || p?.display_name || p?.username || 'Unknown';
            const status: UserStatus = p?.status ?? 'offline';
            return (
              <li key={m.user_id}>
                <div className={`flex items-center gap-3 rounded px-2 py-1.5 hover:bg-vulo-hover ${status === 'offline' ? 'opacity-50' : ''}`}>
                  <Avatar profile={p ?? null} size="sm" status={status} ringClass="border-vulo-side" />
                  <span className="truncate text-sm font-medium" style={{ color: roleColor.get(m.user_id) ?? '#dbdee1' }}>
                    {name}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );

  return (
    <aside className="scroll-thin hidden h-full w-60 shrink-0 overflow-y-auto bg-vulo-side px-2 py-4 lg:block" aria-label="Members">
      {section('Online', online)}
      {section('Offline', offline)}
    </aside>
  );
}
