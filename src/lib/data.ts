import type { IconName } from './icons';

export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type Status = 'new' | 'learning' | 'mastered';
export type Rating = 'Again' | 'Hard' | 'Good' | 'Easy';
export type Theme = 'light' | 'dark' | 'system';
export type Accent = 'indigo' | 'blue' | 'teal' | 'green' | 'orange' | 'rose';

export interface ReviewEntry { at: number; r: Rating }

export interface Word {
  id: string;
  word: string;
  ipa: string;
  pos: string;
  meaning: string;
  vi: string;
  ex: string;
  syn: string[];
  ant: string[];
  level: Level;
  status: Status;
  cat: string;
  tags: string[];
  notes: string;
  /** Timestamp when the word is next due for review. */
  dueAt: number;
  addedAt: number;
  hist: ReviewEntry[];
}

export interface Category { id: string; name: string; icon: IconName }

export interface Settings {
  name: string;
  email: string;
  goal: string;
  dir: 'en-vi' | 'vi-en';
  autoplay: boolean;
  showEx: boolean;
  theme: Theme;
  accent: Accent;
  /** Speech voice (voiceURI); '' = browser default English voice. */
  voice: string;
  /** Speaking speed and pitch, 0.5–1.5. */
  rate: number;
  pitch: number;
}

export interface Progress {
  streak: number;
  /** Day key (YYYY-MM-DD) of the last day a review session was completed. */
  lastStreakDay: string;
  reviewedDay: string;
  reviewedToday: number;
}

export interface Data {
  words: Word[];
  cats: Category[];
  tags: string[];
  /** Lower-cased words of mine that are already in the shared library. */
  shared: string[];
  userId: string;
  settings: Settings;
  progress: Progress;
}

export interface FormData {
  word: string; ipa: string; pos: string; meaning: string; vi: string; ex: string;
  syn: string[]; ant: string[]; level: Level; cat: string; tags: string[]; notes: string;
  synIn: string; antIn: string;
}

export const LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const POS_LIST = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Pronoun', 'Preposition', 'Conjunction', 'Other'];
export const ST_LABEL: Record<Status, string> = { new: 'New', learning: 'Learning', mastered: 'Mastered' };
export const POS_SHORT: Record<string, string> = { Adjective: 'Adj', Adverb: 'Adv', Pronoun: 'Pron', Preposition: 'Prep', Conjunction: 'Conj' };
export const CAT_ICONS: [IconName, string][] = [['briefcase', 'Work'], ['laptop', 'Technology'], ['chat', 'Conversation'], ['globe', 'World'], ['plane', 'Travel'], ['heart', 'Health'], ['cap', 'Study'], ['coffee', 'Daily life'], ['book', 'Reading'], ['music', 'Music']];
export const TINTS = ['t-indigo', 't-blue', 't-green', 't-orange', 't-amber', 't-red'];

export const MIN = 60000;
export const DAY = 86400000;

export function dayKey(t: number | Date): string {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function daysFromToday(t: number): number {
  return Math.round((startOfDay(t) - startOfDay(Date.now())) / DAY);
}

export function emptyForm(): FormData {
  return { word: '', ipa: '', pos: 'Noun', meaning: '', vi: '', ex: '', syn: [], ant: [], level: 'B1', cat: '', tags: [], notes: '', synIn: '', antIn: '' };
}

export function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function isDue(w: Word, now = Date.now()): boolean { return w.dueAt <= now; }

export function fmtNext(dueAt: number): string {
  const d = daysFromToday(dueAt);
  if (dueAt <= Date.now() || d <= 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return new Date(dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
export function fmtAgo(at: number): string {
  const min = Math.floor((Date.now() - at) / MIN);
  if (min < 1) return 'Just now';
  if (min < 60) return min + ' min ago';
  if (min < 120) return '1 hour ago';
  if (min < 1440) return Math.floor(min / 60) + ' hours ago';
  if (min < 2880) return 'Yesterday';
  return Math.floor(min / 1440) + ' days ago';
}
export function fmtDate(at: number): string { return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
export function cap1(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
export function low1(s: string): string { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
