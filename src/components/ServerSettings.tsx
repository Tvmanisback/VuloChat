import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { PERM, PERM_LABELS, hasPerm } from '../lib/permissions';
import { loadEmojis, useEmojis, type CustomEmoji } from '../lib/emojis';
import { loadStickers, useStickers, type CustomSticker } from '../lib/stickers';
import { useDecorations } from '../lib/decorations';
import type { Role } from '../lib/types';
import type { ServerData } from '../lib/useServer';
import { Button, ErrorText, Field, inputClass } from './ui';
import { PORTAL_URL, PREMADE_BOTS, SCRIPTS_URL, errorMessage } from '../lib/premadeBots';

type Tab = 'overview' | 'roles' | 'emojis' | 'stickers' | 'members' | 'bots';

interface Props {
  data: ServerData;
  userId: string;
  onClose: () => void;
  onLeftOrDeleted: () => void;
}

export default function ServerSettings({ data, userId, onClose, onLeftOrDeleted }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const canManageServer = hasPerm(data.perms, PERM.MANAGE_SERVER);
  const canRoles = hasPerm(data.perms, PERM.MANAGE_ROLES);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!data.server) return null;

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'overview', label: 'Overview', show: canManageServer },
    { id: 'roles', label: 'Roles', show: canRoles },
    { id: 'emojis', label: 'Emojis', show: canManageServer },
    { id: 'stickers', label: 'Stickers', show: canManageServer },
    { id: 'members', label: 'Members', show: true },
    { id: 'bots', label: 'Bots', show: canManageServer },
  ];
  const visible = tabs.filter((t) => t.show);
  const current = visible.find((t) => t.id === tab) ? tab : visible[0]?.id ?? 'members';

  return (
    <div className="fixed inset-0 z-50 flex bg-vulo-chat" role="dialog" aria-modal="true" aria-label="Server settings">
      <nav className="scroll-thin flex w-64 shrink-0 justify-end overflow-y-auto bg-vulo-side px-4 py-16">
        <div className="w-44 space-y-0.5">
          <p className="mb-2 truncate px-2 text-xs font-bold uppercase tracking-wide text-vulo-muted">{data.server.name}</p>
          {visible.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`block w-full rounded px-2 py-1.5 text-left text-[15px] ${current === t.id ? 'bg-vulo-active text-vulo-bright' : 'text-vulo-muted hover:bg-vulo-hover hover:text-vulo-text'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="scroll-thin flex-1 overflow-y-auto px-10 py-16">
        <div className="mx-auto max-w-3xl">
          {current === 'overview' && <OverviewTab data={data} onDeleted={onLeftOrDeleted} />}
          {current === 'roles' && <RolesTab data={data} />}
          {current === 'emojis' && <EmojisTab serverId={data.server.id} userId={userId} />}
          {current === 'stickers' && <StickersTab serverId={data.server.id} userId={userId} />}
          {current === 'members' && <MembersTab data={data} userId={userId} />}
          {current === 'bots' && <BotsTab data={data} userId={userId} />}
        </div>
      </div>

      <button onClick={onClose} className="fixed right-6 top-12 flex flex-col items-center text-vulo-muted hover:text-vulo-text" aria-label="Close server settings">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-current">✕</span>
        <span className="mt-1 text-xs">ESC</span>
      </button>
    </div>
  );
}


type InstalledRow = {
  bot_id: string;
  enabled: boolean;
  settings: Record<string, any> | null;
  permissions: Record<string, any> | null;
  bots: { id: string; name: string; description: string; profile_id: string; template_id: string | null } | null;
};

function BotsTab({ data, userId }: { data: ServerData; userId: string }) {
  const serverId = data.server!.id;
  const [templates, setTemplates] = useState<any[]>([]);
  const [installed, setInstalled] = useState<InstalledRow[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);

  const load = async () => {
    const [t, a, m] = await Promise.all([
      supabase.from('bot_templates').select('*').eq('enabled', true).order('name'),
      supabase
        .from('server_bots')
        .select('bot_id,enabled,settings,permissions,bots(id,name,description,profile_id,template_id)')
        .eq('server_id', serverId),
      supabase.from('bots').select('id,name,description,profile_id,template_id').eq('owner_id', userId).order('created_at'),
    ]);
    const failed = t.error || a.error || m.error;
    if (failed) {
      setError(failed.message);
      return;
    }
    setTemplates(t.data || []);
    setInstalled((a.data as any) || []);
    setMine(m.data || []);
  };
  useEffect(() => {
    void load();
  }, [userId, serverId]);

  const invoke = async (body: any) => {
    const { data: result, error: err } = await supabase.functions.invoke('vulo-bots', { body });
    if (err) throw new Error(await errorMessage(err));
    if (result?.error) throw new Error(result.error);
    return result;
  };

  // Adds a premade bot: creates it for your account, installs it here, and shows its token once.
  // The token is what the bot script needs to run on your computer.
  const addPremade = async (template: any) => {
    setBusy(true);
    setError(null);
    setNewToken(null);
    try {
      const created = await invoke({ action: 'create_from_template', template_id: template.id });
      await invoke({ action: 'install', bot_id: created.bot.id, server_id: serverId });
      setNewToken({ name: template.name, token: created.token });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the bot.');
    }
    setBusy(false);
  };

  const addOwnBot = async (botId: string) => {
    setBusy(true);
    setError(null);
    try {
      await invoke({ action: 'install', bot_id: botId, server_id: serverId });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the bot.');
    }
    setBusy(false);
  };

  const installedIds = new Set(installed.map((row) => row.bot_id));
  const installedTemplateIds = new Set(installed.map((row) => row.bots?.template_id).filter(Boolean));
  const otherBots = mine.filter((bot) => !installedIds.has(bot.id));

  return (
    <Section title="Bots">
      <p className="mb-4 text-sm text-vulo-muted">
        Bots run on their owner's computer. VuloChat provides the API and server membership, but never hosts the bot process.
      </p>
      <ErrorText>{error}</ErrorText>

      {newToken && (
        <div className="mb-5 rounded border border-vulo-green/40 bg-vulo-green/10 p-4">
          <p className="mb-2 font-semibold text-vulo-bright">Copy the token for {newToken.name} now. It is only shown once.</p>
          <code className="block break-all select-all text-sm">{newToken.token}</code>
          <p className="mt-2 text-xs text-vulo-muted">Keep it private. Lost tokens can be replaced from Settings → Developer.</p>
          <Button variant="secondary" className="mt-3 py-1.5" onClick={() => setNewToken(null)}>
            I've copied it
          </Button>
        </div>
      )}

      <div className="mb-6 rounded bg-vulo-side p-4">
        <h3 className="mb-3 font-semibold text-vulo-bright">Premade bots</h3>
        {templates.length === 0 ? (
          <p className="text-sm text-vulo-muted">No premade bots are available yet.</p>
        ) : (
          templates.map((t) => (
            <div key={t.id} className="flex items-center gap-3 border-b border-vulo-line py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-vulo-bright">{t.name}</p>
                <p className="text-xs text-vulo-muted">{t.description}</p>
              </div>
              {installedTemplateIds.has(t.id) ? (
                <span className="text-xs text-vulo-muted">Added</span>
              ) : (
                <Button className="py-1.5" disabled={busy} onClick={() => void addPremade(t)}>
                  Add to server
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      <h3 className="mb-3 font-semibold text-vulo-bright">In this server</h3>
      {installed.length === 0 ? (
        <p className="mb-6 text-sm text-vulo-muted">No bots are in this server yet.</p>
      ) : (
        <div className="mb-6 space-y-3">
          {installed.map((row) =>
            row.bots ? <InstalledBot key={row.bot_id} row={row} serverId={serverId} onChanged={load} onError={setError} /> : null,
          )}
        </div>
      )}

      {otherBots.length > 0 && (
        <>
          <h3 className="mb-3 font-semibold text-vulo-bright">Your other bots</h3>
          <ul className="mb-6 divide-y divide-vulo-line rounded bg-vulo-side">
            {otherBots.map((bot) => (
              <li key={bot.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-vulo-bright">{bot.name}</p>
                  <p className="truncate text-xs text-vulo-muted">{bot.description}</p>
                </div>
                <Button className="py-1.5" disabled={busy} onClick={() => void addOwnBot(bot.id)}>
                  Add to server
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-5 text-xs text-vulo-muted">
        To make your own bot, turn on Developer mode in Settings → Developer. Bot documentation is at{' '}
        <a className="text-[#00a8fc] hover:underline" href={PORTAL_URL} target="_blank" rel="noreferrer">
          the developer portal
        </a>
        .
      </p>
    </Section>
  );
}

function InstalledBot({
  row,
  serverId,
  onChanged,
  onError,
}: {
  row: InstalledRow;
  serverId: string;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const bot = row.bots!;
  const info = bot.template_id ? PREMADE_BOTS[bot.template_id] : undefined;
  const [draft, setDraft] = useState<Record<string, any>>(row.settings || {});
  const [saving, setSaving] = useState(false);

  const update = async (patch: Record<string, any>) => {
    const { error: err } = await supabase.from('server_bots').update(patch).eq('server_id', serverId).eq('bot_id', bot.id);
    if (err) {
      onError(err.message);
      return;
    }
    await onChanged();
  };

  const saveSettings = async () => {
    setSaving(true);
    await update({ settings: { ...(row.settings || {}), ...draft } });
    setSaving(false);
  };

  return (
    <div className="rounded bg-vulo-side p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-vulo-bright">{bot.name}</p>
          <p className="text-xs text-vulo-muted">{bot.description}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-vulo-muted">
          <input type="checkbox" checked={row.enabled} onChange={(e) => void update({ enabled: e.target.checked })} />
          Enabled
        </label>
      </div>

      {info && (
        <>
          {info.fields.map((field) => {
            const value = draft[field.key] ?? '';
            const set = (v: any) => setDraft({ ...draft, [field.key]: v });
            return (
              <Field key={field.key} label={field.label}>
                {field.kind === 'textarea' ? (
                  <textarea className={`${inputClass} min-h-24`} value={value} onChange={(e) => set(e.target.value)} />
                ) : field.kind === 'number' ? (
                  <input className={inputClass} type="number" min={1} value={value} onChange={(e) => set(Number(e.target.value))} />
                ) : (
                  <input className={inputClass} value={value} onChange={(e) => set(e.target.value)} placeholder={field.kind === 'channel' ? 'Channel UUID' : undefined} />
                )}
                {field.help && <p className="mt-1 text-xs text-vulo-muted">{field.help}</p>}
              </Field>
            );
          })}
          <Button variant="secondary" className="py-1.5" disabled={saving} onClick={() => void saveSettings()}>
            Save settings
          </Button>
          <p className="mt-3 text-xs text-vulo-muted">
            Run it on your computer with your bot token:{' '}
            <a className="text-[#00a8fc] hover:underline" href={`${SCRIPTS_URL}${info.script}`} target="_blank" rel="noreferrer">
              download {info.script}
            </a>
          </p>
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-vulo-muted">
        <label>
          <input type="checkbox" checked={row.permissions?.read_messages === true} onChange={(e) => void update({ permissions: { ...row.permissions, read_messages: e.target.checked } })} />{' '}
          Read messages
        </label>
        <label>
          <input type="checkbox" checked={row.permissions?.send_messages === true} onChange={(e) => void update({ permissions: { ...row.permissions, send_messages: e.target.checked } })} />{' '}
          Send messages
        </label>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-xl font-bold text-vulo-bright">{title}</h2>
      {children}
    </section>
  );
}

function OverviewTab({ data, onDeleted }: { data: ServerData; onDeleted: () => void }) {
  const [name, setName] = useState(data.server?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setName(data.server?.name ?? ''), [data.server?.name]);

  const save = async () => {
    setError(null);
    const { error: err } = await supabase.from('servers').update({ name: name.trim() }).eq('id', data.server!.id);
    if (err) return setError(err.message);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${data.server?.name}? All channels and messages will be lost.`)) return;
    const { error: err } = await supabase.from('servers').delete().eq('id', data.server!.id);
    if (err) return setError(err.message);
    onDeleted();
  };

  return (
    <>
      <Section title="Server overview">
        <ErrorText>{error}</ErrorText>
        <Field label="Server name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </Field>
        <div className="flex items-center gap-3">
          <Button onClick={() => void save()}>Save</Button>
          {saved && <span className="text-sm text-vulo-green">Saved</span>}
        </div>
      </Section>
      {data.isOwner && (
        <Section title="Danger zone">
          <Button variant="danger" onClick={() => void remove()}>Delete server</Button>
        </Section>
      )}
    </>
  );
}

