import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { attachmentLimitError, extractEmbeds, formatBytes, uploadAttachment } from '../lib/attachments';
import { useEmojis } from '../lib/emojis';
import { useStickers } from '../lib/stickers';
import { useDevice } from '../lib/device';
import { checkImage } from '../lib/moderation';
import type { Attachment, Embed } from '../lib/types';
import GifPicker from './GifPicker';
import { Icon } from './icons';

const EMOJIS = [
  '😀', '😂', '🥹', '😍', '😎', '🤔', '😭', '😡', '👍', '👎', '👏', '🙏',
  '🔥', '✨', '🎉', '💯', '❤️', '💜', '🤝', '👀', '🫡', '😴', '🤯', '🥳',
  '🎮', '🎧', '🚀', '🍕', '☕', '🌙', '⚡', '✅', '❌', '⚠️', '💡', '🙌',
];

// Supabase errors are plain objects, not Error instances, so their message is read directly.
function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return fallback;
}

type PickerTab = 'emoji' | 'gif' | 'sticker';

interface Props {
  userId: string;
  placeholder: string;
  disabled?: boolean;
  disabledReason?: string;
  onSend: (content: string, attachments: Attachment[], embeds: Embed[]) => Promise<void>;
  maxLength?: number;
  replyingTo?: { name: string; preview: string } | null;
  onCancelReply?: () => void;
}

