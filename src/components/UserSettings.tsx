import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { loadDecorations, TINT_SUPPORTED, useDecorations } from '../lib/decorations';
import { loadNameplates, nameplateSrc, useNameplates } from '../lib/nameplates';
import { loadProfileDecorations, profileDecorationSrc, useProfileDecorations } from '../lib/profileDecorations';
import { useLockReasons } from '../lib/cosmetics';
import { useProfileBadges } from '../lib/badges';
import { bannerBackground } from '../lib/banner';
import { updateSettings, useSettings, type Keybinds } from '../lib/settings';
import { Avatar, Button, ErrorText, Field, Modal, inputClass } from './ui';
import BadgeIcon from './BadgeIcon';
import NameplateBackdrop from './Nameplate';
import ProfileDecorationOverlay from './ProfileDecoration';
import { CUSTOM_DEFAULT, PRESETS, type PresetName, type ThemeColors, type ThemeName } from '../lib/themes';

type Tab = 'account' | 'profile' | 'decorations' | 'connections' | 'appearance' | 'accessibility' | 'notifications' | 'voice' | 'keybinds';
type DecorationSection = 'avatar' | 'nameplate' | 'profile';

const GROUPS: { title: string; tabs: { id: Tab; label: string }[] }[] = [
  {
    title: 'User settings',
    tabs: [
      { id: 'account', label: 'My Account' },
      { id: 'profile', label: 'Profile' },
      { id: 'decorations', label: 'Decorations' },
      { id: 'connections', label: 'Connections' },
    ],
  },
  {
    title: 'App settings',
    tabs: [
      { id: 'appearance', label: 'Appearance' },
      { id: 'accessibility', label: 'Accessibility' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'voice', label: 'Voice & Video' },
      { id: 'keybinds', label: 'Keybinds' },
    ],
  },
];

const DECORATION_SECTIONS: { id: DecorationSection; label: string }[] = [
  { id: 'avatar', label: 'Avatar' },
  { id: 'nameplate', label: 'Nameplate' },
  { id: 'profile', label: 'Profile card' },
];

// The terms, privacy, facts and FAQ live on their own page, so these links open it in a new tab.
const HELP_LINKS: { label: string; hash: string }[] = [
  { label: 'Terms of Service', hash: 'terms' },
  { label: 'Privacy Policy', hash: 'privacy' },
  { label: 'Facts', hash: 'facts' },
  { label: 'FAQ', hash: 'faq' },
];

export default function UserSettings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('account');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const navClass = (active: boolean) =>
    `block w-full rounded px-2 py-1.5 text-left text-[15px] ${
      active ? 'bg-vulo-active text-vulo-bright' : 'text-vulo-muted hover:bg-vulo-hover hover:text-vulo-text'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex bg-vulo-chat" role="dialog" aria-modal="true" aria-label="User settings">
      <nav className="scroll-thin flex w-64 shrink-0 justify-end overflow-y-auto bg-vulo-side px-4 py-16">
        <div className="w-44">
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-5">
              <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-vulo-muted">{g.title}</p>
              <div className="space-y-0.5">
                {g.tabs.map((t) => (
                  <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined} className={navClass(tab === t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="mb-5">
            <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-vulo-muted">Help</p>
            <div className="space-y-0.5">
              {HELP_LINKS.map((l) => (
                <a
                  key={l.hash}
                  href={`${import.meta.env.BASE_URL}info.html#${l.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded px-2 py-1.5 text-left text-[15px] text-vulo-muted hover:bg-vulo-hover hover:text-vulo-text"
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>

          <div className="my-3 h-px bg-vulo-line" />
          <LogoutButton />
        </div>
      </nav>

      <div className="scroll-thin flex-1 overflow-y-auto px-10 py-16">
        <div className="mx-auto max-w-2xl">
          {tab === 'account' && <AccountTab />}
          {tab === 'profile' && <ProfileTab />}
          {tab === 'decorations' && <DecorationsTab />}
          {tab === 'connections' && <ConnectionsTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'accessibility' && <AccessibilityTab />}
          {tab === 'notifications' && <NotificationsTab />}
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
        <DeleteAccount />
      </Section>
    </>
  );
}

