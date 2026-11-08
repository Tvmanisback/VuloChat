import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useBadgesForProfiles } from '../lib/badges';
import type { Attachment, DirectMessage, Embed, Profile } from '../lib/types';
import Composer from './Composer';
import Markdown from './Markdown';
import { AttachmentList, EmbedList } from './ChatView';
import { Avatar } from './ui';
import ReportDialog, { type ReportTarget } from './ReportDialog';
import BadgeIcon from './BadgeIcon';

interface Props {
  userId: string;
  friend: Profile;
}

function inPair(row: Pick<DirectMessage, 'sender_id' | 'recipient_id'>, me: string, other: string) {
  return (row.sender_id === me && row.recipient_id === other) || (row.sender_id === other && row.recipient_id === me);
}

export default function DMChat({ userId, friend }: Props) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const { profile: myProfile } = useAuth();
  const badgesByProfile = useBadgesForProfiles([userId, friend.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('direct_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${friend.id}),and(sender_id.eq.${friend.id},recipient_id.eq.${userId})`,
      )
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return;
        setMessages((data as DirectMessage[] | null) ?? []);
        setLoading(false);
      });

    // RLS limits these events to messages this user sent or received.
    const ch = supabase
      .channel(`dm:${userId}:${friend.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (p) => {
        const row = p.new as DirectMessage;
        if (!inPair(row, userId, friend.id)) return;
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' }, (p) => {
        const row = p.new as DirectMessage;
        if (!inPair(row, userId, friend.id)) return;
        setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'direct_messages' }, (p) => {
        const id = (p.old as { id: string }).id;
        setMessages((prev) => prev.filter((m) => m.id !== id));
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [userId, friend.id]);

  // Mark messages from this friend as read whenever the conversation is open.
  useEffect(() => {
    if (loading) return;
    void supabase
      .from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', userId)
      .eq('sender_id', friend.id)
      .is('read_at', null);
  }, [loading, messages.length, userId, friend.id]);

  useLayoutEffect(() => {
    if (stick.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async (content: string, attachments: Attachment[], embeds: Embed[]) => {
    const { error } = await supabase.from('direct_messages').insert({
      sender_id: userId,
      recipient_id: friend.id,
      content,
      attachments,
      embeds,
    });
    if (error) throw error;
    stick.current = true;
  };

  const name = friend.display_name || friend.username;

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-vulo-chat">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-vulo-rail px-4 shadow-sm">
        <Avatar profile={friend} size="xs" status={friend.status} ringClass="border-vulo-chat" />
        <h2 className="font-semibold text-vulo-bright">{name}</h2>
        <span className="text-xs text-vulo-muted">@{friend.username}</span>
      </header>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto py-4"
        role="log"
        aria-live="polite"
      >
        {loading && <p className="px-4 text-sm text-vulo-muted">Loading conversation…</p>}
        {!loading && messages.length === 0 && (
          <div className="px-4 pb-6 pt-10">
            <Avatar profile={friend} size="lg" />
            <h3 className="mt-3 text-2xl font-bold text-vulo-bright">{name}</h3>
            <p className="mt-1 text-vulo-muted">This is the beginning of your direct message history with {name}.</p>
          </div>
        )}

        {messages.map((m, i) => {
          const mine = m.sender_id === userId;
          const prev = messages[i - 1];
          const continuation = !!prev && prev.sender_id === m.sender_id;
          const authorProfile = mine ? myProfile : friend;
          const visibleIds = authorProfile?.visible_badge_ids ?? [];
          const shownBadges = (badgesByProfile[mine ? userId : friend.id] ?? []).filter((badge) => visibleIds.includes(badge.id));
          return (
            <article key={m.id} className={`relative flex gap-4 px-4 hover:bg-[#2e3035] ${continuation ? 'py-[1px]' : 'mt-[17px] py-[2px]'}`}>
              <div className="w-10 shrink-0">
                {!continuation && <Avatar profile={mine ? null : friend} size="md" className="mt-0.5" />}
              </div>
              <div className="min-w-0 flex-1">
                {!continuation && (
                  <header className="flex items-baseline gap-2">
                    <span className="font-medium text-vulo-bright">{mine ? 'You' : name}</span>
                    {shownBadges.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        {shownBadges.map((badge) => <BadgeIcon key={badge.id} badge={badge} size="small" />)}
                      </span>
                    )}
                    <time className="text-xs text-vulo-muted" dateTime={m.created_at}>
                      {new Date(m.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                  </header>
                )}
                {m.content && (
                  <div className="text-[15px] leading-[1.375rem]">
                    <Markdown text={m.content} />
                    {m.edited_at && <span className="ml-1 text-[10px] text-vulo-muted">(edited)</span>}
                  </div>
                )}
                <AttachmentList items={m.attachments} />
                <EmbedList items={m.embeds} />
              </div>
              {!mine && (
                <button
                  type="button"
                  onClick={() =>
                    setReporting({ type: 'direct_message', id: m.id, userId: m.sender_id, serverId: null, snapshot: m.content || null, what: 'message' })
                  }
                  className="absolute right-4 top-1 rounded px-2 py-0.5 text-xs text-vulo-muted opacity-60 hover:text-vulo-red hover:opacity-100"
                >
                  Report
                </button>
              )}
            </article>
          );
        })}
      </div>

      <Composer userId={userId} placeholder={`Message @${friend.username}`} onSend={send} />
      {reporting && <ReportDialog target={reporting} onClose={() => setReporting(null)} />}
    </section>
  );
}
