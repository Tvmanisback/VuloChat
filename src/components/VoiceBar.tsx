import { useVoice } from '../lib/voiceContext';
import { Icon } from './icons';

export default function VoiceBar() {
  const voice = useVoice();
  if (!voice.active && !voice.error) return null;

  return (
    <div className="border-b border-vulo-rail bg-vulo-side px-3 py-2">
      {voice.error && (
        <div className="mb-2 flex items-start justify-between gap-2 rounded bg-vulo-red/10 px-2 py-1.5 text-xs text-vulo-red">
          <span>{voice.error}</span>
          <button onClick={voice.clearError} aria-label="Dismiss">
            <Icon name="x" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {voice.active && (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-xs font-semibold text-vulo-green">
              <span className="inline-block h-2 w-2 rounded-full bg-vulo-green" />
              Voice connected
            </p>
            <p className="truncate text-xs text-vulo-muted">{voice.active.channelName}</p>
          </div>
          <button
            onClick={voice.toggleMute}
            className="flex h-8 w-8 items-center justify-center rounded text-vulo-text hover:bg-vulo-hover"
            aria-label={voice.muted ? 'Unmute' : 'Mute'}
          >
            <Icon name={voice.muted ? 'micOff' : 'mic'} className="h-5 w-5" />
          </button>
          <button
            onClick={voice.toggleDeafen}
            className="flex h-8 w-8 items-center justify-center rounded text-vulo-text hover:bg-vulo-hover"
            aria-label={voice.deafened ? 'Undeafen' : 'Deafen'}
          >
            <Icon name={voice.deafened ? 'deafen' : 'headphones'} className="h-5 w-5" />
          </button>
          <button
            onClick={() => void voice.leave()}
            className="flex h-8 w-8 items-center justify-center rounded text-vulo-red hover:bg-vulo-hover"
            aria-label="Disconnect"
          >
            <Icon name="phoneOff" className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
