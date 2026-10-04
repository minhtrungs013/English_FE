import { DAY, dayKey, isDue, type Progress, type Word } from '../lib/data';

export function getStats(words: Word[]) {
  const now = Date.now();
  const total = words.length;
  const due = words.filter((w) => isDue(w, now)).length;
  const mastered = words.filter((w) => w.status === 'mastered').length;
  const week = words.filter((w) => w.addedAt > now - 7 * DAY).length;
  return { total, due, mastered, week, masteredPct: total ? Math.round((mastered / total) * 100) : 0 };
}

/** Streak only counts if the last completed review was today or yesterday. */
export function currentStreak(p: Progress): number {
  const y = new Date(); y.setDate(y.getDate() - 1);
  return p.lastStreakDay === dayKey(Date.now()) || p.lastStreakDay === dayKey(y) ? p.streak : 0;
}

export function reviewedToday(p: Progress): number {
  return p.reviewedDay === dayKey(Date.now()) ? p.reviewedToday : 0;
}
