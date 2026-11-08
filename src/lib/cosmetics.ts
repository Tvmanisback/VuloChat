import { useBadgeCatalog, useProfileBadges } from './badges';

/** Anything a profile can equip and that may be locked: decorations and nameplates. */
export interface Unlockable {
  required_badge_id: string | null;
  available_until: string | null;
}

/** Why an item can't be used right now, or null if it can. */
export function lockReason(item: Unlockable, ownedBadgeIds: Set<string>, badgeName?: string): string | null {
  if (item.available_until && new Date(item.available_until).getTime() < Date.now()) return 'Event ended';
  if (item.required_badge_id && !ownedBadgeIds.has(item.required_badge_id)) {
    return badgeName ? `Needs the ${badgeName} badge` : 'Needs a badge';
  }
  return null;
}

/** Returns a function that gives the lock reason for an item, based on the profile's badges. */
export function useLockReasons(profileId: string | null): (item: Unlockable) => string | null {
  const owned = useProfileBadges(profileId);
  const catalog = useBadgeCatalog();
  const ownedIds = new Set(owned.map((b) => b.id));
  return (item) => lockReason(item, ownedIds, catalog.find((b) => b.id === item.required_badge_id)?.name);
}
