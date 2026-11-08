import { useEffect, useRef, useState } from 'react';
import { searchGifs, type GifResult } from '../lib/klipy';

/** GIF search panel. An empty search shows trending GIFs. Picking a GIF calls onPick with its image URL. */
export default function GifPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Wait a moment after typing, and ignore responses to searches that have since changed.
  useEffect(() => {
    const run = ++latest.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      searchGifs(query)
        .then((list) => {
          if (run === latest.current) setGifs(list);
        })
        .catch((e: unknown) => {
          if (run === latest.current) setError(e instanceof Error ? e.message : 'GIFs are unavailable right now.');
        })
        .finally(() => {
          if (run === latest.current) setLoading(false);
        });
    }, query.trim() ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div role="dialog" aria-label="GIF search" className="absolute bottom-12 right-0 z-30 flex h-96 w-[340px] flex-col rounded-md bg-vulo-rail p-2 shadow-xl">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search GIFs"
        aria-label="Search GIFs"
        className="mb-2 rounded bg-vulo-input px-3 py-2 text-sm text-vulo-text placeholder:text-vulo-muted outline-none focus:ring-2 focus:ring-vulo-accent"
      />

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {error && <p className="px-2 py-2 text-sm text-vulo-red">{error}</p>}
        {!error && loading && gifs.length === 0 && <p className="px-2 py-2 text-sm text-vulo-muted">Loading GIFs…</p>}
        {!error && !loading && gifs.length === 0 && <p className="px-2 py-2 text-sm text-vulo-muted">No GIFs found.</p>}
        <ul className="grid grid-cols-2 gap-1">
          {gifs.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onPick(g.full)}
                className="block w-full overflow-hidden rounded hover:opacity-80"
                aria-label={`Send ${g.title}`}
              >
                <img src={g.preview} alt={g.title} loading="lazy" referrerPolicy="no-referrer" className="h-auto w-full" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-1 text-right text-[10px] text-vulo-muted">Powered by KLIPY</p>
    </div>
  );
}
