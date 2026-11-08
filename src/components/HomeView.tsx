import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import DMChat from './DMChat';
import VoiceBar from './VoiceBar';
import UserPanel from './UserPanel';
import { Icon } from './icons';
import { Avatar, Button, ErrorText } from './ui';

export interface FriendRow {
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  requester: Profile | null;
  addressee: Profile | null;
}

export interface FriendsState {
  rows: FriendRow[];
  accepted: FriendRow[];
  incoming: FriendRow[];
  outgoing: FriendRow[];
  other: (r: FriendRow) => Profile | null;
  reload: () => Promise<void>;
}

/** Friend list and requests for the signed-in user, kept live. */
export function useFriends(userId: string): FriendsState {
  const [rows, setRows] = useState<FriendRow[]>([]);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('friends')
      .select(
        'requester_id,addressee_id,status,requester:profiles!friends_requester_id_fkey(*),addressee:profiles!friends_addressee_id_fkey(*)',
      )
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    setRows(((data as unknown) as FriendRow[] | null) ?? []);
  }, [userId]);

  useEffect(() => {
    void reload();
    const ch = supabase
      .channel(`friends:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, () => void reload())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, reload]);

  const other = (r: FriendRow) => (r.requester_id === userId ? r.addressee : r.requester);
  return {
    rows,
    accepted: rows.filter((r) => r.status === 'accepted'),
    incoming: rows.filter((r) => r.status === 'pending' && r.addressee_id === userId),
    outgoing: rows.filter((r) => r.status === 'pending' && r.requester_id === userId),
    other,
    reload,
  };
}

export function HomeSidebar({
  friends,
  selectedDm,
  onFriends,
  onDm,
  onOpenUserSettings,
}: {
  friends: FriendsState;
  selectedDm: string | null;
  onFriends: () => void;
  onDm: (id: string) => void;
  onOpenUserSettings: () => void;
}) {
  const { accepted, incoming, other } = friends;
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-vulo-side">
      <div className="flex h-12 items-center border-b border-vulo-rail px-4 font-semibold text-vulo-bright shadow-sm">
        Direct messages
      </div>
      <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Direct messages">
        <button
          onClick={onFriends}
          className={`flex w-full items-center gap-3 rounded px-2 py-2 text-left text-sm ${
            selectedDm === null ? 'bg-vulo-active text-vulo-bright' : 'text-vulo-muted hover:bg-vulo-hover hover:text-vulo-text'
          }`}
        >
          <Icon name="users" className="h-5 w-5" />
          Friends
          {incoming.length > 0 && (
            <span className="ml-auto rounded-full bg-vulo-red px-1.5 text-xs font-semibold text-white">{incoming.length}</span>
          )}
        </button>
        <p className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-vulo-muted">Friends</p>
        {accepted.length === 0 && <p className="px-2 text-sm text-vulo-muted">No friends yet. Add someone to start a conversation.</p>}
        {accepted.map((r) => {
          const p = other(r);
          if (!p) return null;
          const active = selectedDm === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onDm(p.id)}
              className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-sm ${
                active ? 'bg-vulo-active text-vulo-bright' : 'text-vulo-muted hover:bg-vulo-hover hover:text-vulo-text'
              }`}
            >
              <Avatar profile={p} size="sm" status={p.status} ringClass="border-vulo-side" />
              <span className="truncate">{p.display_name || p.username}</span>
            </button>
          );
        })}
      </nav>
      <VoiceBar />
      <UserPanel onOpenSettings={onOpenUserSettings} />
    </aside>
  );
}

export function HomeMain({
  userId,
  friends,
  selectedDm,
  onDm,
}: {
  userId: string;
  friends: FriendsState;
  selectedDm: string | null;
  onDm: (id: string) => void;
}) {
  const dmProfile = selectedDm ? friends.accepted.map(friends.other).find((p) => p?.id === selectedDm) ?? null : null;
  if (dmProfile) return <DMChat key={dmProfile.id} userId={userId} friend={dmProfile} />;
  return <FriendsPanel userId={userId} friends={friends} onMessage={onDm} />;
}