function RolesTab({ data }: { data: ServerData }) {
  const roles = [...data.roles].sort((a, b) => b.position - a.position);
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selected = roles.find((r) => r.id === selectedId) ?? roles[0] ?? null;

  const createRole = async () => {
    if (!newName.trim() || !data.server) return;
    setError(null);
    const position = (Math.max(0, ...data.roles.map((r) => r.position)) || 0) + 1;
    const { data: row, error: err } = await supabase
      .from('server_roles')
      .insert({ server_id: data.server.id, name: newName.trim(), permissions: PERM.VIEW_CHANNEL | PERM.SEND_MESSAGES, position })
      .select()
      .single();
    if (err) return setError(err.message);
    setNewName('');
    setSelectedId((row as Role).id);
  };

  return (
    <>
      <Section title="Roles">
        <p className="mb-4 text-sm text-vulo-muted">Roles grant permissions to members. The @everyone role applies to everyone in the server.</p>
        <ErrorText>{error}</ErrorText>
        <div className="grid grid-cols-[200px_1fr] gap-6">
          <div className="space-y-1">
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm ${selected?.id === r.id ? 'bg-vulo-active text-vulo-bright' : 'text-vulo-muted hover:bg-vulo-hover hover:text-vulo-text'}`}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: r.color }} />
                <span className="truncate">{r.name}</span>
              </button>
            ))}
            <div className="pt-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New role name" className={`${inputClass} py-2 text-sm`} aria-label="New role name" />
              <Button variant="secondary" className="mt-2 w-full py-1.5" onClick={() => void createRole()} disabled={!newName.trim()}>
                Create role
              </Button>
            </div>
          </div>

          {selected && <RoleEditor key={selected.id} role={selected} data={data} onDeleted={() => setSelectedId(null)} />}
        </div>
      </Section>
    </>
  );
}

function RoleEditor({ role, data, onDeleted }: { role: Role; data: ServerData; onDeleted: () => void }) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [decorationId, setDecorationId] = useState<string | null>(role.decoration_id);
  const [perms, setPerms] = useState(role.permissions);
  const decorations = useDecorations();
  // Role decorations are shared by everyone with the role, so they cannot be badge-locked or ended.
  const choices = decorations.filter(
    (d) => d.id === role.decoration_id || (!d.required_badge_id && (!d.available_until || Date.parse(d.available_until) > Date.now())),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggle = (bit: number) => setPerms((p) => (p & bit ? p & ~bit : p | bit));

  const save = async () => {
    setError(null);
    const patch: Partial<Role> = { permissions: perms, color, decoration_id: decorationId };
    if (!role.is_default) patch.name = name.trim();
    const { error: err } = await supabase.from('server_roles').update(patch).eq('id', role.id);
    if (err) return setError(err.message);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const remove = async () => {
    if (!window.confirm(`Delete the ${role.name} role?`)) return;
    const { error: err } = await supabase.from('server_roles').delete().eq('id', role.id);
    if (err) return setError(err.message);
    onDeleted();
  };

  return (
    <div className="rounded bg-vulo-side p-5">
      <ErrorText>{error}</ErrorText>
      <div className="mb-4 grid grid-cols-[1fr_96px] gap-3">
        <Field label="Role name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} disabled={role.is_default} />
        </Field>
        <Field label="Colour">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-[42px] w-full cursor-pointer rounded bg-vulo-rail p-1" />
        </Field>
      </div>

      {!role.is_default && (
        <Field label="Member decoration" hint="Shown around the avatar of everyone with this role in this server. Choose None to show each member's own decoration.">
          <select className={inputClass} value={decorationId ?? ''} onChange={(e) => setDecorationId(e.target.value || null)}>
            <option value="">None</option>
            {choices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-vulo-muted">Permissions</p>
      <ul className="mb-5 divide-y divide-vulo-line rounded bg-vulo-rail">
        {PERM_LABELS.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span>
              <span className="block text-sm font-medium text-vulo-bright">{p.label}</span>
              <span className="text-xs text-vulo-muted">{p.hint}</span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#7c5cff]"
              checked={(perms & PERM[p.key]) === PERM[p.key]}
              onChange={() => toggle(PERM[p.key])}
              aria-label={p.label}
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()}>Save role</Button>
        {!role.is_default && (
          <Button variant="danger" onClick={() => void remove()}>
            Delete role
          </Button>
        )}
        {saved && <span className="text-sm text-vulo-green">Saved</span>}
      </div>
      {data.isOwner && role.is_default && (
        <p className="mt-3 text-xs text-vulo-muted">The @everyone role cannot be renamed or deleted.</p>
      )}
    </div>
  );
}

function MembersTab({ data, userId }: { data: ServerData; userId: string }) {
  const [error, setError] = useState<string | null>(null);
  const roles = data.roles.filter((r) => !r.is_default).sort((a, b) => b.position - a.position);
  const canRoles = hasPerm(data.perms, PERM.MANAGE_ROLES);
  const canKick = hasPerm(data.perms, PERM.KICK_MEMBERS);
  const [query, setQuery] = useState('');

  const has = (uid: string, roleId: string) =>
    data.memberRoles.some((mr) => mr.user_id === uid && mr.role_id === roleId);

  const toggleRole = async (uid: string, roleId: string, on: boolean) => {
    setError(null);
    const { error: err } = on
      ? await supabase.from('member_roles').insert({ server_id: data.server!.id, user_id: uid, role_id: roleId })
      : await supabase.from('member_roles').delete().eq('server_id', data.server!.id).eq('user_id', uid).eq('role_id', roleId);
    if (err) setError(err.message);
  };

  const kick = async (uid: string, name: string) => {
    if (!window.confirm(`Remove ${name} from the server?`)) return;
    const { error: err } = await supabase.from('server_members').delete().eq('server_id', data.server!.id).eq('user_id', uid);
    if (err) setError(err.message);
  };

  const rows = data.members
    .filter((m) => {
      const n = (m.profiles?.display_name || m.profiles?.username || '').toLowerCase();
      return n.includes(query.toLowerCase());
    })
    .sort((a, b) => (a.profiles?.username ?? '').localeCompare(b.profiles?.username ?? ''));

  return (
    <Section title={`Members — ${data.members.length}`}>
      <ErrorText>{error}</ErrorText>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search members"
        className={`${inputClass} mb-4 py-2 text-sm`}
        aria-label="Search members"
      />
      <ul className="divide-y divide-vulo-line rounded bg-vulo-side">
        {rows.map((m) => {
          const name = m.nickname || m.profiles?.display_name || m.profiles?.username || 'Unknown';
          const isOwner = m.user_id === data.server?.owner_id;
          return (
            <li key={m.user_id} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="min-w-[160px] flex-1">
                <p className="font-medium text-vulo-bright">
                  {name}
                  {m.user_id === userId && <span className="ml-2 text-xs text-vulo-muted">(you)</span>}
                  {isOwner && <span className="ml-2 text-xs text-vulo-yellow">Owner</span>}
                </p>
                <p className="text-xs text-vulo-muted">@{m.profiles?.username}</p>
              </div>
              {canRoles && !isOwner && (
                <div className="flex flex-wrap gap-2">
                  {roles.map((r) => (
                    <label key={r.id} className="flex cursor-pointer items-center gap-1.5 rounded bg-vulo-rail px-2 py-1 text-xs text-vulo-text">
                      <input
                        type="checkbox"
                        className="accent-[#7c5cff]"
                        checked={has(m.user_id, r.id)}
                        onChange={(e) => void toggleRole(m.user_id, r.id, e.target.checked)}
                      />
                      <span style={{ color: r.color }}>{r.name}</span>
                    </label>
                  ))}
                </div>
              )}
              {canKick && !isOwner && m.user_id !== userId && (
                <Button variant="danger" className="py-1.5" onClick={() => void kick(m.user_id, name)}>
                  Kick
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// Keep in step with the database: the server_sticker_limit trigger and the stickers bucket limit.
const STICKER_MAX = 50;
const STICKER_MAX_BYTES = 10 * 1024 * 1024;

function StickersTab({ serverId, userId }: { serverId: string; userId: string }) {
  const all = useStickers();
  const mine: CustomSticker[] = all.filter((s) => s.server_id === serverId);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadStickers();
  }, []);

  const upload = async (file: File) => {
    const clean = name.trim().toLowerCase();
    setError(null);
    setSaved(false);
    if (!/^[a-z0-9_]{2,32}$/.test(clean)) {
      setError('Name the sticker first, using 2–32 lowercase letters, numbers or underscores.');
      return;
    }
    if (mine.some((s) => s.name === clean)) {
      setError(`${clean} already exists on this server.`);
      return;
    }
    if (mine.length >= STICKER_MAX) {
      setError(`This server already has ${STICKER_MAX} stickers.`);
      return;
    }
    if (!EMOJI_TYPES.includes(file.type)) {
      setError('Use a PNG, JPEG, GIF or WebP image.');
      return;
    }
    if (file.size > STICKER_MAX_BYTES) {
      setError('Stickers must be 10 MB or smaller.');
      return;
    }

    setBusy(true);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    const path = `${serverId}/${clean}-${Date.now()}.${ext}`;
    try {
      const { error: upErr } = await supabase.storage.from('stickers').upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('stickers').getPublicUrl(path);
      const { error: insErr } = await supabase.from('server_stickers').insert({
        server_id: serverId,
        name: clean,
        asset_url: pub.publicUrl,
        animated: file.type === 'image/gif',
        created_by: userId,
      });
      if (insErr) {
        // The row was refused, so remove the image that was just uploaded.
        await supabase.storage.from('stickers').remove([path]);
        throw insErr;
      }
      setName('');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(errorText(e, 'Could not add the sticker.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: CustomSticker) => {
    if (!window.confirm(`Delete the ${s.name} sticker? Messages that use it will show a broken image.`)) return;
    setError(null);
    const { error: delErr } = await supabase.from('server_stickers').delete().eq('id', s.id);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    const marker = '/object/public/stickers/';
    const at = s.asset_url.indexOf(marker);
    if (at !== -1) {
      await supabase.storage.from('stickers').remove([decodeURIComponent(s.asset_url.slice(at + marker.length))]);
    }
  };

  const full = mine.length >= STICKER_MAX;

  return (
    <Section title="Server stickers">
      <p className="mb-4 text-sm text-vulo-muted">
        Members of this server can send these from the picker's Stickers tab. {mine.length} of {STICKER_MAX} used.
      </p>
      <ErrorText>{error}</ErrorText>
      {saved && <p className="mb-3 rounded bg-vulo-green/10 px-3 py-2 text-sm text-vulo-green">Sticker added.</p>}

      <div className="mb-6 rounded bg-vulo-side p-5">
        <Field label="Name" hint="2–32 lowercase letters, numbers or underscores.">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            placeholder="wave_hi"
            aria-label="Sticker name"
          />
        </Field>
        <label
          className={`inline-block cursor-pointer rounded bg-vulo-accent px-3 py-2 text-sm font-medium text-white hover:bg-vulo-accentHover ${
            busy || full ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          {busy ? 'Uploading…' : 'Upload sticker'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            disabled={busy || full}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
        </label>
        <p className="mt-2 text-xs text-vulo-muted">PNG, JPEG, GIF or WebP, up to 10 MB. Animated GIFs play in messages.</p>
      </div>

      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-vulo-muted">Stickers — {mine.length}</p>
      {mine.length === 0 ? (
        <p className="text-sm text-vulo-muted">No stickers yet.</p>
      ) : (
        <ul className="divide-y divide-vulo-line rounded bg-vulo-side">
          {mine.map((s) => (
            <li key={s.id} className="flex items-center gap-4 px-4 py-3">
              <img src={s.asset_url} alt="" loading="lazy" className="h-12 w-12 object-contain" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-vulo-bright">{s.name}</p>
                <p className="text-xs text-vulo-muted">{s.animated ? 'Animated' : 'Static'}</p>
              </div>
              <Button variant="danger" className="py-1.5" onClick={() => void remove(s)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// Keep in step with the database: the server_emoji_limit trigger and the emojis bucket limit.
const EMOJI_MAX = 50;
const EMOJI_MAX_BYTES = 10 * 1024 * 1024;
const EMOJI_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function errorText(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return fallback;
}

function EmojisTab({ serverId, userId }: { serverId: string; userId: string }) {
  const all = useEmojis();
  const mine: CustomEmoji[] = all.filter((e) => e.server_id === serverId);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadEmojis();
  }, []);

  const upload = async (file: File) => {
    const clean = name.trim().toLowerCase();
    setError(null);
    setSaved(false);
    if (!/^[a-z0-9_]{2,32}$/.test(clean)) {
      setError('Name the emoji first, using 2–32 lowercase letters, numbers or underscores.');
      return;
    }
    if (mine.some((e) => e.name === clean)) {
      setError(`:${clean}: already exists on this server.`);
      return;
    }
    if (mine.length >= EMOJI_MAX) {
      setError(`This server already has ${EMOJI_MAX} emojis.`);
      return;
    }
    if (!EMOJI_TYPES.includes(file.type)) {
      setError('Use a PNG, JPEG, GIF or WebP image.');
      return;
    }
    if (file.size > EMOJI_MAX_BYTES) {
      setError('Emojis must be 10 MB or smaller.');
      return;
    }

    setBusy(true);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    const path = `${serverId}/${clean}-${Date.now()}.${ext}`;
    try {
      const { error: upErr } = await supabase.storage.from('emojis').upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('emojis').getPublicUrl(path);
      const { error: insErr } = await supabase.from('server_emojis').insert({
        server_id: serverId,
        name: clean,
        asset_url: pub.publicUrl,
        animated: file.type === 'image/gif',
        created_by: userId,
      });
      if (insErr) {
        // The row was refused, so remove the image that was just uploaded.
        await supabase.storage.from('emojis').remove([path]);
        throw insErr;
      }
      setName('');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(errorText(e, 'Could not add the emoji.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: CustomEmoji) => {
    if (!window.confirm(`Delete :${e.name}:? Messages that use it will show the name as text.`)) return;
    setError(null);
    const { error: delErr } = await supabase.from('server_emojis').delete().eq('id', e.id);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    // The image path sits after the bucket name in the public URL.
    const marker = '/object/public/emojis/';
    const at = e.asset_url.indexOf(marker);
    if (at !== -1) {
      await supabase.storage.from('emojis').remove([decodeURIComponent(e.asset_url.slice(at + marker.length))]);
    }
  };

  const full = mine.length >= EMOJI_MAX;

  return (
    <Section title="Server emojis">
      <p className="mb-4 text-sm text-vulo-muted">
        Members of this server can use these by typing :name: or by picking them from the emoji menu. {mine.length} of {EMOJI_MAX} used.
      </p>
      <ErrorText>{error}</ErrorText>
      {saved && <p className="mb-3 rounded bg-vulo-green/10 px-3 py-2 text-sm text-vulo-green">Emoji added.</p>}

      <div className="mb-6 rounded bg-vulo-side p-5">
        <Field label="Name" hint="Used as :name:. 2–32 lowercase letters, numbers or underscores.">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            placeholder="party_parrot"
            aria-label="Emoji name"
          />
        </Field>
        <label
          className={`inline-block cursor-pointer rounded bg-vulo-accent px-3 py-2 text-sm font-medium text-white hover:bg-vulo-accentHover ${
            busy || full ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          {busy ? 'Uploading…' : 'Upload emoji'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            disabled={busy || full}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
        </label>
        <p className="mt-2 text-xs text-vulo-muted">PNG, JPEG, GIF or WebP, up to 10 MB. Animated GIFs play in messages.</p>
      </div>

      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-vulo-muted">Emojis — {mine.length}</p>
      {mine.length === 0 ? (
        <p className="text-sm text-vulo-muted">No emojis yet.</p>
      ) : (
        <ul className="divide-y divide-vulo-line rounded bg-vulo-side">
          {mine.map((e) => (
            <li key={e.id} className="flex items-center gap-4 px-4 py-3">
              <img src={e.asset_url} alt="" loading="lazy" className="h-10 w-10 object-contain" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-vulo-bright">:{e.name}:</p>
                <p className="text-xs text-vulo-muted">{e.animated ? 'Animated' : 'Static'}</p>
              </div>
              <Button variant="danger" className="py-1.5" onClick={() => void remove(e)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
