import type { Role, MemberRoleRow } from './types';

// Must match the bit values used in supabase/schema.sql.
export const PERM = {
  VIEW_CHANNEL: 1,
  SEND_MESSAGES: 2,
  MANAGE_CHANNELS: 4,
  MANAGE_ROLES: 8,
  MANAGE_MESSAGES: 16,
  KICK_MEMBERS: 32,
  CONNECT_VOICE: 64,
  SPEAK: 128,
  ADMINISTRATOR: 256,
  MANAGE_SERVER: 512,
  CREATE_INVITE: 1024,
} as const;

export const ALL_PERMS = Object.values(PERM).reduce((a, b) => a | b, 0);

export const PERM_LABELS: { key: keyof typeof PERM; label: string; hint: string }[] = [
  { key: 'VIEW_CHANNEL', label: 'View channels', hint: 'See channels and read messages' },
  { key: 'SEND_MESSAGES', label: 'Send messages', hint: 'Post in text channels' },
  { key: 'MANAGE_CHANNELS', label: 'Manage channels', hint: 'Create, rename and delete channels' },
  { key: 'MANAGE_ROLES', label: 'Manage roles', hint: 'Create roles and assign them to members' },
  { key: 'MANAGE_MESSAGES', label: 'Manage messages', hint: 'Delete other members’ messages' },
  { key: 'KICK_MEMBERS', label: 'Kick members', hint: 'Remove members from the server' },
  { key: 'CONNECT_VOICE', label: 'Connect to voice', hint: 'Join voice channels' },
  { key: 'SPEAK', label: 'Speak', hint: 'Transmit audio in voice channels' },
  { key: 'CREATE_INVITE', label: 'Create invites', hint: 'Make invite links' },
  { key: 'MANAGE_SERVER', label: 'Manage server', hint: 'Rename the server and manage invites' },
  { key: 'ADMINISTRATOR', label: 'Administrator', hint: 'Grants every permission' },
];

export function hasPerm(mask: number, perm: number): boolean {
  if ((mask & PERM.ADMINISTRATOR) === PERM.ADMINISTRATOR) return true;
  return (mask & perm) === perm;
}

/** Effective permissions for a user in a server, matching public.has_server_permission(). */
export function effectivePermissions(opts: {
  isOwner: boolean;
  roles: Role[];
  myRoleIds: string[];
}): number {
  if (opts.isOwner) return ALL_PERMS;
  let mask = 0;
  for (const r of opts.roles) {
    if (r.is_default || opts.myRoleIds.includes(r.id)) mask |= r.permissions;
  }
  return mask;
}

export function myRoleIdsFrom(rows: MemberRoleRow[], serverId: string, userId: string): string[] {
  return rows.filter((r) => r.server_id === serverId && r.user_id === userId).map((r) => r.role_id);
}
