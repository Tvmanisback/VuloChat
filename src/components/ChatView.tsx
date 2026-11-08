import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { supabase } from '../lib/supabase';
import { attachmentUrl, formatBytes } from '../lib/attachments';
import { useDevice } from '../lib/device';
import { hasPerm, PERM } from '../lib/permissions';
import { getSettings, useSettings } from '../lib/settings';
import { playCue } from '../lib/sounds';
import type { Attachment, Channel, Embed, MemberRow, Message, Profile } from '../lib/types';
import Composer from './Composer';
import ForwardDialog from './ForwardDialog';
import Markdown from './Markdown';
import { Icon } from './icons';
import { Avatar } from './ui';

const PAGE = 50;
const GROUP_WINDOW_MS = 7 * 60 * 1000;

interface Props {
  channel: Channel;
  userId: string;
  perms: number;
  members: MemberRow[];
  myDisplayName: string;
  onOpenProfile?: (profile: Profile) => void;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `Today at ${time}` : `${d.toLocaleDateString()} ${time}`;
}

export default function ChatView({ channel, userId, perms, members, myDisplayName, onOpenProfile }: Props) {
  const settings = useSettings();
  const device = useDevice();
  const pressTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; msg: Message } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const profiles = new Map<string, Profile | null>(members.map((m) => [m.user_id, m.profiles] as const));
  const canSend = hasPerm(perms, PERM.SEND_MESSAGES);
  const canModerate = hasPerm(perms, PERM.MANAGE_MESSAGES);

  const nameOf = (id: string) => {
    const p = profiles.get(id);
    return p?.display_name || p?.username || 'Unknown user';
  };

  // A short plain-text preview of a message, for reply quotes.
  const snippetOf = (m: Message) => {
    if (m.content.trim()) return m.content.replace(/\s+/g, ' ').slice(0, 120);
    return m.attachments.length ? 'an attachment' : 'a message';
  };

  // Initial load and realtime subscription for this channel.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setReplyTo(null);
    supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channel.id)
      .order('created_at', { ascending: false })
      .limit(PAGE)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = ((data as Message[] | null) ?? []).reverse();
        setMessages(rows);
        setHasMore((data?.length ?? 0) === PAGE);
        setLoading(false);
      });

    const filter = `channel_id=eq.${channel.id}`;
    const ch = supabase
      .channel(`messages:${channel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (p) => {
        const row = p.new as Message;
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        if (row.author_id !== userId) playCue('message', getSettings().outputVolume);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, (p) => {
        const row = p.new as Message;
        setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter }, (p) => {
        const id = (p.old as { id: string }).id;
        setMessages((prev) => prev.filter((m) => m.id !== id));
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [channel.id, userId]);

  // Keep the view pinned to the newest message unless the user has scrolled up.
  useLayoutEffect(() => {
    if (stickToBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = useCallback(async () => {
    const oldest = messages[0];
    if (!oldest) return;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channel.id)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    const rows = ((data as Message[] | null) ?? []).reverse();
    setMessages((prev) => [...rows, ...prev]);
    setHasMore(rows.length === PAGE);
  }, [channel.id, messages]);

  const send = async (content: string, attachments: Attachment[], embeds: Embed[]) => {
    const { error } = await supabase.from('messages').insert({
      channel_id: channel.id,
      author_id: userId,
      content,
      attachments,
      embeds,
      reply_to: replyTo?.id ?? null,
    });
    if (error) throw error;
    setReplyTo(null);
    stickToBottom.current = true;
  };

  const saveEdit = async () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (!text) return;
    const { error } = await supabase
      .from('messages')
      .update({ content: text, edited_at: new Date().toISOString() })
      .eq('id', editing.id);
    if (error) {
      // Usually a blocked word or a rate limit. Keep the editor open so the text can be fixed.
      window.alert(error.message);
      return;
    }
    setEditing(null);
  };

  const remove = async (m: Message) => {
    if (!window.confirm('Delete this message? This cannot be undone.')) return;
    await supabase.from('messages').delete().eq('id', m.id);
  };

  // Close the context menu on any outside click or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('click', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);

  // Opens the message actions at a point on screen. Right-click, the three dots and long-press all use this.
  const openMenuAt = (x: number, y: number, msg: Message) => {
    setMenu({ x: Math.min(x, window.innerWidth - 200), y: Math.min(y, window.innerHeight - 260), msg });
  };

  const openMenu = (e: ReactMouseEvent, msg: Message) => {
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY, msg);
  };

  const cancelPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressStart.current = null;
  };

  // Touch: holding a message for half a second opens its actions. A finger that moves cancels it.
  const onPressStart = (e: ReactPointerEvent, msg: Message) => {
    if (e.pointerType === 'mouse') return;
    const x = e.clientX;
    const y = e.clientY;
    cancelPress();
    pressStart.current = { x, y };
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      pressStart.current = null;
      navigator.vibrate?.(10);
      openMenuAt(x, y, msg);
    }, 500);
  };

  const onPressMove = (e: ReactPointerEvent) => {
    const start = pressStart.current;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancelPress();
  };

  useEffect(() => cancelPress, []);

  // Group consecutive messages from the same author so the feed reads like Discord.
  const rendered = messages.map((m, i) => {
    const prev = messages[i - 1];
    const continuation =
      !!prev &&
      prev.author_id === m.author_id &&
      !m.reply_to &&
      new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_WINDOW_MS;
    return { m, continuation };
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-vulo-chat">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-vulo-rail px-4 shadow-sm">
        <Icon name="hash" className="h-6 w-6 text-vulo-muted" />
        <h2 className="font-semibold text-vulo-bright">{channel.name}</h2>
        {channel.topic && (
          <>
            <span className="mx-2 h-6 w-px bg-vulo-line" />
            <p className="truncate text-sm text-vulo-muted">{channel.topic}</p>
          </>
        )}
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="scroll-thin min-h-0 flex-1 overflow-y-auto py-4" role="log" aria-live="polite">
        {loading && <p className="px-4 text-sm text-vulo-muted">Loading messages…</p>}

        {!loading && messages.length === 0 && (
          <div className="px-4 pb-6 pt-10">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-vulo-accent text-white">
              <Icon name="hash" className="h-9 w-9" />
            </div>
            <h3 className="text-3xl font-bold text-vulo-bright">Welcome to #{channel.name}</h3>
            <p className="mt-1 text-vulo-muted">This is the start of the channel. Say hello.</p>
          </div>
        )}

        {hasMore && !loading && (
          <div className="px-4 pb-3">
            <button onClick={() => void loadOlder()} className="text-xs text-[#00a8fc] hover:underline">
              Load older messages
            </button>
          </div>
        )}

        {rendered.map(({ m, continuation }) => {
          const author = profiles.get(m.author_id);
          const name = author?.display_name || author?.username || 'Unknown user';
          const isEditing = editing?.id === m.id;
          const canDelete = m.author_id === userId || canModerate;
          const parent = m.reply_to ? messages.find((x) => x.id === m.reply_to) : undefined;
          return (
            <article
              key={m.id}
              className={`group relative flex gap-4 px-4 hover:bg-[#2e3035] ${continuation ? 'py-[1px]' : settings.compact ? 'mt-1 py-[1px]' : 'mt-[17px] py-[2px]'}`}
              onContextMenu={(e) => openMenu(e, m)}
              onPointerDown={(e) => onPressStart(e, m)}
              onPointerMove={onPressMove}
              onPointerUp={cancelPress}
              onPointerCancel={cancelPress}
            >
              <div className="w-10 shrink-0">
                {!continuation ? (
                  <button
                    type="button"
                    onClick={() => author && onOpenProfile?.(author)}
                    disabled={!author}
                    className="mt-0.5 rounded-full hover:opacity-80 focus-visible:ring-2 focus-visible:ring-vulo-accent disabled:cursor-default"
                    aria-label={`View ${name}'s profile`}
                  >
                    <Avatar profile={author ?? null} size="md" />
                  </button>
                ) : (
                  settings.showTimestamps && (
                    <time className="hidden pt-1 text-center text-[11px] text-vulo-muted group-hover:block" dateTime={m.created_at}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </time>
                  )
                )}
              </div>

              <div className="min-w-0 flex-1">
                {m.reply_to && (
                  <p className="mb-0.5 flex min-w-0 items-center gap-1.5 text-xs text-vulo-muted">
                    <Icon name="reply" className="h-3.5 w-3.5 shrink-0" />
                    {parent ? (
                      <span className="truncate">
                        Replying to <span className="font-medium text-vulo-text">{nameOf(parent.author_id)}</span>: {snippetOf(parent)}
                      </span>
                    ) : (
                      <span className="truncate">Replying to a message that is not loaded</span>
                    )}
                  </p>
                )}

                {!continuation && (
                  <header className="flex items-baseline gap-2">
                    <button
                      type="button"
                      onClick={() => author && onOpenProfile?.(author)}
                      disabled={!author}
                      className="font-medium text-vulo-bright hover:underline disabled:cursor-default disabled:no-underline"
                    >
                      {name}
                    </button>
                    <time className="text-xs text-vulo-muted" dateTime={m.created_at}>{formatTime(m.created_at)}</time>
                  </header>
                )}

                {m.forward_of && (
                  <p className="mb-0.5 flex items-center gap-1.5 text-xs text-vulo-muted">
                    <Icon name="forward" className="h-3.5 w-3.5 shrink-0" />
                    Forwarded
                  </p>
                )}

                {isEditing ? (
                  <div className="mt-1">
                    <textarea
                      autoFocus
                      value={editing.text}
                      onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditing(null);
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void saveEdit();
                        }
                      }}
                      className="w-full rounded bg-vulo-input px-3 py-2 text-vulo-text outline-none focus:ring-2 focus:ring-vulo-accent"
                      rows={2}
                    />
                    <p className="text-xs text-vulo-muted">
                      Escape to <button className="text-[#00a8fc] hover:underline" onClick={() => setEditing(null)}>cancel</button> · Enter to save
                    </p>
                  </div>
                ) : (
                  m.content && (
                    <div className="text-[15px] leading-[1.375rem]">
                      <Markdown text={m.content} serverId={channel.server_id} />
                      {m.edited_at && <span className="ml-1 text-[10px] text-vulo-muted">(edited)</span>}
                    </div>
                  )
                )}

                <AttachmentList items={m.attachments} />
                <EmbedList items={m.embeds} />
              </div>

              {!isEditing && (
                <div className="absolute -top-3 right-4 hidden items-center gap-0.5 rounded bg-vulo-chat p-0.5 shadow group-hover:flex">
                  {canSend && (
                    <button
                      onClick={() => setReplyTo(m)}
                      className="rounded p-1 text-vulo-muted hover:text-vulo-text"
                      aria-label="Reply"
                      title="Reply"
                    >
                      <Icon name="reply" className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setForwarding(m)}
                    className="rounded p-1 text-vulo-muted hover:text-vulo-text"
                    aria-label="Forward message"
                    title="Forward"
                  >
                    <Icon name="forward" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      // Stop the click here, so the menu's own close-on-click does not dismiss it straight away.
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      openMenuAt(r.right - 192, r.bottom + 4, m);
                    }}
                    className="rounded p-1 text-vulo-muted hover:text-vulo-text"
                    aria-label="More message actions"
                    aria-haspopup="menu"
                    title="More actions"
                  >
                    <Icon name="more" className="h-4 w-4" />
                  </button>
                  {m.author_id === userId && (
                    <button
                      onClick={() => setEditing({ id: m.id, text: m.content })}
                      className="rounded p-1 text-vulo-muted hover:text-vulo-text"
                      aria-label="Edit message"
                    >
                      <Icon name="pencil" className="h-4 w-4" />
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => void remove(m)} className="rounded p-1 text-vulo-muted hover:text-vulo-red" aria-label="Delete message">
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <Composer
        userId={userId}
        placeholder={`Message #${channel.name}`}
        disabled={!canSend}
        disabledReason="You do not have permission to send messages in this channel."
        onSend={send}
        replyingTo={replyTo ? { name: nameOf(replyTo.author_id), preview: snippetOf(replyTo) } : null}
        onCancelReply={() => setReplyTo(null)}
      />

      {menu && (
        <>
        {device === 'mobile' && (
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setMenu(null)} aria-hidden="true" />
        )}
        <div
          role="menu"
          className={
            device === 'mobile'
              ? 'fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-vulo-rail p-2 pb-6 text-base shadow-2xl'
              : 'fixed z-50 w-48 rounded bg-vulo-rail p-1.5 text-sm shadow-2xl'
          }
          style={device === 'mobile' ? undefined : { left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            role="menuitem"
            className="block w-full rounded px-2 py-1.5 text-left text-vulo-text hover:bg-vulo-accent hover:text-white"
            onClick={() => {
              void navigator.clipboard?.writeText(menu.msg.content);
              setMenu(null);
            }}
          >
            Copy text
          </button>
          {canSend && (
            <button
              role="menuitem"
              className="block w-full rounded px-2 py-1.5 text-left text-vulo-text hover:bg-vulo-accent hover:text-white"
              onClick={() => {
                setReplyTo(menu.msg);
                setMenu(null);
              }}
            >
              Reply
            </button>
          )}
          <button
            role="menuitem"
            className="block w-full rounded px-2 py-1.5 text-left text-vulo-text hover:bg-vulo-accent hover:text-white"
            onClick={() => {
              setForwarding(menu.msg);
              setMenu(null);
            }}
          >
            Forward
          </button>
          {menu.msg.author_id === userId && (
            <button
              role="menuitem"
              className="block w-full rounded px-2 py-1.5 text-left text-vulo-text hover:bg-vulo-accent hover:text-white"
              onClick={() => {
                setEditing({ id: menu.msg.id, text: menu.msg.content });
                setMenu(null);
              }}
            >
              Edit message
            </button>
          )}
          {(menu.msg.author_id === userId || canModerate) && (
            <button
              role="menuitem"
              className="block w-full rounded px-2 py-1.5 text-left text-vulo-red hover:bg-vulo-red hover:text-white"
              onClick={() => {
                void remove(menu.msg);
                setMenu(null);
              }}
            >
              Delete message
            </button>
          )}
        </div>
        </>
      )}

      {forwarding && <ForwardDialog message={forwarding} userId={userId} onClose={() => setForwarding(null)} />}

      {/* Accessibility: name of the current user for screen readers */}
      <span className="sr-only">Signed in as {myDisplayName}</span>
    </div>
  );
}

export function AttachmentList({ items }: { items: Attachment[] }) {
  if (!items?.length) return null;
  return (
    <ul className="mt-1 space-y-2">
      {items.map((a) => (
        <AttachmentItem key={a.path} item={a} />
      ))}
    </ul>
  );
}

function AttachmentItem({ item }: { item: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = item.type.startsWith('image/');

  useEffect(() => {
    let alive = true;
    void attachmentUrl(item.path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [item.path]);

  if (isImage && url) {
    return (
      <li>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt={item.name} className="max-h-80 max-w-md rounded" loading="lazy" />
        </a>
      </li>
    );
  }
  return (
    <li>
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-md items-center gap-2 rounded bg-vulo-side px-3 py-2 text-sm text-[#00a8fc] hover:underline"
        aria-disabled={!url}
      >
        <Icon name="paperclip" className="h-4 w-4 shrink-0" />
        <span className="truncate">{item.name}</span>
        <span className="shrink-0 text-xs text-vulo-muted">{formatBytes(item.size)}</span>
      </a>
    </li>
  );
}

export function EmbedList({ items }: { items: Embed[] }) {
  const { showLinkPreviews } = useSettings();
  if (!showLinkPreviews || !items?.length) return null;
  return (
    <div className="mt-1 space-y-2">
      {items.map((e) =>
        e.type === 'image' ? (
          <a key={e.url} href={e.url} target="_blank" rel="noopener noreferrer nofollow">
            <img src={e.url} alt="" className="max-h-72 max-w-md rounded" loading="lazy" referrerPolicy="no-referrer" />
          </a>
        ) : (
          <a
            key={e.url}
            href={e.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="block max-w-md rounded border-l-4 border-vulo-accent bg-vulo-side px-3 py-2 hover:bg-vulo-hover"
          >
            <p className="text-xs text-vulo-muted">{e.host}</p>
            <p className="truncate text-sm text-[#00a8fc]">{e.url}</p>
          </a>
        ),
      )}
    </div>
  );
}
