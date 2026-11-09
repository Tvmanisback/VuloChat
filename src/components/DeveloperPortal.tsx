import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { DOCS_URL, errorMessage } from '../lib/premadeBots';
import { ErrorText, Field, inputClass } from './ui';

// The developer portal: sign in, then create bots, get their tokens and edit or delete them.
// It shares the VuloChat sign-in, because it runs on the same site.

interface Me {
  id: string;
  username: string;
  developer_mode: boolean;
}

interface BotRow {
  id: string;
  name: string;
  description: string;
  profile_id: string;
  template_id: string | null;
  created_at: string;
}

interface TokenRow {
  bot_id: string;
  token_prefix: string;
  last_used_at: string | null;
}

interface NewToken {
  name: string;
  token: string;
}

type View = { kind: 'bots' } | { kind: 'create' } | { kind: 'edit'; bot: BotRow };

const PRIMARY = 'rounded bg-vulo-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50';
const SECONDARY = 'rounded bg-vulo-rail px-3 py-1.5 text-sm font-semibold text-vulo-bright hover:bg-vulo-hover disabled:opacity-50';
const DANGER = 'rounded bg-vulo-red/90 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50';
const NAV = 'rounded px-3 py-2 text-left text-sm font-semibold text-vulo-muted hover:bg-vulo-hover hover:text-vulo-bright';
const NAV_ACTIVE = 'rounded bg-vulo-hover px-3 py-2 text-left text-sm font-semibold text-vulo-bright';

