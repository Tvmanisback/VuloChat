import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { effectivePermissions, myRoleIdsFrom } from './permissions';
import type { Channel, MemberRow, MemberRoleRow, Profile, Role, Server, VoiceState } from './types';

export interface ServerData {
  loading: boolean;
  server: Server | null;
  channels: Channel[];
  roles: Role[];
  memberRoles: MemberRoleRow[];
  members: MemberRow[];
  voiceStates: VoiceState[];
  isOwner: boolean;
  perms: number;
  reload: () => Promise<void>;
  setMemberProfile: (userId: string, patch: Partial<Profile>) => void;
}

const EMPTY_DATA = {
  server: null,
  channels: [],
  roles: [],
  memberRoles: [],
  members: [],
  voiceStates: [],
  isOwner: false,
  perms: 0,
};

/**
 * Loads everything a server view needs and keeps it live. Any change to the
 * server's channels, roles, members or voice presence triggers a debounced refetch.
 * Profile status changes are patched in place.
 */
export function useServerData(serverId: string | null, userId: string): ServerData {
  const [state, setState] = useState<Omit<ServerData, 'reload' | 'setMemberProfile'>>({
    loading: true,
    ...EMPTY_DATA,
  });

  const reload = useCallback(async () => {
    if (!serverId) return;
    const [srv, chans, roles, memberRoles, members, voice] = await Promise.all([
      supabase.from('servers').select('*').eq('id', serverId).maybeSingle(),
      supabase.from('channels').select('*').eq('server_id', serverId).order('position'),
      supabase.from('server_roles').select('*').eq('server_id', serverId).order('position', { ascending: false }),
      supabase.from('member_roles').select('*').eq('server_id', serverId),
      supabase
        .from('server_members')
        .select('server_id,user_id,nickname,joined_at,profiles(*)')
        .eq('server_id', serverId),
      supabase.from('voice_states').select('*').eq('server_id', serverId),
    ]);

    const server = (srv.data as Server | null) ?? null;
    const roleRows = (roles.data as Role[] | null) ?? [];
    const memberRoleRows = (memberRoles.data as MemberRoleRow[] | null) ?? [];
    const isOwner = server?.owner_id === userId;

    setState({
      loading: false,
      server,
      channels: (chans.data as Channel[] | null) ?? [],
      roles: roleRows,
      memberRoles: memberRoleRows,
      members: ((members.data as unknown) as MemberRow[] | null) ?? [],
      voiceStates: (voice.data as VoiceState[] | null) ?? [],
      isOwner,
      perms: effectivePermissions({
        isOwner,
        roles: roleRows,
        myRoleIds: myRoleIdsFrom(memberRoleRows, serverId, userId),
      }),
    });
  }, [serverId, userId]);

  useEffect(() => {
    if (!serverId) return;
    setState((s) => ({ ...s, loading: true }));
    void reload();

    let timer: number | undefined;
    const debounced = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void reload(), 120);
    };
    const filter = `server_id=eq.${serverId}`;

    const ch = supabase
      .channel(`server:${serverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels', filter }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_roles', filter }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_roles', filter }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members', filter }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_states', filter }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers', filter: `id=eq.${serverId}` }, debounced)
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  }, [serverId, reload]);

  // Presence changes for any profile arrive as UPDATE events. Patch the member list in place.
  useEffect(() => {
    if (!serverId) return;
    const ch = supabase
      .channel(`profiles-live:${serverId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const next = payload.new as Profile;
        setState((s) => ({
          ...s,
          members: s.members.map((m) => (m.user_id === next.id ? { ...m, profiles: { ...(m.profiles as Profile), ...next } } : m)),
        }));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [serverId]);

  const setMemberProfile = useCallback((uid: string, patch: Partial<Profile>) => {
    setState((s) => ({
      ...s,
      members: s.members.map((m) =>
        m.user_id === uid && m.profiles ? { ...m, profiles: { ...m.profiles, ...patch } } : m,
      ),
    }));
  }, []);

  return { ...state, reload, setMemberProfile };
}
