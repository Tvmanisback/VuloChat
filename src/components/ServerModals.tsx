import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { Invite } from '../lib/types';
import { Button, ErrorText, Field, Modal, inputClass } from './ui';
import { Icon } from './icons';

export function CreateServerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('create_server', { p_name: name.trim() });
    setBusy(false);
    if (err) return setError(err.message);
    onCreated(data as string);
  };

  return (
    <Modal title="Create your server" onClose={onClose}>
      <p className="mb-5 text-sm text-vulo-muted">Your server is where you and your friends hang out. Give it a name to get started.</p>
      <form onSubmit={submit} id="create-server-form">
        <ErrorText>{error}</ErrorText>
        <Field label="Server name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus required />
        </Field>
      </form>
      <div className="-mx-5 -mb-4 mt-2 flex justify-between bg-vulo-side px-5 py-3">
        <Button variant="ghost" onClick={onClose}>Back</Button>
        <Button type="submit" form="create-server-form" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </Modal>
  );
}

export function JoinServerModal({ onClose, onJoined }: { onClose: () => void; onJoined: (id: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = code.trim().split('/').pop() ?? '';
    if (!clean) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('join_invite', { p_code: clean });
    setBusy(false);
    if (err) return setError(err.message);
    onJoined(data as string);
  };

  return (
    <Modal title="Join a server" onClose={onClose}>
      <p className="mb-5 text-sm text-vulo-muted">Enter an invite code or paste an invite link.</p>
      <form onSubmit={submit} id="join-server-form">
        <ErrorText>{error}</ErrorText>
        <Field label="Invite code">
          <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="abc123xyz0" autoFocus required />
        </Field>
      </form>
      <div className="-mx-5 -mb-4 mt-2 flex justify-between bg-vulo-side px-5 py-3">
        <Button variant="ghost" onClick={onClose}>Back</Button>
        <Button type="submit" form="join-server-form" disabled={busy || !code.trim()}>
          {busy ? 'Joining…' : 'Join server'}
        </Button>
      </div>
    </Modal>
  );
}

export function CreateChannelModal({
  serverId,
  parentId,
  categories,
  onClose,
  onCreated,
}: {
  serverId: string;
  parentId: string | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<'category' | 'text' | 'voice'>('text');
  const [name, setName] = useState('');
  const [parent, setParent] = useState<string | null>(parentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = type === 'text' ? name.trim().toLowerCase().replace(/\s+/g, '-') : name.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    const { data: last } = await supabase
      .from('channels')
      .select('position')
      .eq('server_id', serverId)
      .order('position', { ascending: false })
      .limit(1);
    const position = ((last?.[0]?.position as number | undefined) ?? 0) + 1;
    const { error: err } = await supabase.from('channels').insert({
      server_id: serverId,
      parent_id: type === 'category' ? null : parent,
      type,
      name: clean,
      position,
    });
    setBusy(false);
    if (err) return setError(err.message);
    onCreated();
  };

  return (
    <Modal title="Create channel" onClose={onClose}>
      <form onSubmit={submit} id="create-channel-form">
        <ErrorText>{error}</ErrorText>
        <Field label="Channel type">
          <div className="grid grid-cols-2 gap-2">
            {(['text', 'voice', 'category'] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setType(t)}
                className={`flex items-center gap-3 rounded border p-3 text-left ${type === t ? 'border-vulo-accent bg-vulo-accent/10' : 'border-vulo-line bg-vulo-rail hover:bg-vulo-hover'}`}
              >
                <Icon name={t === 'voice' ? 'speaker' : 'hash'} className="h-5 w-5 text-vulo-muted" />
                <span>
                  <span className="block font-semibold text-vulo-bright">{t === 'text' ? 'Text' : t === 'voice' ? 'Voice' : 'Category'}</span>
                  <span className="text-xs text-vulo-muted">{t === 'text' ? 'Send messages and files' : t === 'voice' ? 'Talk with voice and video' : 'Group channels together'}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Channel name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus required placeholder={type === 'text' ? 'new-channel' : type === 'voice' ? 'Lounge' : 'General'} />
        </Field>
        {type !== 'category' && <Field label="Category">
          <select className={inputClass} value={parent ?? ''} onChange={(e) => setParent(e.target.value || null)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>}
      </form>
      <div className="-mx-5 -mb-4 mt-2 flex justify-between bg-vulo-side px-5 py-3">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="create-channel-form" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : type === 'category' ? 'Create category' : 'Create channel'}
        </Button>
      </div>
    </Modal>
  );
}

export function InviteModal({ serverId, userId, serverName, onClose }: { serverId: string; userId: string; serverName: string; onClose: () => void }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error: err } = await supabase
      .from('invites')
      .insert({ server_id: serverId, created_by: userId, expires_at: expires })
      .select()
      .single();
    setBusy(false);
    if (err) return setError(err.message);
    setInvite(data as Invite);
  };

  const copy = async () => {
    if (!invite) return;
    await navigator.clipboard?.writeText(invite.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal title={`Invite people to ${serverName}`} onClose={onClose}>
      <ErrorText>{error}</ErrorText>
      {!invite ? (
        <p className="mb-4 text-sm text-vulo-muted">Create an invite code. It stays valid for 7 days and anyone with it can join.</p>
      ) : (
        <div className="mb-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-vulo-muted">Invite code</p>
          <div className="flex items-center gap-2 rounded bg-vulo-rail p-3">
            <code className="flex-1 select-all font-mono text-lg text-vulo-bright">{invite.code}</code>
            <Button variant="secondary" onClick={() => void copy()} className="py-1.5">{copied ? 'Copied' : 'Copy'}</Button>
          </div>
          <p className="mt-2 text-xs text-vulo-muted">Expires in 7 days.</p>
        </div>
      )}
      <div className="-mx-5 -mb-4 mt-2 flex justify-end bg-vulo-side px-5 py-3">
        {!invite && <Button onClick={() => void create()} disabled={busy}>{busy ? 'Creating…' : 'Create invite code'}</Button>}
      </div>
    </Modal>
  );
}