// Calls the bot API as the signed-in user, and turns any failure into a readable message.
async function callBots(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('vulo-bots', { body });
  if (error) throw new Error(await errorMessage(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

function describeError(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

export default function DeveloperPortal() {
  // undefined while the session is loading, null when signed out.
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-vulo-chat text-vulo-text">
      <header className="flex items-center justify-between gap-4 border-b border-vulo-line bg-vulo-rail px-4 py-3">
        <a href="/developers" className="text-lg font-bold text-vulo-bright">
          VuloChat <span className="text-vulo-accent">Developers</span>
        </a>
        <a href="/" className="text-sm text-vulo-muted hover:text-vulo-bright">
          Open VuloChat
        </a>
      </header>

      {session === undefined ? (
        <p className="p-8 text-vulo-muted">Loading…</p>
      ) : session ? (
        <Dashboard userId={session.user.id} />
      ) : (
        <SignIn />
      )}
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(err.message);
    setBusy(false);
  };

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold text-vulo-bright">Sign in</h1>
      <p className="mb-6 text-sm text-vulo-muted">Use your VuloChat account to create and manage bots.</p>
      <form onSubmit={(e) => void submit(e)} className="rounded-lg bg-vulo-side p-5">
        <Field label="Email">
          <input className={inputClass} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={busy} className={`${PRIMARY} w-full`}>
          Sign in
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-vulo-muted">
        No account yet?{' '}
        <a href="/" className="text-vulo-accent hover:underline">
          Create one in VuloChat
        </a>
      </p>
    </main>
  );
}

function Dashboard({ userId }: { userId: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [bots, setBots] = useState<BotRow[]>([]);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [view, setView] = useState<View>({ kind: 'bots' });
  const [newToken, setNewToken] = useState<NewToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const [p, b, t] = await Promise.all([
      supabase.from('profiles').select('id,username,developer_mode').eq('id', userId).maybeSingle(),
      supabase.from('bots').select('id,name,description,profile_id,template_id,created_at').eq('owner_id', userId).order('created_at'),
      // Only your own bots' tokens are visible to you (row-level security). Hashes are never returned.
      supabase.from('bot_tokens').select('bot_id,token_prefix,last_used_at').is('revoked_at', null),
    ]);
    const failed = p.error || b.error || t.error;
    if (failed) setError(failed.message);
    setMe((p.data as Me | null) ?? null);
    setBots((b.data as BotRow[] | null) ?? []);
    setTokens((t.data as TokenRow[] | null) ?? []);
    setLoaded(true);
  };

  useEffect(() => {
    void load();
  }, [userId]);

  const regenerate = async (bot: BotRow) => {
    if (!window.confirm(`Create a new token for ${bot.name}? The current token stops working right away.`)) return;
    setError(null);
    try {
      const result = await callBots({ action: 'regenerate_token', bot_id: bot.id });
      setNewToken({ name: bot.name, token: result.token });
      await load();
    } catch (e) {
      setError(describeError(e, 'Could not create a new token.'));
    }
  };

  const remove = async (bot: BotRow) => {
    if (!window.confirm(`Delete ${bot.name}? It is removed from every server, and its messages are deleted. This cannot be undone.`)) return;
    setError(null);
    try {
      await callBots({ action: 'delete_bot', bot_id: bot.id });
      setView({ kind: 'bots' });
      await load();
    } catch (e) {
      setError(describeError(e, 'Could not delete the bot.'));
    }
  };

  const tokenFor = (botId: string) => tokens.find((t) => t.bot_id === botId);
  const activeView = view.kind === 'edit' ? 'bots' : view.kind;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row">
      <nav aria-label="Developer portal" className="flex shrink-0 gap-1 overflow-x-auto md:w-56 md:flex-col">
        <button type="button" className={activeView === 'bots' ? NAV_ACTIVE : NAV} onClick={() => setView({ kind: 'bots' })}>
          My bots
        </button>
        <button type="button" className={activeView === 'create' ? NAV_ACTIVE : NAV} onClick={() => setView({ kind: 'create' })}>
          Create bot
        </button>
        <a href={DOCS_URL} className={NAV}>
          Docs
        </a>
        <a href="/" className={NAV}>
          Back to VuloChat
        </a>
        <button type="button" className={NAV} onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </nav>

      <main className="min-w-0 flex-1">
        <ErrorText>{error}</ErrorText>

        {loaded && me && !me.developer_mode && <DeveloperModeCard userId={userId} onEnabled={load} />}

        {newToken && (
          <TokenBox name={newToken.name} token={newToken.token} onDone={() => setNewToken(null)} />
        )}

        {!loaded ? (
          <p className="text-vulo-muted">Loading your bots…</p>
        ) : view.kind === 'create' ? (
          <CreateBot
            onCreated={(name, token) => {
              setNewToken({ name, token });
              setView({ kind: 'bots' });
              void load();
            }}
          />
        ) : view.kind === 'edit' ? (
          <EditBot
            bot={view.bot}
            userId={userId}
            onBack={() => setView({ kind: 'bots' })}
            onSaved={() => void load()}
            onRegenerate={() => void regenerate(view.bot)}
            onDelete={() => void remove(view.bot)}
            token={tokenFor(view.bot.id)}
          />
        ) : (
          <BotList
            bots={bots}
            tokenFor={tokenFor}
            onEdit={(bot) => setView({ kind: 'edit', bot })}
            onCreate={() => setView({ kind: 'create' })}
            onRegenerate={(bot) => void regenerate(bot)}
          />
        )}
      </main>
    </div>
  );
}

function DeveloperModeCard({ userId, onEnabled }: { userId: string; onEnabled: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enable = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from('profiles').update({ developer_mode: true }).eq('id', userId);
    if (err) setError(err.message);
    else await onEnabled();
    setBusy(false);
  };

  return (
    <section className="mb-6 rounded-lg bg-vulo-side p-5">
      <p className="font-semibold text-vulo-bright">Turn on developer mode to create bots</p>
      <p className="mb-4 mt-1 text-sm text-vulo-muted">
        Developer mode lets you create bots and get their tokens. You can turn it off again in Settings → Developer.
      </p>
      <ErrorText>{error}</ErrorText>
      <button type="button" disabled={busy} onClick={() => void enable()} className={PRIMARY}>
        Enable developer mode
      </button>
    </section>
  );
}

function BotList({
  bots,
  tokenFor,
  onEdit,
  onCreate,
  onRegenerate,
}: {
  bots: BotRow[];
  tokenFor: (botId: string) => TokenRow | undefined;
  onEdit: (bot: BotRow) => void;
  onCreate: () => void;
  onRegenerate: (bot: BotRow) => void;
}) {
  if (bots.length === 0) {
    return (
      <section className="rounded-lg bg-vulo-side p-8 text-center">
        <p className="text-lg font-semibold text-vulo-bright">You have no bots yet</p>
        <p className="mb-5 mt-1 text-sm text-vulo-muted">Create a bot to get a token, then run your program with it.</p>
        <button type="button" onClick={onCreate} className={PRIMARY}>
          Create bot
        </button>
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold text-vulo-bright">My bots</h1>
      <ul className="space-y-3">
        {bots.map((bot) => {
          const token = tokenFor(bot.id);
          return (
            <li key={bot.id} className="flex flex-col gap-3 rounded-lg bg-vulo-side p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-vulo-bright">
                  {bot.name}
                  {bot.template_id && <span className="ml-2 rounded bg-vulo-rail px-2 py-0.5 text-xs font-normal text-vulo-muted">Premade</span>}
                </p>
                <p className="truncate text-sm text-vulo-muted">{bot.description || 'No description'}</p>
                <p className="mt-1 text-xs text-vulo-muted">
                  {token
                    ? `Token ${token.token_prefix}… · ${token.last_used_at ? `last used ${new Date(token.last_used_at).toLocaleString()}` : 'never used'}`
                    : 'No active token. Use New token to create one.'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" className={SECONDARY} onClick={() => onEdit(bot)}>
                  Edit
                </button>
                <button type="button" className={SECONDARY} onClick={() => onRegenerate(bot)}>
                  New token
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CreateBot({ onCreated }: { onCreated: (name: string, token: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await callBots({ action: 'create', name: name.trim(), description: description.trim() });
      onCreated(result.bot.name, result.token);
    } catch (err) {
      setError(describeError(err, 'Could not create the bot.'));
    }
    setBusy(false);
  };

  return (
    <section className="rounded-lg bg-vulo-side p-5">
      <h1 className="mb-1 text-2xl font-bold text-vulo-bright">Create a bot</h1>
      <p className="mb-5 text-sm text-vulo-muted">You get a token once the bot is created. Add the bot to a server from Server Settings → Bots.</p>
      <form onSubmit={(e) => void create(e)}>
        <Field label="Bot name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </Field>
        <Field label="Description">
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={busy || name.trim().length < 2} className={PRIMARY}>
          Create bot and token
        </button>
      </form>
    </section>
  );
}

function EditBot({
  bot,
  userId,
  onBack,
  onSaved,
  onRegenerate,
  onDelete,
  token,
}: {
  bot: BotRow;
  userId: string;
  onBack: () => void;
  onSaved: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
  token: TokenRow | undefined;
}) {
  const [form, setForm] = useState({ name: bot.name, about: bot.description || '', avatar_url: '', banner_url: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('display_name,about,avatar_url,banner_url')
        .eq('id', bot.profile_id)
        .maybeSingle();
      if (cancelled) return;
      if (err) setError(err.message);
      const profile = data as { display_name: string | null; about: string | null; avatar_url: string | null; banner_url: string | null } | null;
      setForm({
        name: profile?.display_name || bot.name,
        about: profile?.about ?? bot.description ?? '',
        avatar_url: profile?.avatar_url ?? '',
        banner_url: profile?.banner_url ?? '',
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [bot.id]);

  const upload = async (kind: 'avatar' | 'banner', file: File) => {
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('Use PNG, JPEG, GIF, or WebP images.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Images must be 10 MB or smaller.');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${userId}/${bot.id}/${kind}-${Date.now()}.${ext}`;
    setBusy(true);
    setError(null);
    const { error: uploadErr } = await supabase.storage.from('bot-assets').upload(path, file, { contentType: file.type, upsert: true });
    if (uploadErr) {
      setError(uploadErr.message);
      setBusy(false);
      return;
    }
    const { data: publicFile } = supabase.storage.from('bot-assets').getPublicUrl(path);
    setForm((f) => ({ ...f, [kind === 'avatar' ? 'avatar_url' : 'banner_url']: publicFile.publicUrl }));
    setBusy(false);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await callBots({ action: 'edit_profile', bot_id: bot.id, display_name: form.name.trim(), about: form.about, avatar_url: form.avatar_url, banner_url: form.banner_url });
      // The bot's name and description in the list follow its profile.
      const { error: botErr } = await supabase.from('bots').update({ name: form.name.trim() || bot.name, description: form.about }).eq('id', bot.id);
      if (botErr) throw new Error(botErr.message);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(describeError(err, 'Could not save the bot.'));
    }
    setBusy(false);
  };

  return (
    <section>
      <button type="button" onClick={onBack} className="mb-4 text-sm text-vulo-muted hover:text-vulo-bright">
        ← Back to my bots
      </button>
      <h1 className="mb-1 text-2xl font-bold text-vulo-bright">Edit {bot.name}</h1>
      <p className="mb-5 text-sm text-vulo-muted">
        {token ? `Token ${token.token_prefix}… · ` : 'No active token · '}
        Bot ID <code className="text-xs">{bot.id}</code>
      </p>

      {loading ? (
        <p className="text-vulo-muted">Loading…</p>
      ) : (
        <form onSubmit={(e) => void save(e)} className="rounded-lg bg-vulo-side p-5">
          <Field label="Name">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} required />
          </Field>
          <Field label="About">
            <textarea className={`${inputClass} min-h-24`} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} maxLength={500} />
          </Field>
          <Field label="Profile picture">
            <input
              className={inputClass}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload('avatar', file);
                e.target.value = '';
              }}
            />
            {form.avatar_url && <img src={form.avatar_url} alt="" className="mt-2 h-16 w-16 rounded-full object-cover" />}
          </Field>
          <Field label="Profile banner">
            <input
              className={inputClass}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload('banner', file);
                e.target.value = '';
              }}
            />
            {form.banner_url && <img src={form.banner_url} alt="" className="mt-2 h-16 w-full rounded object-cover" />}
          </Field>
          <p className="mb-3 text-xs text-vulo-muted">PNG, JPEG, GIF, or WebP · Maximum 10 MB per image.</p>
          <ErrorText>{error}</ErrorText>
          {saved && <p className="mb-3 text-sm text-vulo-green">Saved.</p>}
          <button type="submit" disabled={busy} className={PRIMARY}>
            Save changes
          </button>
        </form>
      )}

      <div className="mt-8 rounded-lg border border-vulo-red/40 p-5">
        <p className="font-semibold text-vulo-bright">Token and danger zone</p>
        <p className="mb-4 mt-1 text-sm text-vulo-muted">
          A new token replaces the current one. The current token stops working right away. Deleting a bot removes it from every server and deletes its messages.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRegenerate} className={SECONDARY}>
            New token
          </button>
          <button type="button" onClick={onDelete} className={DANGER}>
            Delete bot
          </button>
        </div>
      </div>
    </section>
  );
}

function TokenBox({ name, token, onDone }: { name: string; token: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="mb-6 rounded-lg border border-vulo-green/40 bg-vulo-green/10 p-5">
      <p className="font-semibold text-vulo-bright">Token for {name}. Copy it now, it is only shown once.</p>
      <code className="mt-2 block break-all select-all text-sm">{token}</code>
      <p className="mt-2 text-xs text-vulo-muted">Keep it private. Run your bot with it as VULO_TOKEN. See Docs for the scripts and the API.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} className={SECONDARY}>
          {copied ? 'Copied' : 'Copy token'}
        </button>
        <button type="button" onClick={onDone} className={SECONDARY}>
          I've copied it
        </button>
      </div>
    </section>
  );
}