// Deleting the account is permanent, so the user must type their username to confirm it.
function DeleteAccount() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) return null;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setError(null);
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    const { error: fnErr } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (fnErr) {
      let message = 'Could not delete your account. Try again.';
      const response = (fnErr as { context?: unknown }).context;
      if (response instanceof Response) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (body?.error) message = body.error;
      }
      setError(message);
      setBusy(false);
      return;
    }
    // The account is gone, so end this session on this device. The app then returns to the login screen.
    await supabase.auth.signOut({ scope: 'local' });
  };

  return (
    <div className="mt-12 rounded border border-vulo-red/40 p-5">
      <p className="font-medium text-vulo-bright">Delete account</p>
      <p className="mb-3 mt-1 text-sm text-vulo-muted">
        Permanently removes your profile, messages, direct messages, friends and the files you uploaded. This cannot be undone.
        Delete any servers you own first.
      </p>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete my account
      </Button>

      {open && (
        <Modal
          title="Delete your account?"
          onClose={close}
          footer={
            <>
              <Button variant="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void remove()} disabled={typed !== profile.username || busy}>
                {busy ? 'Deleting…' : 'Delete account'}
              </Button>
            </>
          }
        >
          <p className="mb-4 text-sm text-vulo-text">
            This is permanent. To confirm, type your username: <strong className="text-vulo-bright">{profile.username}</strong>
          </p>
          <ErrorText>{error}</ErrorText>
          <Field label="Username">
            <input className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
        </Modal>
      )}
    </div>
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
  const [visibleBadges, setVisibleBadges] = useState<string[]>(profile?.visible_badge_ids ?? []);
  const [savingBadges, setSavingBadges] = useState(false);

  useEffect(() => {
    setVisibleBadges(profile?.visible_badge_ids ?? []);
  }, [profile?.id, profile?.visible_badge_ids?.join(',')]);

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
        <p className="mb-3 text-sm text-vulo-muted">Used for your banner when you have no banner image, and for tinted decorations.</p>
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
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-vulo-muted">Badges shown in chat</p>
        <p className="mb-3 text-sm text-vulo-muted">Choose which of your earned badges appear beside your name when you send messages. Your full badge collection remains visible on your profile.</p>
        {badges.length > 0 ? (
          <div className="space-y-2">
            {badges.map((b) => {
              const checked = visibleBadges.includes(b.id);
              return (
                <label key={b.id} className="flex cursor-pointer items-center gap-3 rounded-lg bg-vulo-side px-3 py-3 hover:bg-vulo-hover">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#7c5cff]"
                    checked={checked}
                    disabled={savingBadges}
                    onChange={async (e) => {
                      const next = e.target.checked
                        ? [...visibleBadges, b.id]
                        : visibleBadges.filter((id) => id !== b.id);
                      setVisibleBadges(next);
                      setSavingBadges(true);
                      setError(null);
                      try {
                        await updateProfile({ visible_badge_ids: next });
                      } catch (err) {
                        setVisibleBadges(visibleBadges);
                        setError(err instanceof Error ? err.message : 'Could not save badge visibility.');
                      } finally {
                        setSavingBadges(false);
                      }
                    }}
                  />
                  <BadgeIcon badge={b} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-vulo-bright">{b.name}</span>
                    {b.description && <span className="block text-xs text-vulo-muted">{b.description}</span>}
                  </span>
                  <span className="text-xs text-vulo-muted">{checked ? 'Shown' : 'Hidden'}</span>
                </label>
              );
            })}
            {savingBadges && <p className="text-xs text-vulo-muted">Saving badge preferences…</p>}
          </div>
        ) : (
          <p className="text-sm text-vulo-muted">No badges yet. VuloChat grants badges to members.</p>
        )}
      </div>
    </Section>
  );
}

