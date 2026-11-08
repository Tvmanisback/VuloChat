import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { loadDecorations, useDecorations } from '../lib/decorations';
import { updateSettings, useSettings, type Keybinds } from '../lib/settings';
import { Avatar, Button, ErrorText, Field, inputClass } from './ui';

type Tab = 'account' | 'decorations' | 'appearance' | 'voice' | 'keybinds';

const TABS: { id: Tab; label: string }[] = [
  { id: 'account', label: 'My Account' },
  { id: 'decorations', label: 'Avatar Decoration' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'voice', label: 'Voice & Video' },
  { id: 'keybinds', label: 'Keybinds' },
];

export default function UserSettings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('account');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex bg-vulo-chat" role="dialog" aria-modal="true" aria-label="User settings">
      <nav className="scroll-thin flex w-64 shrink-0 justify-end overflow-y-auto bg-vulo-side px-4 py-16">
        <div className="w-44 space-y-0.5">
          <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-vulo-muted">User settings</p>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`block w-full rounded px-2 py-1.5 text-left text-[15px] ${tab === t.id ? 'bg-vulo-active text-vulo-bright' : 'text-vulo-muted hover:bg-vulo-hover hover:text-vulo-text'}`}
            >
              {t.label}
            </button>
          ))}
          <div className="my-3 h-px bg-vulo-line" />
          <LogoutButton />
        </div>
      </nav>

      <div className="scroll-thin flex-1 overflow-y-auto px-10 py-16">
        <div className="mx-auto max-w-2xl">
          {tab === 'account' && <AccountTab />}
          {tab === 'decorations' && <DecorationTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'voice' && <VoiceTab />}
          {tab === 'keybinds' && <KeybindsTab />}
        </div>
      </div>

      <button onClick={onClose} className="fixed right-6 top-12 flex flex-col items-center text-vulo-muted hover:text-vulo-text" aria-label="Close settings">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-current">✕</span>
        <span className="mt-1 text-xs">ESC</span>
      </button>
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

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mb-4 flex cursor-pointer items-center justify-between gap-4 rounded bg-vulo-side px-4 py-3">
      <span>
        <span className="block font-medium text-vulo-bright">{label}</span>
        {hint && <span className="text-xs text-vulo-muted">{hint}</span>}
      </span>
      <input type="checkbox" className="h-5 w-5 accent-[#7c5cff]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function AccountTab() {
  const { profile, session, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [about, setAbout] = useState(profile?.about ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!profile) return null;

  const save = async () => {
    setError(null);
    setSaved(false);
    try {
      await updateProfile({ display_name: displayName.trim() || null, about: about.trim() || null });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!session) return;
    if (!file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) {
      setError('Pick an image under 4 MB.');
      return;
    }
    setUploading(true);
    setError(null);
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${session.user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) {
      setUploading(false);
      setError(upErr.message);
      return;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    await updateProfile({ avatar_url: data.publicUrl });
    setUploading(false);
  };

  return (
    <>
      <Section title="My Account">
        <div className="mb-6 flex items-center gap-5 rounded bg-vulo-side p-5">
          <Avatar profile={profile} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-vulo-bright">{profile.display_name || profile.username}</p>
            <p className="truncate text-sm text-vulo-muted">@{profile.username}</p>
            <p className="truncate text-sm text-vulo-muted">{session?.user.email}</p>
          </div>
          <label className="cursor-pointer rounded bg-vulo-accent px-3 py-2 text-sm font-medium text-white hover:bg-vulo-accentHover">
            {uploading ? 'Uploading…' : 'Change avatar'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAvatar(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        <ErrorText>{error}</ErrorText>
        {saved && <p className="mb-3 rounded bg-vulo-green/10 px-3 py-2 text-sm text-vulo-green">Saved.</p>}

        <Field label="Display name">
          <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} />
        </Field>
        <Field label="Username" hint="Usernames are fixed when you sign up.">
          <input className={`${inputClass} opacity-60`} value={profile.username} disabled />
        </Field>
        <Field label="About me">
          <textarea className={inputClass} rows={3} value={about} onChange={(e) => setAbout(e.target.value)} maxLength={190} />
        </Field>
        <Button onClick={() => void save()}>Save changes</Button>
      </Section>
    </>
  );
}

function LogoutButton() {
  const { signOut } = useAuth();
  return (
    <button
      onClick={() => void signOut()}
      className="block w-full rounded px-2 py-1.5 text-left text-[15px] text-vulo-red hover:bg-vulo-red hover:text-white"
    >
      Log out
    </button>
  );
}

function DecorationTab() {
  const { profile, updateProfile } = useAuth();
  const decorations = useDecorations();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDecorations();
  }, []);

  if (!profile) return null;

  const choose = async (id: string | null) => {
    if (pending || id === profile.decoration_id) return;
    setPending(true);
    setError(null);
    try {
      await updateProfile({ decoration_id: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setPending(false);
    }
  };

  const current = decorations.find((d) => d.id === profile.decoration_id);

  return (
    <Section title="Avatar decoration">
      <div className="mb-6 flex items-center gap-5 rounded bg-vulo-side p-5">
        <Avatar profile={profile} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-vulo-bright">{current ? current.name : 'No decoration'}</p>
          <p className="text-sm text-vulo-muted">Shown around your avatar everywhere you appear.</p>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>

      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-vulo-muted">Choose a decoration</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <DecorationOption label="None" selected={!profile.decoration_id} disabled={pending} onSelect={() => void choose(null)}>
          <Avatar profile={{ ...profile, decoration_id: null }} size="md" />
        </DecorationOption>
        {decorations.map((d) => (
          <DecorationOption
            key={d.id}
            label={d.name}
            hint={d.animated ? 'Animated' : undefined}
            selected={profile.decoration_id === d.id}
            disabled={pending}
            onSelect={() => void choose(d.id)}
          >
            <Avatar profile={{ ...profile, decoration_id: d.id }} size="md" />
          </DecorationOption>
        ))}
      </div>
      {decorations.length === 0 && <p className="mt-3 text-sm text-vulo-muted">Decorations are loading…</p>}
    </Section>
  );
}

function DecorationOption({
  label,
  hint,
  selected,
  disabled,
  onSelect,
  children,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex flex-col items-center gap-2 rounded p-4 text-center transition disabled:cursor-wait ${
        selected ? 'bg-vulo-active ring-2 ring-vulo-accent' : 'bg-vulo-side hover:bg-vulo-hover'
      }`}
    >
      <span className="flex h-16 w-16 items-center justify-center">{children}</span>
      <span className="text-sm font-medium text-vulo-bright">{label}</span>
      {hint && <span className="text-xs text-vulo-muted">{hint}</span>}
    </button>
  );
}

function AppearanceTab() {
  const s = useSettings();
  return (
    <Section title="Appearance">
      <Toggle label="Compact message spacing" hint="Less space between messages." checked={s.compact} onChange={(v) => updateSettings({ compact: v })} />
      <Toggle label="Show timestamps on hover" hint="Shows the time beside messages in a group." checked={s.showTimestamps} onChange={(v) => updateSettings({ showTimestamps: v })} />
    </Section>
  );
}

function VoiceTab() {
  const s = useSettings();
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setInputs(devices.filter((d) => d.kind === 'audioinput'));
        setOutputs(devices.filter((d) => d.kind === 'audiooutput'));
      } catch {
        /* permissions may be needed before labels appear */
      }
    };
    void load();
  }, []);

  return (
    <Section title="Voice & Video">
      <Field label="Input device">
        <select className={inputClass} value={s.inputDeviceId} onChange={(e) => updateSettings({ inputDeviceId: e.target.value })}>
          <option value="">Default</option>
          {inputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
        </select>
      </Field>
      <Field label="Output device" hint="Choosing an output works in browsers that support it.">
        <select className={inputClass} value={s.outputDeviceId} onChange={(e) => updateSettings({ outputDeviceId: e.target.value })}>
          <option value="">Default</option>
          {outputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Speakers'}</option>)}
        </select>
      </Field>
      <Field label={`Output volume — ${s.outputVolume}%`}>
        <input type="range" min={0} max={200} value={s.outputVolume} onChange={(e) => updateSettings({ outputVolume: Number(e.target.value) })} className="w-full accent-[#7c5cff]" />
      </Field>
      <Toggle label="Noise suppression" hint="Applies the next time you join a voice channel." checked={s.noiseSuppression} onChange={(v) => updateSettings({ noiseSuppression: v })} />
      <Toggle label="Echo cancellation" hint="Applies the next time you join a voice channel." checked={s.echoCancellation} onChange={(v) => updateSettings({ echoCancellation: v })} />
      <Toggle label="Push to talk" hint={`Hold ${s.keybinds.pushToTalk} to transmit. On the desktop app, press it to toggle.`} checked={s.pushToTalkEnabled} onChange={(v) => updateSettings({ pushToTalkEnabled: v })} />
    </Section>
  );
}

const LABELS: Record<keyof Keybinds, string> = {
  toggleMute: 'Toggle mute',
  toggleDeafen: 'Toggle deafen',
  pushToTalk: 'Push to talk',
};

function KeybindsTab() {
  const s = useSettings();
  const [capturing, setCapturing] = useState<keyof Keybinds | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setCapturing(null);
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Control');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Meta');
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
      updateSettings({ keybinds: { ...s.keybinds, [capturing]: parts.join('+') } });
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, s.keybinds]);

  return (
    <Section title="Keybinds">
      <p className="mb-4 text-sm text-vulo-muted">Keybinds work while you are in a voice channel. Press Escape while recording to cancel.</p>
      {(Object.keys(LABELS) as (keyof Keybinds)[]).map((k) => (
        <div key={k} className="mb-3 flex items-center justify-between rounded bg-vulo-side px-4 py-3">
          <span className="font-medium text-vulo-bright">{LABELS[k]}</span>
          <div className="flex items-center gap-3">
            <kbd className="rounded bg-vulo-rail px-2 py-1 font-mono text-sm text-vulo-text">
              {capturing === k ? 'Press keys…' : s.keybinds[k]}
            </kbd>
            <Button variant="secondary" className="py-1.5" onClick={() => setCapturing(k)}>Edit</Button>
          </div>
        </div>
      ))}
    </Section>
  );
}
