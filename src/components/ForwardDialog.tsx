import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Message } from '../lib/types';
import { Icon } from './icons';

interface Target {
  id: string;
  name: string;
  server_name: string;
}

/** Forwards a copy of a message to a text channel the user can post in. */
export default function ForwardDialog({
  message,
  userId,
  onClose,
}: {
  message: Message;
  userId: string;
  onClose: () => void;
}) {
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Channels from every server the user belongs to. The database only returns the ones they can see.
  useEffect(() => {
    let alive = true;
    supabase
      .from('channels')
      .select('id,name,servers(name)')
      .eq('type', 'text')
      .order('name')
      .then(({ data, error: err }) => {
        if (!alive) return;
        if (err) {
          setError(err.message);
          setTargets([]);
          return;
        }
        type Row = { id: string; name: string; servers: { name: string } | null };
        setTargets(
          ((data ?? []) as unknown as Row[]).map((r) => ({
            id: r.id,
            name: r.name,
            server_name: r.servers?.name ?? '',
          })),
        );
      });
    return () => {
      alive = false;
    };
  }, []);

  const forward = async (target: Target) => {
    setSending(target.id);
    setError(null);
    const { error: err } = await supabase.from('messages').insert({
      channel_id: target.id,
      author_id: userId,
      content: message.content,
      attachments: message.attachments,
      embeds: message.embeds,
      // Point at the first original, so a forward of a forward still traces back to the source.
      forward_of: message.forward_of ?? message.id,
    });
    setSending(null);
    if (err) {
      setError(err.message);
      return;
    }
    setSentTo(target.name);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div role="dialog" aria-modal="true" aria-label="Forward message" className="w-full max-w-md rounded-lg bg-vulo-chat p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-vulo-bright">Forward message</h2>
          <button onClick={onClose} className="text-vulo-muted hover:text-vulo-text" aria-label="Close">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 max-h-24 overflow-hidden rounded bg-vulo-side px-3 py-2 text-sm text-vulo-muted">
          {message.content.trim() ? message.content : 'An attachment'}
        </div>

        {error && <p className="mb-3 rounded bg-vulo-red/10 px-3 py-1.5 text-sm text-vulo-red">{error}</p>}
        {sentTo && (
          <p className="mb-3 rounded bg-vulo-green/10 px-3 py-1.5 text-sm text-vulo-green">Forwarded to #{sentTo}.</p>
        )}

        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-vulo-muted">Send to</p>
        <div className="scroll-thin max-h-72 overflow-y-auto rounded bg-vulo-side">
          {targets === null && <p className="px-3 py-3 text-sm text-vulo-muted">Loading channels…</p>}
          {targets !== null && targets.length === 0 && !error && (
            <p className="px-3 py-3 text-sm text-vulo-muted">No text channels to forward to yet.</p>
          )}
          <ul className="divide-y divide-vulo-line">
            {(targets ?? []).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => void forward(t)}
                  disabled={sending !== null}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-vulo-hover disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-vulo-bright">#{t.name}</span>
                    <span className="block truncate text-xs text-vulo-muted">{t.server_name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-vulo-muted">{sending === t.id ? 'Sending…' : 'Forward'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
