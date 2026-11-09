import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { PORTAL_URL } from '../lib/premadeBots';
import { Button, ErrorText, Field, inputClass } from './ui';

interface OwnBot {
  id: string;
  name: string;
  description: string;
  profile_id: string;
  template_id: string | null;
}

async function invokeBots(body: Record<string, unknown>) {
  const { data: result, error: err } = await supabase.functions.invoke('vulo-bots', { body });
  if (err || result?.error) throw new Error(err?.message || result.error);
  return result;
}

// Shows a token once, with a copy button. Tokens are never shown again after this.
function TokenBox({ token, onDone }: { token: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mb-5 rounded border border-vulo-green/40 bg-vulo-green/10 p-4">
      <p className="mb-2 font-semibold text-vulo-bright">Copy this token now. It is only shown once.</p>
      <code className="block break-all select-all text-sm">{token}</code>
      <p className="mt-2 text-xs text-vulo-muted">Keep it private. Regenerate it if it is exposed.</p>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="py-1.5" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy token'}
        </Button>
        <Button variant="secondary" className="py-1.5" onClick={onDone}>
          I've copied it
        </Button>
      </div>
    </div>
  );
}

export default function DeveloperSettings() {
  const { profile, updateProfile } = useAuth();
  const enabled = profile?.developer_mode === true;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ developer_mode: !enabled });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change developer mode.');
    }
    setBusy(false);
  };

  return (
    <>
      <h2 className="mb-2 text-2xl font-bold text-vulo-bright">Developer</h2>
      <p className="mb-5 text-sm text-vulo-muted">Build bots that run on your computer. VuloChat never hosts or runs bot code.</p>

      <div className="mb-4 flex items-center justify-between gap-4 rounded bg-vulo-side p-4">
        <div>
          <p className="font-semibold text-vulo-bright">Enable developer mode</p>
          <p className="text-sm text-vulo-muted">
            {enabled ? 'On. You can create bots and manage their tokens below.' : 'Off. Turn this on to create your own bots.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Enable developer mode"
          disabled={busy || !profile}
          onClick={() => void toggle()}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-vulo-green' : 'bg-vulo-line'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      <ErrorText>{error}</ErrorText>

      <div className="mb-6 flex items-center justify-between gap-4 rounded bg-vulo-side p-4">
        <div>
          <p className="font-semibold text-vulo-bright">Portal</p>
          <p className="text-sm text-vulo-muted">SDK downloads, premade bot scripts and the full API reference.</p>
        </div>
        <a
          href={PORTAL_URL}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded bg-vulo-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Open Portal
        </a>
      </div>

      {enabled && (
        <>
          <CreateBot />
          <YourBots />
        </>
      )}
    </>
  );
}

function CreateBot() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<{ name: string; token: string } | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    setToken(null);
    try {
      const result = await invokeBots({ action: 'create', name, description });
      setToken({ name: result.bot.name, token: result.token });
      setName('');
      setDescription('');
      window.dispatchEvent(new Event('vulo-bots-changed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the bot.');
    }
    setBusy(false);
  };

  return (
    <section className="mb-6 rounded bg-vulo-side p-4">
      <h3 className="mb-3 font-semibold text-vulo-bright">Create a bot</h3>
      {token && <TokenBox token={token.token} onDone={() => setToken(null)} />}
      <Field label="Bot name">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Description">
        <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button onClick={() => void create()} disabled={busy || name.trim().length < 2}>
        Create bot and token
      </Button>
      <p className="mt-3 text-xs text-vulo-muted">After you create a bot, add it to a server from Server Settings → Bots.</p>
    </section>
  );
}

