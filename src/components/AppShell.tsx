import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useServerData } from '../lib/useServer';
import { useVoice } from '../lib/voiceContext';
import { getSettings, useSettings } from '../lib/settings';
import type { DirectMessage, Message, Profile, Server } from '../lib/types';
import { hasPerm, PERM } from '../lib/permissions';
import DesktopTitlebar from './DesktopTitlebar';
import ServerRail from './ServerRail';
import ChannelSidebar from './ChannelSidebar';
import ChatView from './ChatView';
import VoiceStage from './VoiceStage';
import MemberList from './MemberList';
import { HomeMain, HomeSidebar, useFriends } from './HomeView';
import UserSettings from './UserSettings';
import ProfileCard from './ProfileCard';
import ServerSettings from './ServerSettings';
import { CreateChannelModal, CreateServerModal, InviteModal, JoinServerModal } from './ServerModals';
import { Icon } from './icons';
import { Splash } from './ui';

type ModalState =
  | null
  | { kind: 'createServer' }
  | { kind: 'joinServer' }
  | { kind: 'invite' }
  | { kind: 'serverSettings' }
  | { kind: 'userSettings' }
  | { kind: 'createChannel'; parentId: string | null };

const LAST_SERVER_KEY = 'vulochat.lastServer';
const IDLE_MS = 5 * 60 * 1000;

