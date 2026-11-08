import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Raw HTML is not rendered (react-markdown escapes it by default), and react-markdown
// blocks javascript: and other unsafe URL schemes.
export default function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown break-words text-vulo-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer nofollow" className="text-[#00a8fc] hover:underline" />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