// Every decoration type lives under this one tab. Each sub-tab picks one kind.
function DecorationsTab() {
  const [section, setSection] = useState<DecorationSection>('avatar');

  return (
    <Section title="Decorations">
      <p className="mb-4 text-sm text-vulo-muted">
        Artwork you can put around your picture, behind your name, and across your profile card. Some are locked to a badge, and some end on a set date.
      </p>
      <div role="tablist" aria-label="Decoration type" className="mb-6 flex gap-1 rounded bg-vulo-side p-1">
        {DECORATION_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition ${
              section === s.id ? 'bg-vulo-active text-vulo-bright' : 'text-vulo-muted hover:text-vulo-text'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'avatar' && <AvatarDecorations />}
      {section === 'nameplate' && <NameplateDecorations />}
      {section === 'profile' && <ProfileDecorations />}
    </Section>
  );
}

function AvatarDecorations() {
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
    <>
      <div className="mb-6 flex items-center gap-5 rounded bg-vulo-side p-5">
        <Avatar profile={profile} size="lg" forceDecoration />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-vulo-bright">{current ? current.name : 'No decoration'}</p>
          <p className="text-sm text-vulo-muted">Shown around your avatar everywhere you appear.</p>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>

      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-vulo-muted">Choose a decoration</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <DecorationOption label="None" selected={!profile.decoration_id} disabled={pending} onSelect={() => void choose(null)}>
          <Avatar profile={{ ...profile, decoration_id: null }} size="md" forceDecoration />
        </DecorationOption>
        {decorations.map((d) => {
          const reason = reasonFor(d);
          return (
            <DecorationOption
              key={d.id}
              label={d.name}
              hint={reason ?? (d.reacts_to_voice ? 'Reacts to voice' : d.animated ? 'Animated' : d.tintable && TINT_SUPPORTED ? 'Takes your accent colour' : undefined)}
              selected={profile.decoration_id === d.id}
              disabled={pending || !!reason}
              onSelect={() => void choose(d.id)}
            >
              <Avatar profile={{ ...profile, decoration_id: d.id }} size="md" forceDecoration />
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
    </>
  );
}

function NameplateDecorations() {
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
    <>
      <div className="relative mb-6 overflow-hidden rounded bg-vulo-side p-5">
        <NameplateBackdrop nameplateId={profile.nameplate_id} />
        <div className="relative flex items-center gap-5">
          <Avatar profile={profile} size="lg" forceDecoration />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-vulo-bright">{current ? current.name : 'No nameplate'}</p>
            <p className="text-sm text-vulo-muted">Shown behind your name in the member list and on your profile.</p>
          </div>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>

      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-vulo-muted">Choose a nameplate</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ArtOption label="None" selected={!profile.nameplate_id} disabled={pending} onSelect={() => void choose(null)} />
        {nameplates.map((n) => {
          const reason = reasonFor(n);
          return (
            <ArtOption
              key={n.id}
              label={n.name}
              hint={reason ?? (n.animated ? 'Animated' : undefined)}
              selected={profile.nameplate_id === n.id}
              disabled={pending || !!reason}
              onSelect={() => void choose(n.id)}
            >
              <img src={nameplateSrc(n)} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
            </ArtOption>
          );
        })}
      </div>
      {nameplates.length === 0 && <p className="mt-3 text-sm text-vulo-muted">Nameplates are loading…</p>}
    </>
  );
}

function ProfileDecorations() {
  const { profile, updateProfile } = useAuth();
  const items = useProfileDecorations();
  const reasonFor = useLockReasons(profile?.id ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadProfileDecorations();
  }, []);

  if (!profile) return null;

  const choose = async (id: string | null) => {
    if (pending || id === profile.profile_decoration_id) return;
    setPending(true);
    setError(null);
    try {
      await updateProfile({ profile_decoration_id: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setPending(false);
    }
  };

  const current = items.find((d) => d.id === profile.profile_decoration_id);

  return (
    <>
      <div className="mb-6 overflow-hidden rounded-lg bg-vulo-side">
        <div className="relative h-28" style={{ background: bannerBackground(profile.accent_color) }}>
          <ProfileDecorationOverlay decorationId={profile.profile_decoration_id} forceDecoration />
        </div>
        <div className="p-4">
          <p className="text-lg font-semibold text-vulo-bright">{current ? current.name : 'No profile decoration'}</p>
          <p className="text-sm text-vulo-muted">Drawn across the banner of your profile card.</p>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>

      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-vulo-muted">Choose a profile decoration</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ArtOption label="None" selected={!profile.profile_decoration_id} disabled={pending} onSelect={() => void choose(null)}>
          <span className="absolute inset-0" style={{ background: bannerBackground(profile.accent_color) }} />
        </ArtOption>
        {items.map((d) => {
          const reason = reasonFor(d);
          return (
            <ArtOption
              key={d.id}
              label={d.name}
              hint={reason ?? (d.animated ? 'Animated' : undefined)}
              selected={profile.profile_decoration_id === d.id}
              disabled={pending || !!reason}
              onSelect={() => void choose(d.id)}
            >
              <span className="absolute inset-0" style={{ background: bannerBackground(profile.accent_color) }} />
              <img src={profileDecorationSrc(d)} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
            </ArtOption>
          );
        })}
      </div>
      {items.length === 0 && <p className="mt-3 text-sm text-vulo-muted">Profile decorations are loading…</p>}
    </>
  );
}

function ArtOption({
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
  /** The artwork preview. Leave it out for the None option. */
  children?: ReactNode;
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
      <span className="relative block h-16 w-full overflow-hidden rounded bg-vulo-chat">{children}</span>
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
      <Toggle
        label="Show link and image previews"
        hint="Turn off to hide previews under messages. The links still work."
        checked={s.showLinkPreviews}
        onChange={(v) => updateSettings({ showLinkPreviews: v })}
      />
    </Section>
  );
}

function AccessibilityTab() {
  const s = useSettings();
  return (
    <Section title="Accessibility">
      <Field label={`Text size — ${s.textScale}%`} hint="Scales most text in VuloChat, up to 130% of the default.">
        <input
          type="range"
          min={90}
          max={130}
          step={5}
          value={s.textScale}
          onChange={(e) => updateSettings({ textScale: Number(e.target.value) })}
          className="w-full accent-[#7c5cff]"
        />
      </Field>
      <Toggle
        label="Reduce motion"
        hint="Stops animations, transitions and the pulsing voice effects. Animated artwork in decorations keeps moving."
        checked={s.reduceMotion}
        onChange={(v) => updateSettings({ reduceMotion: v })}
      />
      <Toggle
        label="Show decorations"
        hint="Off hides avatar, nameplate and profile decorations on your screen. Other people still see theirs."
        checked={s.showDecorations}
        onChange={(v) => updateSettings({ showDecorations: v })}
      />
    </Section>
  );
}

function NotificationsTab() {
  const s = useSettings();
  return (
    <Section title="Notifications">
      <Toggle
        label="Desktop notifications"
        hint="Show a notification for new messages and direct messages while VuloChat is in the background."
        checked={s.desktopNotifications}
        onChange={(v) => updateSettings({ desktopNotifications: v })}
      />
      <p className="text-sm text-vulo-muted">
        Your browser asks for permission the first time this is on. Turn it off here at any time to stop notifications from VuloChat.
      </p>
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

function ConnectionsTab() {
  const [items, setItems] = useState<{provider:string;display_name:string|null}[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = async () => { const {data,error}=await supabase.functions.invoke('connections',{body:{action:'status'}}); if(error) setError('Could not load connections.'); else setItems(data?.connections||[]); };
  useEffect(()=>{
    void load();
    const timer=window.setInterval(async()=>{
      await supabase.functions.invoke('connections',{body:{action:'refresh_spotify'}});
      await supabase.functions.invoke('connections',{body:{action:'refresh_steam'}});
      void load();
    },60000);
    return ()=>window.clearInterval(timer);
  },[]);
  const connect = async (provider:'spotify'|'steam') => { setBusy(provider); setError(''); const {data,error}=await supabase.functions.invoke('connections',{body:{action:provider==='spotify'?'connect_spotify':'connect_steam'}}); if(error||!data?.url){setError(data?.error==='spotify_not_configured'?'Spotify credentials have not been added to Supabase yet.':'Could not start connection.');setBusy('');return;} location.assign(data.url); };
  const disconnect = async (provider:'spotify'|'steam') => { setBusy(provider); const {error}=await supabase.functions.invoke('connections',{body:{action:'disconnect',provider}}); if(error)setError('Could not disconnect.'); else await load(); setBusy(''); };
  const has=(provider:string)=>items.some(x=>x.provider===provider);
  return <Section title="Connections">
    <p className="mb-5 text-sm text-vulo-muted">Connect Spotify to show your currently playing track. Steam integration is coming soon.</p>
    {(['spotify','steam'] as const).map(provider=><div key={provider} className="mb-4 rounded-lg bg-vulo-side p-4">
      <div className="mb-3 flex items-center justify-between"><span className="font-semibold capitalize text-vulo-bright">{provider}</span><span className="text-xs text-vulo-muted">{has(provider)?'Connected':'Not connected'}</span></div>
      {provider==='steam' ? <span className="inline-flex rounded bg-vulo-rail px-3 py-2 text-sm font-semibold text-vulo-muted">Coming soon</span> : has(provider)?<Button variant="secondary" disabled={!!busy} onClick={()=>void disconnect(provider)}>Disconnect {provider}</Button>:<Button disabled={!!busy} onClick={()=>void connect(provider)}>{busy===provider?'Connecting…':'Connect '+provider}</Button>}
    </div>)}
    <ErrorText>{error}</ErrorText>
    <p className="mt-4 text-xs text-vulo-muted">Activity refreshes about once per minute while VuloChat is open. Steam game activity requires a Steam Web API key and a public Game details setting on your Steam profile. Disconnect at any time.</p>
  </Section>;
}