export default function AppShell() {
  const { profile, session, setStatus } = useAuth();
  const uid = session?.user.id ?? '';
  const settings = useSettings();
  const voice = useVoice();

  const [servers, setServers] = useState<Server[]>([]);
  const [serversLoaded, setServersLoaded] = useState(false);
  const [activeServerId, setActiveServerId] = useState<string | null>(() => localStorage.getItem(LAST_SERVER_KEY));
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [dmUserId, setDmUserId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [profileCard, setProfileCard] = useState<Profile | null>(null);

  const data = useServerData(activeServerId, uid);
  const friends = useFriends(uid);

  const selectServer = useCallback((id: string | null) => {
    setActiveServerId(id);
    setActiveChannelId(null);
    setDrawer(false);
    if (id) localStorage.setItem(LAST_SERVER_KEY, id);
  }, []);

  // ---- server list (live) ----

  const loadServers = useCallback(async () => {
    if (!uid) return;
    const { data: rows } = await supabase.from('server_members').select('servers(*)').eq('user_id', uid);
    const list = ((rows ?? []) as unknown as { servers: Server | null }[])
      .map((r) => r.servers)
      .filter((s): s is Server => !!s)
      .sort((a, b) => a.name.localeCompare(b.name));
    setServers(list);
    setServersLoaded(true);
  }, [uid]);

  useEffect(() => {
    void loadServers();
    const ch = supabase
      .channel(`my-servers:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members', filter: `user_id=eq.${uid}` }, () => void loadServers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, () => void loadServers())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [uid, loadServers]);

  // If we were removed from the last-opened server, fall back to Home.
  useEffect(() => {
    if (serversLoaded && activeServerId && !servers.some((s) => s.id === activeServerId)) {
      selectServer(null);
    }
  }, [servers, serversLoaded, activeServerId, selectServer]);

  // Pick the first usable channel when a server opens.
  useEffect(() => {
    if (!activeServerId || data.loading) return;
    const usable = data.channels.filter((c) => c.type !== 'category');
    if (usable.length === 0) return;
    if (!activeChannelId || !usable.some((c) => c.id === activeChannelId)) {
      setActiveChannelId((usable.find((c) => c.type === 'text') ?? usable[0]).id);
    }
  }, [data.channels, data.loading, activeServerId, activeChannelId]);

  // ---- presence: online on sign-in, idle after 5 minutes without input ----

  const statusRef = useRef(profile?.status ?? 'offline');
  statusRef.current = profile?.status ?? 'offline';
  const setStatusRef = useRef(setStatus);
  setStatusRef.current = setStatus;

  useEffect(() => {
    if (!uid) return;
    if (statusRef.current === 'offline') void setStatusRef.current('online');
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (statusRef.current === 'online') void setStatusRef.current('idle');
      }, IDLE_MS);
    };
    const activity = () => {
      if (statusRef.current === 'idle') void setStatusRef.current('online');
      arm();
    };
    const events = ['pointerdown', 'keydown', 'mousemove', 'touchstart'] as const;
    events.forEach((ev) => window.addEventListener(ev, activity, { passive: true }));
    arm();
    return () => {
      window.clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, activity));
    };
  }, [uid]);

  // ---- notifications for new messages and DMs while the app is in the background ----

  useEffect(() => {
    if (!uid) return;
    if (settings.desktopNotifications && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    const nameOf = async (id: string) => {
      const { data: p } = await supabase.from('profiles').select('display_name, username').eq('id', id).maybeSingle();
      return (p?.display_name as string | undefined) || (p?.username as string | undefined) || 'Someone';
    };
    const notify = (title: string, body: string) => {
      if (!getSettings().desktopNotifications) return;
      const focused = document.visibilityState === 'visible' && document.hasFocus();
      if (focused) return;
      if (window.vulo?.isDesktop) {
        window.vulo.notify(title, body);
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, tag: 'vulochat' });
      }
    };
    const ch = supabase
      .channel(`notify:${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, async (p) => {
        const row = p.new as DirectMessage;
        if (row.sender_id === uid) return;
        notify(await nameOf(row.sender_id), row.content || 'Sent an attachment');
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (p) => {
        const row = p.new as Message;
        if (row.author_id === uid) return;
        notify(`${await nameOf(row.author_id)} · VuloChat`, row.content || 'Sent an attachment');
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [uid, settings.desktopNotifications]);

  // ---- Android: hardware back button and status bar ----

  const backRef = useRef<() => boolean>(() => false);
  backRef.current = () => {
    if (modal) {
      setModal(null);
      return true;
    }
    if (drawer) {
      setDrawer(false);
      return true;
    }
    if (activeServerId) {
      selectServer(null);
      return true;
    }
    return false;
  };

  useEffect(() => {
    const native = window.Capacitor?.Plugins;
    native?.StatusBar?.setBackgroundColor?.({ color: '#1e1f22' });
    native?.StatusBar?.setStyle?.({ style: 'DARK' });
    const App = native?.App;
    if (!App) return;
    App.addListener('backButton', () => {
      if (!backRef.current()) App.minimizeApp?.();
    });
  }, []);

  // ---- derived view state ----

  const homeMode = activeServerId === null;
  const activeChannel = data.channels.find((c) => c.id === activeChannelId) ?? null;
  const perms = data.perms;
  const canInvite = hasPerm(perms, PERM.CREATE_INVITE);
  const categories = data.channels.filter((c) => c.type === 'category');

  const leaveServer = async () => {
    if (!activeServerId || !uid) return;
    if (!window.confirm(`Leave ${data.server?.name ?? 'this server'}?`)) return;
    await supabase.from('server_members').delete().eq('server_id', activeServerId).eq('user_id', uid);
    selectServer(null);
    void loadServers();
  };

  let sidebar;
  if (homeMode) {
    sidebar = (
      <HomeSidebar
        friends={friends}
        selectedDm={dmUserId}
        onFriends={() => {
          setDmUserId(null);
          setDrawer(false);
        }}
        onDm={(id) => {
          setDmUserId(id);
          setDrawer(false);
        }}
        onOpenUserSettings={() => setModal({ kind: 'userSettings' })}
      />
    );
  } else if (data.server) {
    sidebar = (
      <ChannelSidebar
        server={data.server}
        channels={data.channels}
        voiceStates={data.voiceStates}
        members={data.members}
        perms={perms}
        isOwner={data.isOwner}
        activeChannelId={activeChannelId}
        onSelectChannel={(c) => {
          setActiveChannelId(c.id);
          setDrawer(false);
        }}
        onCreateChannel={(parentId) => setModal({ kind: 'createChannel', parentId })}
        onInvite={() => setModal({ kind: 'invite' })}
        onServerSettings={() => setModal({ kind: 'serverSettings' })}
        onLeaveServer={() => void leaveServer()}
        onOpenUserSettings={() => setModal({ kind: 'userSettings' })}
      />
    );
  } else {
    sidebar = <aside className="w-60 shrink-0 bg-vulo-side" aria-busy="true" />;
  }

  let content;
  if (homeMode) {
    content = <HomeMain userId={uid} friends={friends} selectedDm={dmUserId} onDm={(id) => setDmUserId(id)} />;
  } else if (!data.server) {
    content = <Splash label="Opening server…" />;
  } else if (!activeChannel) {
    content = (
      <div className="flex flex-1 items-center justify-center bg-vulo-chat p-8 text-center text-vulo-muted">
        {data.channels.length === 0 ? (
          <div>
            <p className="mb-3">This server has no channels yet.</p>
            {hasPerm(perms, PERM.MANAGE_CHANNELS) && (
              <button className="text-[#00a8fc] hover:underline" onClick={() => setModal({ kind: 'createChannel', parentId: null })}>
                Create a channel
              </button>
            )}
          </div>
        ) : (
          <p>Pick a channel to start talking.</p>
        )}
      </div>
    );
  } else if (activeChannel.type === 'voice') {
    content = (
      <VoiceStage
        channel={activeChannel}
        serverId={data.server.id}
        voiceStates={data.voiceStates}
        members={data.members}
        userId={uid}
      />
    );
  } else {
    content = (
      <ChatView
        key={activeChannel.id}
        channel={activeChannel}
        userId={uid}
        perms={perms}
        members={data.members}
        myDisplayName={profile?.display_name || profile?.username || ''}
        onOpenProfile={setProfileCard}
      />
    );
  }

  const mobileTitle = homeMode
    ? dmUserId
      ? 'Direct message'
      : 'Friends'
    : activeChannel
      ? activeChannel.name
      : data.server?.name ?? '';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-vulo-chat">
      <DesktopTitlebar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <div
        className={`fixed inset-y-0 left-0 z-40 flex transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          drawer ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <ServerRail
          servers={servers}
          activeServerId={activeServerId}
          onHome={() => selectServer(null)}
          onSelect={(id) => selectServer(id)}
          onCreate={() => setModal({ kind: 'createServer' })}
          onJoin={() => setModal({ kind: 'joinServer' })}
        />
        {sidebar}
      </div>
      {drawer && (
        <button className="fixed inset-0 z-30 cursor-default bg-black/50 md:hidden" aria-label="Close menu" onClick={() => setDrawer(false)} />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-vulo-rail bg-vulo-chat px-3 md:hidden">
          <button onClick={() => setDrawer(true)} className="rounded p-1.5 text-vulo-text hover:bg-vulo-hover" aria-label="Open menu">
            <Icon name="menu" className="h-6 w-6" />
          </button>
          <span className="truncate font-semibold text-vulo-bright">{mobileTitle}</span>
          {!homeMode && canInvite && (
            <button onClick={() => setModal({ kind: 'invite' })} className="ml-auto rounded p-1.5 text-vulo-text hover:bg-vulo-hover" aria-label="Invite people">
              <Icon name="userPlus" className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="flex min-h-0 flex-1">{content}</div>
      </main>

      {!homeMode && data.server && activeChannel?.type !== 'voice' && (
        <MemberList
          members={data.members}
          roles={data.roles}
          memberRoles={data.memberRoles}
          ownerId={data.server.owner_id}
          onOpenProfile={setProfileCard}
        />
      )}

      {modal?.kind === 'createServer' && (
        <CreateServerModal
          onClose={() => setModal(null)}
          onCreated={(id) => {
            setModal(null);
            void loadServers().then(() => selectServer(id));
          }}
        />
      )}
      {modal?.kind === 'joinServer' && (
        <JoinServerModal
          onClose={() => setModal(null)}
          onJoined={(id) => {
            setModal(null);
            void loadServers().then(() => selectServer(id));
          }}
        />
      )}
      {modal?.kind === 'invite' && data.server && (
        <InviteModal serverId={data.server.id} userId={uid} serverName={data.server.name} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'createChannel' && activeServerId && (
        <CreateChannelModal
          serverId={activeServerId}
          parentId={modal.parentId}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          onClose={() => setModal(null)}
          onCreated={() => setModal(null)}
        />
      )}
      {modal?.kind === 'serverSettings' && data.server && (
        <ServerSettings
          data={data}
          userId={uid}
          onClose={() => setModal(null)}
          onLeftOrDeleted={() => {
            setModal(null);
            selectServer(null);
            void loadServers();
          }}
        />
      )}
      {modal?.kind === 'userSettings' && <UserSettings onClose={() => setModal(null)} />}
      {profileCard && <ProfileCard profile={profileCard} onClose={() => setProfileCard(null)} />}

      {/* The voice bar lives in the sidebar; if voice drops unexpectedly we still want the user to know. */}
      <span className="sr-only" aria-live="polite">
        {voice.active ? `Connected to ${voice.active.channelName}` : ''}
      </span>
      </div>
    </div>
  );
}