function YourBots() {
  const { profile } = useAuth();
  const [bots, setBots] = useState<OwnBot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<{ name: string; token: string } | null>(null);
  const [editing, setEditing] = useState<OwnBot | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!profile) return;
    const { data, error: err } = await supabase
      .from('bots')
      .select('id,name,description,profile_id,template_id')
      .eq('owner_id', profile.id)
      .order('created_at');
    if (err) setError(err.message);
    else setBots((data as OwnBot[]) || []);
  };

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener('vulo-bots-changed', refresh);
    return () => window.removeEventListener('vulo-bots-changed', refresh);
  }, [profile?.id]);

  const regenerate = async (bot: OwnBot) => {
    if (!window.confirm(`Regenerate the token for ${bot.name}? The current token stops working right away.`)) return;
    setBusy(true);
    setError(null);
    setToken(null);
    try {
      const result = await invokeBots({ action: 'regenerate_token', bot_id: bot.id });
      setToken({ name: bot.name, token: result.token });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not regenerate the token.');
    }
    setBusy(false);
  };

  return (
    <section className="rounded bg-vulo-side p-4">
      <h3 className="mb-3 font-semibold text-vulo-bright">Your bots</h3>
      <ErrorText>{error}</ErrorText>
      {token && <TokenBox token={token.token} onDone={() => setToken(null)} />}

      {bots.length === 0 ? (
        <p className="text-sm text-vulo-muted">You have no bots yet.</p>
      ) : (
        <ul className="divide-y divide-vulo-line">
          {bots.map((bot) => (
            <li key={bot.id} className="py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-vulo-bright">
                    {bot.name}
                    {bot.template_id && <span className="ml-2 text-xs font-normal text-vulo-muted">Premade: {bot.template_id}</span>}
                  </p>
                  <p className="truncate text-xs text-vulo-muted">{bot.description}</p>
                </div>
                <Button variant="secondary" className="py-1.5" onClick={() => setEditing(editing?.id === bot.id ? null : bot)}>
                  {editing?.id === bot.id ? 'Close' : 'Edit profile'}
                </Button>
                <Button variant="secondary" className="py-1.5" disabled={busy} onClick={() => void regenerate(bot)}>
                  New token
                </Button>
              </div>
              {editing?.id === bot.id && <BotProfileForm bot={bot} onSaved={() => { setEditing(null); void load(); }} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BotProfileForm({ bot, onSaved }: { bot: OwnBot; onSaved: () => void }) {
  const { profile: me } = useAuth();
  const [form, setForm] = useState({ display_name: '', avatar_url: '', banner_url: '', about: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name,avatar_url,banner_url,about')
        .eq('id', bot.profile_id)
        .maybeSingle();
      setForm({
        display_name: data?.display_name || bot.name || '',
        avatar_url: data?.avatar_url || '',
        banner_url: data?.banner_url || '',
        about: data?.about || bot.description || '',
      });
    })();
  }, [bot.id]);

  const uploadImage = async (kind: 'avatar' | 'banner', file: File) => {
    if (!me) return;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('Use PNG, JPEG, GIF, or WebP images.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Bot profile images must be 10 MB or smaller.');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${me.id}/${bot.id}/${kind}-${Date.now()}.${ext}`;
    setBusy(true);
    setError(null);
    const { error: uploadError } = await supabase.storage.from('bot-assets').upload(path, file, { contentType: file.type, upsert: true });
    if (uploadError) {
      setError(uploadError.message);
      setBusy(false);
      return;
    }
    const { data: publicFile } = supabase.storage.from('bot-assets').getPublicUrl(path);
    setForm((old) => ({ ...old, [kind === 'avatar' ? 'avatar_url' : 'banner_url']: publicFile.publicUrl }));
    setBusy(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await invokeBots({ action: 'edit_profile', bot_id: bot.id, ...form });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the bot profile.');
    }
    setBusy(false);
  };

  return (
    <div className="mt-3 rounded bg-vulo-chat p-4">
      <ErrorText>{error}</ErrorText>
      <Field label="Display name">
        <input className={inputClass} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
      </Field>
      <Field label="Profile picture">
        <input
          className={inputClass}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadImage('avatar', file);
            e.target.value = '';
          }}
        />
      </Field>
      <Field label="Profile banner">
        <input
          className={inputClass}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadImage('banner', file);
            e.target.value = '';
          }}
        />
      </Field>
      <Field label="About">
        <input className={inputClass} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} maxLength={500} />
      </Field>
      <p className="mb-3 text-xs text-vulo-muted">PNG, JPEG, GIF, or WebP · Maximum 10 MB per image.</p>
      <Button onClick={() => void save()} disabled={busy}>
        Save profile
      </Button>
    </div>
  );
}
