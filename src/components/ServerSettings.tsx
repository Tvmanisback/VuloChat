import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { PERM, PERM_LABELS, hasPerm } from '../lib/permissions';
import { loadEmojis, useEmojis, type CustomEmoji } from '../lib/emojis';
import { loadStickers, useStickers, type CustomSticker } from '../lib/stickers';
import { useDecorations } from '../lib/decorations';
import type { Role } from '../lib/types';
import type { ServerData } from '../lib/useServer';
import { Button, ErrorText, Field, inputClass } from './ui';

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


function BotsTab({ data, userId }: { data: ServerData; userId: string }) {
  const [bots,setBots]=useState<any[]>([]);
  const [templates,setTemplates]=useState<any[]>([]);
  const [installed,setInstalled]=useState<any[]>([]);
  const [name,setName]=useState('');
  const [description,setDescription]=useState('');
  const [error,setError]=useState<string|null>(null);
  const [token,setToken]=useState('');
  const [busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<any|null>(null);
  const [profile,setProfile]=useState({display_name:'',avatar_url:'',banner_url:'',about:''});
  const [welcome,setWelcome]=useState('Welcome {username} to {server}!');
  const [welcomeChannel,setWelcomeChannel]=useState('');
  const serverId=data.server!.id;
  const load=async()=>{
    const [mine,market,active]=await Promise.all([
      supabase.from('bots').select('id,name,description,profile_id').eq('owner_id',userId).order('created_at'),
      supabase.from('bot_templates').select('*').eq('enabled',true),
      supabase.from('server_bots').select('bot_id,enabled,settings,permissions,bots(id,name,description,profile_id)').eq('server_id',serverId)
    ]);
    if(mine.error||market.error||active.error){setError(mine.error?.message||market.error?.message||active.error?.message);return;}
    setBots(mine.data||[]);setTemplates(market.data||[]);setInstalled(active.data||[]);
  };
  useEffect(()=>{void load();},[userId,serverId]);
  const invoke=async(body:any)=>{
    const {data:result,error:err}=await supabase.functions.invoke('vulo-bots',{body});
    if(err||result?.error) throw new Error(err?.message||result.error);
    return result;
  };
  const create=async(templateId?:string)=>{
    setBusy(true);setError(null);setToken('');
    try {
      const result=await invoke(templateId?{action:'create_from_template',template_id:templateId,name:name||undefined}:{action:'create',name,description});
      setBots(old=>[...old,result.bot]);setToken(result.token);setName('');setDescription('');
    } catch(e){setError(e instanceof Error?e.message:'Could not create bot.');}
    setBusy=false;
  };
  const install=async(botId:string)=>{
    setBusy(true);setError(null);
    try { await invoke({action:'install',bot_id:botId,server_id:serverId}); await load(); }
    catch(e){setError(e instanceof Error?e.message:'Could not install bot.');}
    setBusy=false;
  };
  const configure=async(botId:string,patch:any)=>{
    const current=installed.find(x=>x.bot_id===botId);
    const {error:err}=await supabase.from('server_bots').update(patch).eq('server_id',serverId).eq('bot_id',botId);
    if(err){setError(err.message);return;}
    await load();
  };
  const openProfile=async(bot:any)=>{
    const {data:profileRow}=await supabase.from('profiles').select('display_name,avatar_url,banner_url,about').eq('id',bot.profile_id).maybeSingle();
    setEditing(bot);
    setProfile({display_name:profileRow?.display_name||bot.name||'',avatar_url:profileRow?.avatar_url||'',banner_url:profileRow?.banner_url||'',about:profileRow?.about||bot.description||''});
  };
  const uploadProfileImage=async(kind:'avatar'|'banner',file:File)=>{
    if(!editing)return;
    if(!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type)){setError('Use PNG, JPEG, GIF, or WebP images.');return;}
    if(file.size>10*1024*1024){setError('Bot profile images must be 10 MB or smaller.');return;}
    const ext=file.name.split('.').pop()?.toLowerCase()||'png';
    const path=`${userId}/${editing.id}/${kind}-${Date.now()}.${ext}`;
    setBusy(true);setError(null);
    const {error:uploadError}=await supabase.storage.from('bot-assets').upload(path,file,{contentType:file.type,upsert:true});
    if(uploadError){setError(uploadError.message);setBusy(false);return;}
    const {data:publicFile}=supabase.storage.from('bot-assets').getPublicUrl(path);
    setProfile(old=>({...old,[kind==='avatar'?'avatar_url':'banner_url']:publicFile.publicUrl}));
    setBusy(false);
  };
  const saveProfile=async()=>{
    if(!editing)return;
    setBusy(true);setError(null);
    try{await invoke({action:'edit_profile',bot_id:editing.id,...profile});setEditing(null);await load();}
    catch(e){setError(e instanceof Error?e.message:'Could not update bot profile.');}
    setBusy(false);
  };
  const installedIds=new Set(installed.map(x=>x.bot_id));
  return <Section title="Bots">
    <p className="mb-4 text-sm text-vulo-muted">Bots run on their owner's computer. VuloChat provides the API and server membership, but never hosts the bot process.</p>
    <ErrorText>{error}</ErrorText>
    {token&&<div className="mb-5 rounded border border-vulo-green/40 bg-vulo-green/10 p-4"><p className="mb-2 font-semibold text-vulo-bright">Copy this token now — it is only shown once</p><code className="block break-all select-all text-sm">{token}</code><p className="mt-2 text-xs text-vulo-muted">Keep it private. Regenerate it if it is exposed.</p></div>}
    {editing&&<div className="mb-6 rounded bg-vulo-side p-4">
      <h3 className="mb-3 font-semibold text-vulo-bright">Edit {editing.name}'s profile</h3>
      <Field label="Display name"><input className={inputClass} value={profile.display_name} onChange={e=>setProfile({...profile,display_name:e.target.value})}/></Field>
      <Field label="Profile picture"><input className={inputClass} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadProfileImage('avatar',file);e.target.value='';}}/></Field>
      <Field label="Profile banner"><input className={inputClass} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadProfileImage('banner',file);e.target.value='';}}/></Field>
      <Field label="About"><input className={inputClass} value={profile.about} onChange={e=>setProfile({...profile,about:e.target.value})}/></Field>
      <p className="mb-3 text-xs text-vulo-muted">PNG, JPEG, GIF, or WebP · Maximum 10 MB per image.</p><div className="flex gap-2"><Button onClick={()=>void saveProfile()} disabled={busy}>Save profile</Button><Button variant="secondary" onClick={()=>setEditing(null)}>Cancel</Button></div>
    </div>}
    <div className="mb-6 rounded bg-vulo-side p-4">
      <h3 className="mb-3 font-semibold text-vulo-bright">Bot marketplace</h3>
      {templates.length===0?<p className="text-sm text-vulo-muted">No premade bots are available yet.</p>:templates.map(t=><div key={t.id} className="flex items-center gap-3 border-b border-vulo-line py-3 last:border-0">
        <div className="min-w-0 flex-1"><p className="font-medium text-vulo-bright">{t.name}</p><p className="text-xs text-vulo-muted">{t.description}</p><p className="mt-1 text-[11px] uppercase text-vulo-muted">{t.category}</p></div>
        <Button className="py-1.5" disabled={busy} onClick={()=>void create(t.id)}>Create {t.name}</Button>
      </div>)}
    </div>
    <div className="mb-6 rounded bg-vulo-side p-4">
      <h3 className="mb-3 font-semibold text-vulo-bright">Create your own bot</h3>
      <Field label="Bot name"><input className={inputClass} value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></Field>
      <Field label="Description"><input className={inputClass} value={description} onChange={e=>setDescription(e.target.value)} maxLength={500}/></Field>
      <Button onClick={()=>void create()} disabled={busy||name.trim().length<2}>Create bot & token</Button>
    </div>
    <h3 className="mb-3 font-semibold text-vulo-bright">Your bots</h3>
    {bots.length===0?<p className="text-sm text-vulo-muted">No bots created yet.</p>:<ul className="mb-6 divide-y divide-vulo-line rounded bg-vulo-side">{bots.map(bot=><li key={bot.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><p className="font-medium text-vulo-bright">{bot.name}</p><p className="truncate text-xs text-vulo-muted">{bot.description}</p></div><Button variant="secondary" className="py-1.5" onClick={()=>openProfile(bot)}>Profile</Button>{!installedIds.has(bot.id)&&<Button className="py-1.5" disabled={busy} onClick={()=>void install(bot.id)}>Add to server</Button>}</li>)}</ul>}
    <h3 className="mb-3 font-semibold text-vulo-bright">Installed bots</h3>
    {installed.length===0?<p className="text-sm text-vulo-muted">No bots installed in this server.</p>:<div className="space-y-3">{installed.map(row=>{
      const bot=row.bots; if(!bot)return null;
      const settings=row.settings||{};
      return <div key={row.bot_id} className="rounded bg-vulo-side p-4">
        <div className="mb-3 flex items-center justify-between"><div><p className="font-medium text-vulo-bright">{bot.name}</p><p className="text-xs text-vulo-muted">{bot.description}</p></div><label className="flex items-center gap-2 text-xs text-vulo-muted"><input type="checkbox" checked={row.enabled} onChange={e=>void configure(bot.id,{enabled:e.target.checked})}/>Enabled</label></div>
        {bot.name.toLowerCase().includes('welcomer')&&<><Field label="Welcome message"><input className={inputClass} value={settings.welcome_message??welcome} onChange={e=>setWelcome(e.target.value)}/></Field><Field label="Welcome channel ID"><input className={inputClass} value={settings.channel_id??welcomeChannel} onChange={e=>setWelcomeChannel(e.target.value)} placeholder="Channel UUID"/></Field><Button variant="secondary" className="py-1.5" onClick={()=>void configure(bot.id,{settings:{...settings,welcome_message:welcome,channel_id:welcomeChannel}})}>Save Welcomer settings</Button></>}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-vulo-muted"><label><input type="checkbox" checked={row.permissions?.read_messages===true} onChange={e=>void configure(bot.id,{permissions:{...row.permissions,read_messages:e.target.checked}})}/> Read messages</label><label><input type="checkbox" checked={row.permissions?.send_messages===true} onChange={e=>void configure(bot.id,{permissions:{...row.permissions,send_messages:e.target.checked}})}/> Send messages</label></div>
        <Button variant="secondary" className="mt-3 py-1.5" onClick={()=>openProfile(bot)}>Edit bot profile</Button>
      </div>;
    })}</div>}
    <p className="mt-5 text-xs text-vulo-muted"><a className="mr-3 text-[#00a8fc] hover:underline" href="./developers.html">Open Developer Portal</a> · SDKs: <a className="text-[#00a8fc] hover:underline" href="https://github.com/Tvmanisback/VuloChat/tree/main/sdk" target="_blank" rel="noreferrer">Vulo.js / Vulo.py</a> · <a className="text-[#00a8fc] hover:underline" href="https://github.com/Tvmanisback/VuloChat/blob/main/docs/BOT_API.md" target="_blank" rel="noreferrer">API documentation</a></p>
  </Section>;
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
