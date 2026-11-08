import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Badge } from './types';

/** Badges granted to one profile. Badges are granted by the project owner, not by users. */
export function useProfileBadges(profileId: string | null): Badge[] {
  const [badges, setBadges] = useState<Badge[]>([]);

  useEffect(() => {
    setBadges([]);
    if (!profileId) return;
    let alive = true;
    supabase
      .from('profile_badges')
      .select('badges(*)')
      .eq('profile_id', profileId)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error('badges load failed', error.message);
          return;
        }
        const rows = (data as unknown as { badges: Badge | null }[] | null) ?? [];
        const list = rows.map((r) => r.badges).filter((b): b is Badge => !!b);
        list.sort((a, b) => a.position - b.position);
        setBadges(list);
      });
    return () => {
      alive = false;
    };
  }, [profileId]);

  return badges;
}
