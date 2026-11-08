import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { loadDecorations, useDecorations } from '../lib/decorations';
import { loadNameplates, nameplateSrc, useNameplates } from '../lib/nameplates';
import { useLockReasons } from '../lib/cosmetics';
import { useProfileBadges } from '../lib/badges';
import { bannerBackground } from '../lib/banner';
import { updateSettings, useSettings, type Keybinds } from '../lib/settings';
import { Avatar, Button, ErrorText, Field, inputClass } from './ui';
import BadgeIcon from './BadgeIcon';
import NameplateBackdrop from './Nameplate';
import { CUSTOM_DEFAULT, PRESETS, type PresetName, type ThemeColors, type ThemeName } from '../lib/themes';

type Tab = 'account' | 'profile' | 'decorations' | 'nameplates' | 'appearance' | 'voice' | 'keybinds';

const TABS: { id: Tab; label: string }[] = [
  { id: 'account', label: 'My Account' },
  { id: 'profile', label: 'Profile' },
  { id: 'decorations', label: 'Avatar Decoration' },
  { id: 'nameplates', label: 'Nameplate' },
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
          {tab === 'profile' && <ProfileTab />}
          {tab === 'decorations' && <DecorationTab />}
          {tab === 'nameplates' && <NameplateTab />}
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
    await updateProfile({ avatar_url: data.publicUrl, animated_avatar: file.type === 'image/gif' });
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
        <Field label="About me" hint="Supports **bold**, *italic*, `code` and links. Shown on your profile card.">
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

function ProfileTab() {
  const { profile, session, updateProfile } = useAuth();
  const badges = useProfileBadges(profile?.id ?? null);
  const [customStatus, setCustomStatus] = useState(profile?.custom_status ?? '');
  const [accent, setAccent] = useState(profile?.accent_color ?? '#7c5cff');
  const [accentBusy, setAccentBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!profile) return null;

  // Null clears the color, which puts the default banner back.
  const saveAccent = async (color: string | null) => {
    setError(null);
    setSaved(false);
    setAccentBusy(true);
    try {
      await updateProfile({ accent_color: color });
      setAccent(color ?? '#7c5cff');
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the color.');
    } finally {
      setAccentBusy(false);
    }
  };

  const saveStatus = async () => {
    setError(null);
    setSaved(false);
    try {
      await updateProfile({ custom_status: customStatus.trim() || null });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  const uploadBanner = async (file: File) => {
    if (!session) return;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      setError('Pick an image under 8 MB.');
      return;
    }
    setUploading(true);
    setError(null);
    setSaved(false);
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${session.user.id}/banner-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) {
      setUploading(false);
      setError(upErr.message);
      return;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    try {
      await updateProfile({ banner_url: data.publicUrl, animated_banner: file.type === 'image/gif' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the banner.');
    } finally {
      setUploading(false);
    }
  };

  const removeBanner = async () => {
    setError(null);
    setSaved(false);
    try {
      await updateProfile({ banner_url: null, animated_banner: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the banner.');
    }
  };

  return (
    <Section title="Profile">
      <div className="mb-6 overflow-hidden rounded-lg bg-vulo-side">
        <div className="h-28" style={{ background: bannerBackground(profile.accent_color) }}>
          {profile.banner_url && <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <p className="min-w-0 text-sm text-vulo-muted">
            {profile.banner_url
              ? profile.animated_banner
                ? 'Animated GIF banner'
                : 'Custom banner'
              : 'No banner. The default gradient is shown.'}
          </p>
          <div className="flex shrink-0 gap-2">
            <label className="cursor-pointer rounded bg-vulo-accent px-3 py-2 text-sm font-medium text-white hover:bg-vulo-accentHover">
              {uploading ? 'Uploading…' : profile.banner_url ? 'Change banner' : 'Upload banner'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadBanner(f);
                  e.target.value = '';
                }}
              />
            </label>
            {profile.banner_url && (
              <Button variant="secondary" onClick={() => void removeBanner()} disabled={uploading}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      <p className="-mt-4 mb-6 text-xs text-vulo-muted">Images up to 8 MB. GIFs play as animated banners.</p>

      <ErrorText>{error}</ErrorText>
      {saved && <p className="mb-3 rounded bg-vulo-green/10 px-3 py-2 text-sm text-vulo-green">Saved.</p>}

      <Field label="Custom status" hint="Shown under your name in the member list and on your profile card.">
        <input
          className={inputClass}
          value={customStatus}
          maxLength={128}
          placeholder="What are you up to?"
          onChange={(e) => setCustomStatus(e.target.value)}
        />
      </Field>
      <Button onClick={() => void saveStatus()}>Save status</Button>

      <div className="mt-8">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-vulo-muted">Profile color</p>
        <p className="mb-3 text-sm text-vulo-muted">Used for your banner when you have no banner image.</p>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            className="h-10 w-16 cursor-pointer rounded bg-vulo-rail p-1"
            aria-label="Profile color"
          />
          <Button onClick={() => void saveAccent(accent)} disabled={accentBusy}>
            Save color
          </Button>
          <Button variant="secondary" onClick={() => void saveAccent(null)} disabled={accentBusy}>
            Reset
          </Button>
        </div>
      </div>

      <div className="mt-8">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-vulo-muted">Badges</p>
        {badges.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {badges.map((b) => (
              <li key={b.id}>
                <BadgeIcon badge={b} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-vulo-muted">No badges yet. VuloChat grants badges to members.</p>
        )}
      </div>
    </Section>
  );
}

function DecorationTab() {
  const { profile, updateProfile } = useAuth();
  const decorations = useDecorations();
  const reasonFor = useLockReasons(profile?.id ?? null);
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
        {decorations.map((d) => {
          const reason = reasonFor(d);
          return (
            <DecorationOption
              key={d.id}
              label={d.name}
              hint={reason ?? (d.reacts_to_voice ? 'Reacts to voice' : d.animated ? 'Animated' : undefined)}
              selected={profile.decoration_id === d.id}
              disabled={pending || !!reason}
              onSelect={() => void choose(d.id)}
            >
              <Avatar profile={{ ...profile, decoration_id: d.id }} size="md" />
            </DecorationOption>
          );
        })}
      </div>
      {decorations.length === 0 && <p className="mt-3 text-sm text-vulo-muted">Decorations are loading…</p>}

      <div className="mt-8 rounded bg-vulo-side p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium text-vulo-bright">Upload your own decoration</p>
            <p className="text-sm text-vulo-muted">Coming soon. You will be able to add your own image here later.</p>
          </div>
          <Button variant="secondary" disabled>
            Coming soon
          </Button>
        </div>
      </div>
    </Section>
  );
}

function NameplateTab() {
  const { profile, updateProfile } = useAuth();
  const nameplates = useNameplates();
  const reasonFor = useLockReasons(profile?.id ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadNameplates();
  }, []);

  if (!profile) return null;

  const choose = async (id: string | null) => {
    if (pending || id === profile.nameplate_id) return;
    setPending(true);
    setError(null);
    try {
      await updateProfile({ nameplate_id: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setPending(false);
    }
  };

  const current = nameplates.find((n) => n.id === profile.nameplate_id);

  return (
    <Section title="Nameplate">
      <div className="relative mb-6 overflow-hidden rounded bg-vulo-side p-5">
        <NameplateBackdrop nameplateId={profile.nameplate_id} />
        <div className="relative flex items-center gap-5">
          <Avatar profile={profile} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-vulo-bright">{current ? current.name : 'No nameplate'}</p>
            <p className="text-sm text-vulo-muted">Shown behind your name in the member list and on your profile.</p>
          </div>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>

      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-vulo-muted">Choose a nameplate</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NameplateOption label="None" selected={!profile.nameplate_id} disabled={pending} onSelect={() => void choose(null)} />
        {nameplates.map((n) => {
          const reason = reasonFor(n);
          return (
            <NameplateOption
              key={n.id}
              label={n.name}
              src={nameplateSrc(n)}
              hint={reason ?? (n.animated ? 'Animated' : undefined)}
              selected={profile.nameplate_id === n.id}
              disabled={pending || !!reason}
              onSelect={() => void choose(n.id)}
            />
          );
        })}
      </div>
      {nameplates.length === 0 && <p className="mt-3 text-sm text-vulo-muted">Nameplates are loading…</p>}
    </Section>
  );
}

function NameplateOption({
  label,
  hint,
  src,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  hint?: string;
  src?: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex flex-col gap-2 rounded p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        selected ? 'bg-vulo-active ring-2 ring-vulo-accent' : 'bg-vulo-side hover:bg-vulo-hover'
      }`}
    >
      <span className="relative block h-14 w-full overflow-hidden rounded bg-vulo-chat">
        {src && <img src={src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />}
      </span>
      <span className="text-sm font-medium text-vulo-bright">{label}</span>
      {hint && <span className="text-xs text-vulo-muted">{hint}</span>}
    </button>
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

const CUSTOM_FIELDS: [keyof ThemeColors, string][] = [
  ['rail', 'Outer background'],
  ['side', 'Sidebar'],
  ['chat', 'Chat'],
  ['accent', 'Accent'],
  ['text', 'Text'],
];

function ThemeCard({
  label,
  colors,
  selected,
  onSelect,
}: {
  label: string;
  colors: ThemeColors;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col gap-2 rounded p-3 text-left transition ${
        selected ? 'bg-vulo-active ring-2 ring-vulo-accent' : 'bg-vulo-side hover:bg-vulo-hover'
      }`}
    >
      <span className="flex h-12 overflow-hidden rounded" aria-hidden="true">
        <span className="flex-1" style={{ background: colors.rail }} />
        <span className="flex-1" style={{ background: colors.side }} />
        <span className="flex-[2]" style={{ background: colors.chat }} />
        <span className="flex-1" style={{ background: colors.accent }} />
      </span>
      <span className="text-sm font-medium text-vulo-bright">{label}</span>
    </button>
  );
}

function AppearanceTab() {
  const s = useSettings();
  const presetIds = Object.keys(PRESETS) as PresetName[];
  return (
    <Section title="Appearance">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-vulo-muted">Theme</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {presetIds.map((id) => (
          <ThemeCard
            key={id}
            label={PRESETS[id].label}
            colors={PRESETS[id].colors}
            selected={s.theme === id}
            onSelect={() => updateSettings({ theme: id as ThemeName })}
          />
        ))}
        <ThemeCard
          label="Custom"
          colors={s.customTheme}
          selected={s.theme === 'custom'}
          onSelect={() => updateSettings({ theme: 'custom' })}
        />
      </div>

      {s.theme === 'custom' && (
        <div className="mb-6 rounded bg-vulo-side p-5">
          <p className="mb-3 text-sm text-vulo-muted">
            Pick five colors. The hover, line and muted shades are worked out from them.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {CUSTOM_FIELDS.map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 rounded bg-vulo-rail px-3 py-2 text-sm text-vulo-text">
                {label}
                <input
                  type="color"
                  value={s.customTheme[key]}
                  onChange={(e) => updateSettings({ customTheme: { ...s.customTheme, [key]: e.target.value } })}
                  className="h-8 w-12 cursor-pointer rounded bg-transparent"
                  aria-label={`${label} color`}
                />
              </label>
            ))}
          </div>
          <div className="mt-3">
            <Button variant="secondary" onClick={() => updateSettings({ customTheme: CUSTOM_DEFAULT })}>
              Reset custom colors
            </Button>
          </div>
        </div>
      )}

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
