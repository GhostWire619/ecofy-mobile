import type { AchievementBadge, EngagementSummary } from '@/lib/domain/types';

/**
 * Streak is "at risk" when the farmer has an active streak but hasn't earned
 * today and has no grace days left — i.e. it will break if they do nothing.
 */
export function isStreakAtRisk(engagement?: EngagementSummary | null): boolean {
  if (!engagement || engagement.daily_streak <= 0) return false;
  const today = new Date().toISOString().slice(0, 10);
  const earnedToday = engagement.daily_last_earned_on === today;
  return !earnedToday && engagement.daily_grace_remaining <= 0;
}

/**
 * Given the previously-seen achievement keys and the current list, return any
 * badges that are newly unlocked (to trigger the celebration modal once).
 */
export function newlyUnlocked(
  current: AchievementBadge[],
  seenKeys: Set<string>,
): AchievementBadge[] {
  return current.filter((b) => b.achievement_key && !seenKeys.has(b.achievement_key));
}
