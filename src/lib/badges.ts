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

/** Every badge that exists, so a locked item can say which badge it needs. */
export function useBadgeCatalog(): Badge[] {
  const [all, setAll] = useState<Badge[]>([]);

  useEffect(() => {
    let alive = true;
    supabase
      .from('badges')
      .select('*')
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error('badge catalog failed', error.message);
          return;
        }
        setAll((data as Badge[] | null) ?? []);
      });
    return () => {
      alive = false;
    };
  }, []);

  return all;
}


/** Badges owned by a set of profiles, keyed by profile ID. */
export function useBadgesForProfiles(profileIds: string[]): Record<string, Badge[]> {
  const [byProfile, setByProfile] = useState<Record<string, Badge[]>>({});
  const key = [...new Set(profileIds)].sort().join(',');

  useEffect(() => {
    let alive = true;
    const ids = key ? key.split(',') : [];
    setByProfile({});
    if (!ids.length) return;
    supabase
      .from('profile_badges')
      .select('profile_id,badges(*)')
      .in('profile_id', ids)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error('chat badges load failed', error.message);
          return;
        }
        const next: Record<string, Badge[]> = {};
        for (const row of (data as unknown as { profile_id: string; badges: Badge | null }[] | null) ?? []) {
          if (!row.badges) continue;
          (next[row.profile_id] ??= []).push(row.badges);
        }
        for (const list of Object.values(next)) list.sort((a, b) => a.position - b.position);
        setByProfile(next);
      });
    return () => { alive = false; };
  }, [key]);

  return byProfile;
}
