import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { expandEmojiShortcodes, useEmojis } from '../lib/emojis';

// Raw HTML is not rendered (react-markdown escapes it by default), and react-markdown
// blocks javascript: and other unsafe URL schemes.
export default function Markdown({ text, serverId }: { text: string; serverId?: string }) {
  // Subscribing re-renders this message when the emoji list changes, so emoji appear as soon as they load.
  const emojis = useEmojis();
  const emojiUrls = new Set(emojis.map((e) => e.asset_url));
  const source = expandEmojiShortcodes(text, serverId);

  return (
    <div className="markdown break-words text-vulo-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer nofollow" className="text-[#00a8fc] hover:underline" />
          ),
          img: ({ node: _node, ...props }) => {
            const isEmoji = typeof props.src === 'string' && emojiUrls.has(props.src);
            return (
              <img
                {...props}
                alt={props.alt ?? ''}
                loading="lazy"
                referrerPolicy="no-referrer"
                className={isEmoji ? 'emoji' : 'msg-image'}
              />
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
