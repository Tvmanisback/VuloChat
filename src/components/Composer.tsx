import { useRef, useState, type KeyboardEvent } from 'react';
import { extractEmbeds, formatBytes, MAX_ATTACHMENT_BYTES, uploadAttachment } from '../lib/attachments';
import { useEmojis } from '../lib/emojis';
import type { Attachment, Embed } from '../lib/types';
import GifPicker from './GifPicker';
import { Icon } from './icons';

const EMOJIS = [
  '😀', '😂', '🥹', '😍', '😎', '🤔', '😭', '😡', '👍', '👎', '👏', '🙏',
  '🔥', '✨', '🎉', '💯', '❤️', '💜', '🤝', '👀', '🫡', '😴', '🤯', '🥳',
  '🎮', '🎧', '🚀', '🍕', '☕', '🌙', '⚡', '✅', '❌', '⚠️', '💡', '🙌',
];

interface Props {
  userId: string;
  placeholder: string;
  disabled?: boolean;
  disabledReason?: string;
  onSend: (content: string, attachments: Attachment[], embeds: Embed[]) => Promise<void>;
  maxLength?: number;
}

export default function Composer({ userId, placeholder, disabled, disabledReason, onSend, maxLength = 4000 }: Props) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const customEmojis = useEmojis();

  const canSend = !disabled && !busy && (text.trim().length > 0 || files.length > 0);

  const submit = async () => {
    if (!canSend) return;
    const content = text.trim();
    setBusy(true);
    setError(null);
    try {
      const uploaded = await Promise.all(files.map((f) => uploadAttachment(userId, f)));
      await onSend(content, uploaded, extractEmbeds(content));
      setText('');
      setFiles([]);
      taRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Message failed to send.');
    } finally {
      setBusy(false);
    }
  };

  // A GIF is sent as a Markdown image, so it is stored as the message text and shows inline.
  const sendGif = async (url: string) => {
    if (disabled || busy) return;
    // Parentheses and spaces would end the Markdown image early, so they are percent-encoded.
    // encodeURIComponent leaves ( ) alone, so they are replaced by hand.
    const safe = url.replace(/[()\s]/g, (c) => (c === '(' ? '%28' : c === ')' ? '%29' : '%20'));
    setBusy(true);
    setError(null);
    try {
      await onSend(`![GIF](${safe})`, [], []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The GIF failed to send.');
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
    const tooBig = picked.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig) setError(`${tooBig.name} is larger than 25 MB.`);
    setFiles((prev) => [...prev, ...picked.filter((f) => f.size <= MAX_ATTACHMENT_BYTES)].slice(0, 10));
  };

  return (
    <div className="relative px-4 pb-6 pt-1">
      {error && <p className="mb-2 rounded bg-vulo-red/10 px-3 py-1.5 text-sm text-vulo-red">{error}</p>}

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
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

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

        {text.length > maxLength * 0.85 && (
          <span className="mb-2 text-xs text-vulo-muted">
            {maxLength - text.length}
          </span>
        )}

        <div className="relative">
          <button
            onClick={() => {
              setGifOpen((o) => !o);
              setEmojiOpen(false);
            }}
            disabled={disabled}
            className="mb-1 rounded px-1 py-0.5 text-xs font-bold text-vulo-muted hover:text-vulo-text disabled:cursor-not-allowed"
            aria-label="Send a GIF"
            aria-expanded={gifOpen}
            title="Send a GIF"
          >
            GIF
          </button>
          {gifOpen && (
            <GifPicker
              onPick={(url) => {
                setGifOpen(false);
                void sendGif(url);
              }}
              onClose={() => setGifOpen(false)}
            />
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => {
              setEmojiOpen((o) => !o);
              setGifOpen(false);
            }}
            disabled={disabled}
            className="mb-1 rounded p-1 text-vulo-muted hover:text-vulo-text disabled:cursor-not-allowed"
            aria-label="Insert emoji"
            aria-expanded={emojiOpen}
          >
            <Icon name="smile" className="h-5 w-5" />
          </button>
          {emojiOpen && (
            <div className="scroll-thin absolute bottom-10 right-0 z-30 max-h-80 w-72 overflow-y-auto rounded-md bg-vulo-rail p-2 shadow-xl">
              <div className="grid grid-cols-6 gap-1">
                {EMOJIS.map((em) => (
                  <button
                    key={em}
                    className="rounded p-1 text-xl hover:bg-vulo-hover"
                    onClick={() => {
                      insertText(em);
                      setEmojiOpen(false);
                    }}
                    aria-label={`Insert ${em}`}
                  >
                    {em}
                  </button>
                ))}
              </div>

              <p className="mb-1 mt-2 text-xs font-bold uppercase tracking-wide text-vulo-muted">Server emojis</p>
              {customEmojis.length === 0 ? (
                <p className="px-1 pb-1 text-xs text-vulo-muted">
                  No server emojis yet. Server owners and admins can add them in Server Settings.
                </p>
              ) : (
                <div className="grid grid-cols-6 gap-1">
                  {customEmojis.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="flex items-center justify-center rounded p-1 hover:bg-vulo-hover"
                      title={`:${e.name}: from ${e.server_name}`}
                      aria-label={`Insert :${e.name}:`}
                      onClick={() => {
                        insertText(`:${e.name}:`);
                        setEmojiOpen(false);
                      }}
                    >
                      <img src={e.asset_url} alt="" loading="lazy" className="h-7 w-7 object-contain" />
                    </button>
                  ))}
                </div>
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
