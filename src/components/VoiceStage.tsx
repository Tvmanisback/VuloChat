import type { Channel, MemberRow, Profile, VoiceState } from '../lib/types';
import { useVoice } from '../lib/voiceContext';
import { Icon } from './icons';
import { Avatar, Button } from './ui';

interface Props {
  channel: Channel;
  serverId: string;
  voiceStates: VoiceState[];
  members: MemberRow[];
  userId: string;
}

export default function VoiceStage({ channel, serverId, voiceStates, members, userId }: Props) {
  const voice = useVoice();
  const connected = voice.active?.channelId === channel.id;
  const occupants = voiceStates.filter((v) => v.channel_id === channel.id);
  const byId = new Map<string, Profile | null>(members.map((m) => [m.user_id, m.profiles] as const));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-vulo-chat">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-vulo-rail px-4 shadow-sm">
        <Icon name="speaker" className="h-6 w-6 text-vulo-muted" />
        <h2 className="font-semibold text-vulo-bright">{channel.name}</h2>
        <span className="ml-2 text-sm text-vulo-muted">{occupants.length} connected</span>
      </header>

      <div className="scroll-thin flex flex-1 flex-wrap content-start items-start justify-center gap-4 overflow-y-auto p-6">
        {occupants.length === 0 && (
          <p className="mt-10 text-center text-vulo-muted">Nobody is in this voice channel yet.</p>
        )}
        {occupants.map((v) => {
          const p = byId.get(v.user_id) ?? null;
          const speaking = !!voice.snapshot.speaking[v.user_id];
          const isMe = v.user_id === userId;
          return (
            <div
              key={v.user_id}
              className={`flex h-56 w-56 flex-col items-center justify-center rounded-lg bg-vulo-side transition ${
                speaking ? 'ring-2 ring-vulo-green' : ''
              }`}
            >
              <Avatar profile={p} size="lg" speaking={speaking} />
              <p className="mt-3 max-w-[90%] truncate font-semibold text-vulo-bright">
                {p?.display_name || p?.username || 'Unknown'}
                {isMe && <span className="ml-1 text-xs text-vulo-muted">(you)</span>}
              </p>
              <div className="mt-2 flex items-center gap-2 text-vulo-muted">
                {v.self_mute && <Icon name="micOff" className="h-4 w-4 text-vulo-red" />}
                {v.self_deafen && <Icon name="deafen" className="h-4 w-4 text-vulo-red" />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center gap-3 border-t border-vulo-rail p-4">
        {connected ? (
          <>
            <Button variant="secondary" onClick={voice.toggleMute}>
              <Icon name={voice.muted ? 'micOff' : 'mic'} className="mr-2 h-4 w-4" />
              {voice.muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button variant="secondary" onClick={voice.toggleDeafen}>
              <Icon name={voice.deafened ? 'deafen' : 'headphones'} className="mr-2 h-4 w-4" />
              {voice.deafened ? 'Undeafen' : 'Deafen'}
            </Button>
            <Button variant="danger" onClick={() => void voice.leave()}>
              <Icon name="phoneOff" className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          </>
        ) : (
          <Button onClick={() => void voice.join(serverId, channel.id, channel.name)}>
            <Icon name="speaker" className="mr-2 h-4 w-4" />
            Join voice
          </Button>
        )}
      </div>
    </div>
  );
}
