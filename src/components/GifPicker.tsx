import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { addFavorite, loadFavorites, removeFavorite } from '../lib/gifFavorites';
import { searchGifs, type GifResult } from '../lib/klipy';

type View = 'trending' | 'favorites';

const viewButton = (on: boolean) =>
  `rounded px-2.5 py-1 text-xs font-semibold transition ${
    on ? 'bg-vulo-active text-vulo-bright' : 'text-vulo-muted hover:text-vulo-text'
  }`;

/**
 * GIF panel body. Trending or search results on one side, saved favorites on the other.
 * Picking a GIF calls onPick with its image URL.
 */
export default function GifPicker({ onPick }: { onPick: (url: string) => void }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [view, setView] = useState<View>('trending');
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<GifResult[]>([]);
  const [favError, setFavError] = useState<string | null>(null);
  const latest = useRef(0);

  const trimmed = query.trim();
  const favIds = new Set(favorites.map((f) => f.id));

  const refreshFavorites = useCallback(async () => {
    if (!userId) return;
    try {
      setFavorites(await loadFavorites(userId));
      setFavError(null);
    } catch (e) {
      setFavError(e instanceof Error ? e.message : 'Favorites could not be loaded.');
    }
  }, [userId]);

  useEffect(() => {
    void refreshFavorites();
  }, [refreshFavorites]);

  // Trending or search results. Typing waits a moment, and responses to older searches are ignored.
  useEffect(() => {
    if (view !== 'trending') return;
    const run = ++latest.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      searchGifs(trimmed)
        .then((list) => {
          if (run === latest.current) setGifs(list);
        })
        .catch((e: unknown) => {
          if (run === latest.current) setError(e instanceof Error ? e.message : 'GIFs are unavailable right now.');
        })
        .finally(() => {
          if (run === latest.current) setLoading(false);
        });
    }, trimmed ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [trimmed, view]);

  const toggleFavorite = async (gif: GifResult) => {
    if (!userId) return;
    const saved = favIds.has(gif.id);
    setFavError(null);
    // Update the list straight away, then save. If saving fails, the real list is reloaded.
    setFavorites((prev) => (saved ? prev.filter((f) => f.id !== gif.id) : [gif, ...prev]));
    try {
      if (saved) await removeFavorite(userId, gif.id);
      else await addFavorite(userId, gif);
    } catch (e) {
      setFavError(e instanceof Error ? e.message : 'Could not update favorites.');
      void refreshFavorites();
    }
  };

  const q = trimmed.toLowerCase();
  const shownFavorites = q ? favorites.filter((f) => f.title.toLowerCase().includes(q)) : favorites;

  const renderGrid = (list: GifResult[]) => (
    <ul className="grid grid-cols-2 gap-2">
      {list.map((g) => {
        const saved = favIds.has(g.id);
        return (
          <li key={g.id} className="relative">
            <button
              type="button"
              onClick={() => onPick(g.full)}
              className="block w-full overflow-hidden rounded-md bg-vulo-side transition hover:opacity-80"
              aria-label={`Send ${g.title}`}
            >
              <img src={g.preview} alt={g.title} loading="lazy" referrerPolicy="no-referrer" className="h-auto w-full" />
            </button>
            <button
              type="button"
              onClick={() => void toggleFavorite(g)}
              aria-pressed={saved}
              aria-label={saved ? `Remove ${g.title} from favorites` : `Add ${g.title} to favorites`}
              className="absolute right-1 top-1 rounded-full bg-vulo-rail/80 px-2 py-0.5 text-base leading-none text-vulo-yellow hover:bg-vulo-rail"
            >
              {saved ? '★' : '☆'}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={view === 'trending' ? 'Search GIFs' : 'Search favorites'}
          aria-label={view === 'trending' ? 'Search GIFs' : 'Search favorites'}
          className="min-w-0 flex-1 rounded-md bg-vulo-input px-3 py-2 text-sm text-vulo-text placeholder:text-vulo-muted outline-none focus:ring-2 focus:ring-vulo-accent"
        />
        <div role="group" aria-label="GIF views" className="flex shrink-0 gap-1 rounded-md bg-vulo-side p-1">
          <button type="button" aria-pressed={view === 'trending'} onClick={() => setView('trending')} className={viewButton(view === 'trending')}>
            {trimmed ? 'Search' : 'Trending'}
          </button>
          <button type="button" aria-pressed={view === 'favorites'} onClick={() => setView('favorites')} className={viewButton(view === 'favorites')}>
            Favorites · {favorites.length}
          </button>
        </div>
      </div>

      {favError && <p className="mb-2 rounded bg-vulo-red/10 px-3 py-1.5 text-sm text-vulo-red">{favError}</p>}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pr-1">
        {view === 'trending' ? (
          <>
            {!error && !loading && gifs.length > 0 && (
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-vulo-muted">
                {trimmed ? `Results for “${trimmed}”` : 'Trending'}
              </p>
            )}
            {error && <p className="px-2 py-2 text-sm text-vulo-red">{error}</p>}
            {!error && loading && gifs.length === 0 && <p className="px-2 py-2 text-sm text-vulo-muted">Loading GIFs…</p>}
            {!error && !loading && gifs.length === 0 && <p className="px-2 py-2 text-sm text-vulo-muted">No GIFs found.</p>}
            {renderGrid(gifs)}
          </>
        ) : (
          <>
            {favorites.length === 0 && !favError && (
              <p className="px-2 py-2 text-sm text-vulo-muted">No favorites yet. Click ☆ on a GIF to save it here.</p>
            )}
            {favorites.length > 0 && shownFavorites.length === 0 && (
              <p className="px-2 py-2 text-sm text-vulo-muted">No favorites match “{trimmed}”.</p>
            )}
            {renderGrid(shownFavorites)}
          </>
        )}
      </div>

      <p className="mt-2 text-right text-[11px] text-vulo-muted">Powered by KLIPY</p>
    </div>
  );
}