export default function Composer({
  userId,
  placeholder,
  disabled,
  disabledReason,
  onSend,
  maxLength = 4000,
  replyingTo,
  onCancelReply,
}: Props) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<PickerTab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const customEmojis = useEmojis();
  const stickers = useStickers();
  // On phones, Enter starts a new line and the send button sends, as on most phone keyboards.
  const mobile = useDevice() === 'mobile';

  // While the picker is open, Escape or a click outside it closes it.
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPicker(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPicker(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [picker]);

  const canSend = !disabled && !busy && (text.trim().length > 0 || files.length > 0);

  const submit = async () => {
    if (!canSend) return;
    const content = text.trim();
    setBusy(true);
    setError(null);
    try {
      // Images are checked for explicit content before they are uploaded.
      const uploaded = await Promise.all(
        files.map(async (f) => {
          const verdict = await checkImage(f);
          if (!verdict.allowed) throw new Error(verdict.reason ?? `${f.name} was blocked.`);
          return uploadAttachment(userId, f);
        }),
      );
      await onSend(content, uploaded, extractEmbeds(content));
      setText('');
      setFiles([]);
      taRef.current?.focus();
    } catch (e) {
      setError(errorMessage(e, 'Message failed to send.'));
    } finally {
      setBusy(false);
    }
  };

  // A GIF or sticker is sent as a Markdown image, so it is stored as the message text and shows inline.
  const sendImage = async (label: string, url: string) => {
    setPicker(null);
    if (disabled || busy) return;
    // Parentheses and spaces would end the Markdown image early, so they are percent-encoded.
    // encodeURIComponent leaves ( ) alone, so they are replaced by hand.
    const safe = url.replace(/[()\s]/g, (c) => (c === '(' ? '%28' : c === ')' ? '%29' : '%20'));
    setBusy(true);
    setError(null);
    try {
      await onSend(`![${label}](${safe})`, [], []);
    } catch (e) {
      setError(errorMessage(e, `The ${label.toLowerCase()} failed to send.`));
    } finally {
      setBusy(false);
    }
  };

  const sendGif = (url: string) => sendImage('GIF', url);
  const sendSticker = (url: string) => sendImage('Sticker', url);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !mobile) {
      e.preventDefault();
      void submit();
    }
  };

  const insertText = (value: string) => {
    const ta = taRef.current;
    if (!ta) {
      setText((t) => t + value);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = text.slice(0, start) + value + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + value.length, start + value.length);
    });
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const problems = picked.map(attachmentLimitError).filter((p): p is string => p !== null);
    if (problems.length) setError(problems[0]);
    setFiles((prev) => [...prev, ...picked.filter((f) => attachmentLimitError(f) === null)].slice(0, 10));
  };

  const togglePicker = (tab: PickerTab) => setPicker((open) => (open === tab ? null : tab));

  return (
    <div className="relative px-4 pb-6 pt-1">
      {error && <p className="mb-2 rounded bg-vulo-red/10 px-3 py-1.5 text-sm text-vulo-red">{error}</p>}

      {replyingTo && (
        <div className="mb-1 flex items-center justify-between gap-2 rounded-t-lg bg-vulo-side px-3 py-2 text-sm text-vulo-muted">
          <span className="min-w-0 truncate">
            Replying to <span className="font-medium text-vulo-text">{replyingTo.name}</span> · {replyingTo.preview}
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="shrink-0 hover:text-vulo-text"
            aria-label="Cancel reply"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex max-w-xs items-center gap-2 rounded bg-vulo-side px-3 py-2 text-sm">
              <span className="truncate text-vulo-text">{f.name}</span>
              <span className="shrink-0 text-xs text-vulo-muted">{formatBytes(f.size)}</span>
              <button
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="shrink-0 text-vulo-muted hover:text-vulo-red"
                aria-label={`Remove ${f.name}`}
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={`flex items-end gap-2 rounded-lg bg-vulo-input px-3 py-2 ${disabled ? 'opacity-60' : ''}`}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="mb-1 rounded p-1 text-vulo-muted hover:text-vulo-text disabled:cursor-not-allowed"
          aria-label="Attach files"
          title="Attach files"
        >
          <Icon name="paperclip" className="h-5 w-5" />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, maxLength))}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
          placeholder={disabled ? disabledReason ?? 'You cannot send messages here.' : placeholder}
          className="scroll-thin max-h-60 min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[15px] text-vulo-text placeholder:text-vulo-muted outline-none"
          aria-label="Message"
        />

        {text.length > maxLength * 0.85 && <span className="mb-2 text-xs text-vulo-muted">{maxLength - text.length}</span>}

        {/* The emoji and GIF buttons share one panel with two tabs. */}
        <div ref={pickerRef} className="relative mb-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => togglePicker('gif')}
            disabled={disabled}
            className="rounded px-1 py-0.5 text-xs font-bold text-vulo-muted hover:text-vulo-text disabled:cursor-not-allowed"
            aria-label="Send a GIF"
            aria-expanded={picker === 'gif'}
            title="Send a GIF"
          >
            GIF
          </button>
          <button
            type="button"
            onClick={() => togglePicker('sticker')}
            disabled={disabled}
            className="rounded px-1 py-0.5 text-xs font-bold text-vulo-muted hover:text-vulo-text disabled:cursor-not-allowed"
            aria-label="Send a sticker"
            aria-expanded={picker === 'sticker'}
            title="Send a sticker"
          >
            Sticker
          </button>
          <button
            type="button"
            onClick={() => togglePicker('emoji')}
            disabled={disabled}
            className="rounded p-1 text-vulo-muted hover:text-vulo-text disabled:cursor-not-allowed"
            aria-label="Insert emoji"
            aria-expanded={picker === 'emoji'}
            title="Insert emoji"
          >
            <Icon name="smile" className="h-5 w-5" />
          </button>

          {picker && (
            <div
              role="dialog"
              aria-label="Emoji and GIF picker"
              className="absolute bottom-full right-0 z-30 mb-2 flex h-[480px] w-[440px] max-w-[calc(100vw-2rem)] flex-col rounded-lg bg-vulo-rail p-3 shadow-2xl"
            >
              <div role="tablist" aria-label="Picker tabs" className="mb-3 flex gap-1 rounded-md bg-vulo-side p-1">
                {(['emoji', 'gif', 'sticker'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={picker === tab}
                    onClick={() => setPicker(tab)}
                    className={`flex-1 rounded px-3 py-1.5 text-sm font-semibold transition ${
                      picker === tab ? 'bg-vulo-active text-vulo-bright' : 'text-vulo-muted hover:text-vulo-text'
                    }`}
                  >
                    {tab === 'emoji' ? 'Emojis' : tab === 'gif' ? 'GIFs' : 'Stickers'}
                  </button>
                ))}
              </div>

              {picker === 'emoji' ? (
                <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pr-1">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-vulo-muted">Standard</p>
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        className="flex h-10 items-center justify-center rounded text-2xl hover:bg-vulo-hover"
                        onClick={() => {
                          insertText(em);
                          setPicker(null);
                        }}
                        aria-label={`Insert ${em}`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>

                  <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-vulo-muted">Server emojis</p>
                  {customEmojis.length === 0 ? (
                    <p className="px-1 pb-1 text-sm text-vulo-muted">
                      No server emojis yet. Server owners and admins can add them in Server Settings → Emojis.
                    </p>
                  ) : (
                    <div className="grid grid-cols-8 gap-1">
                      {customEmojis.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className="flex h-10 items-center justify-center rounded hover:bg-vulo-hover"
                          title={`:${e.name}: from ${e.server_name}`}
                          aria-label={`Insert :${e.name}:`}
                          onClick={() => {
                            insertText(`:${e.name}:`);
                            setPicker(null);
                          }}
                        >
                          <img src={e.asset_url} alt="" loading="lazy" className="h-9 w-9 object-contain" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : picker === 'sticker' ? (
                <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pr-1">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-vulo-muted">Server stickers</p>
                  {stickers.length === 0 ? (
                    <p className="px-1 pb-1 text-sm text-vulo-muted">
                      No stickers yet. Server owners and admins can add them in Server Settings → Stickers.
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {stickers.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="flex aspect-square items-center justify-center rounded p-1 hover:bg-vulo-hover"
                          title={`${s.name} from ${s.server_name}`}
                          aria-label={`Send ${s.name} sticker`}
                          onClick={() => void sendSticker(s.asset_url)}
                        >
                          <img src={s.asset_url} alt="" loading="lazy" className="h-full w-full object-contain" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <GifPicker onPick={(url) => void sendGif(url)} />
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => void submit()}
          disabled={!canSend}
          className="mb-1 rounded p-1 text-vulo-accent transition hover:text-vulo-accentHover disabled:opacity-40"
          aria-label="Send message"
        >
          <Icon name="send" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