function FriendsPanel({ userId, friends, onMessage }: { userId: string; friends: FriendsState; onMessage: (id: string) => void }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { accepted, incoming, outgoing, other, reload } = friends;

  const addFriend = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const name = username.trim().toLowerCase().replace(/^@/, '');
    if (!name) return;
    const { data: target } = await supabase.from('profiles').select('id, username').eq('username', name).maybeSingle();
    if (!target) return setError(`No one has the username “${name}”.`);
    if (target.id === userId) return setError('You cannot add yourself.');
    const { error: err } = await supabase.from('friends').insert({ requester_id: userId, addressee_id: target.id, status: 'pending' });
    if (err) return setError(err.message.includes('already exists') ? 'You already have a request with this user.' : err.message);
    setNotice(`Friend request sent to ${name}.`);
    setUsername('');
    await reload();
  };

  const respond = async (r: FriendRow, accept: boolean) => {
    if (accept) {
      await supabase.from('friends').update({ status: 'accepted' }).eq('requester_id', r.requester_id).eq('addressee_id', userId);
    } else {
      await supabase.from('friends').delete().eq('requester_id', r.requester_id).eq('addressee_id', r.addressee_id);
    }
    await reload();
  };

  const row = (r: FriendRow, actions: ReactNode) => {
    const p = other(r);
    return (
      <li key={`${r.requester_id}-${r.addressee_id}`} className="flex items-center gap-3 rounded border-t border-vulo-line px-3 py-3 hover:bg-vulo-hover">
        <Avatar profile={p} size="md" status={p?.status} ringClass="border-vulo-chat" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-vulo-bright">{p?.display_name || p?.username || 'Unknown'}</p>
          <p className="truncate text-xs text-vulo-muted">@{p?.username}</p>
        </div>
        <div className="flex gap-2">{actions}</div>
      </li>
    );
  };

  const iconBtn = 'flex h-9 w-9 items-center justify-center rounded-full bg-vulo-side text-vulo-muted hover:text-vulo-bright';

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-vulo-chat">
      <header className="flex h-12 items-center gap-4 border-b border-vulo-rail px-4 shadow-sm">
        <Icon name="users" className="h-6 w-6 text-vulo-muted" />
        <h2 className="font-semibold text-vulo-bright">Friends</h2>
        <form onSubmit={addFriend} className="ml-auto flex items-center gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Add a friend by username"
            className="w-56 rounded bg-vulo-rail px-3 py-1.5 text-sm text-vulo-text outline-none focus:ring-2 focus:ring-vulo-accent"
            aria-label="Username to add"
          />
          <Button type="submit" className="py-1.5">Send request</Button>
        </form>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto p-4">
        <div className="mb-4 max-w-2xl">
          <ErrorText>{error}</ErrorText>
          {notice && <p className="mb-3 rounded bg-vulo-green/10 px-3 py-2 text-sm text-vulo-green">{notice}</p>}
        </div>

        {incoming.length > 0 && (
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-vulo-muted">Incoming requests — {incoming.length}</h3>
            <ul>
              {incoming.map((r) =>
                row(
                  r,
                  <>
                    <button className={`${iconBtn} hover:text-vulo-green`} onClick={() => void respond(r, true)} aria-label="Accept"><Icon name="check" className="h-5 w-5" /></button>
                    <button className={`${iconBtn} hover:text-vulo-red`} onClick={() => void respond(r, false)} aria-label="Decline"><Icon name="x" className="h-5 w-5" /></button>
                  </>,
                ),
              )}
            </ul>
          </section>
        )}

        {outgoing.length > 0 && (
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-vulo-muted">Outgoing requests — {outgoing.length}</h3>
            <ul>
              {outgoing.map((r) =>
                row(r, <button className={`${iconBtn} hover:text-vulo-red`} onClick={() => void respond(r, false)} aria-label="Cancel request"><Icon name="x" className="h-5 w-5" /></button>),
              )}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-vulo-muted">All friends — {accepted.length}</h3>
          {accepted.length === 0 && <p className="text-sm text-vulo-muted">Send a request above to get started.</p>}
          <ul>
            {accepted.map((r) => {
              const p = other(r);
              return row(
                r,
                <>
                  <button className={iconBtn} onClick={() => p && onMessage(p.id)} aria-label="Message"><Icon name="message" className="h-5 w-5" /></button>
                  <button className={`${iconBtn} hover:text-vulo-red`} onClick={() => void respond(r, false)} aria-label="Remove friend"><Icon name="x" className="h-5 w-5" /></button>
                </>,
              );
            })}
          </ul>
        </section>
      </div>
    </section>
  );
}
