import { api, type PracticeStats, type PracticeWordMode } from './api';

/** The practice modes that count answers per word, with their names on the Practice page. */
export const WEAK_MODE_LABEL: Record<PracticeWordMode, string> = {
  mc: 'Multiple choice', trans: 'Translation', listen: 'Listening', wordform: 'Word forms', fill: 'Fill in the blank', tense: 'Verb tenses', dictation: 'Dictation'
};

export interface PracticeRecord { errors: number; lastAt: number; lastWrongAt: number }

/** My records in one mode, by word id. */
export function recordsFor(stats: PracticeStats | null, mode: PracticeWordMode): Map<string, PracticeRecord> {
  return new Map((stats?.records ?? []).filter((r) => r.mode === mode).map((r) => [r.wordId, r]));
}

const shuffle = <T,>(a: T[]): T[] => a.map((x) => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x);

/**
 * Practice order for a session of n (the server's rule): the weak words first, at most 40% of it, most mistakes first;
 * then the words not practised for the longest time (never first). Ties are random.
 */
export function orderWords<T>(items: T[], idOf: (x: T) => string, recs: Map<string, PracticeRecord>, n: number): T[] {
  const list = shuffle(items);
  const weak = list.filter((x) => (recs.get(idOf(x))?.errors ?? 0) > 0)
    .sort((a, b) => recs.get(idOf(b))!.errors - recs.get(idOf(a))!.errors || recs.get(idOf(b))!.lastWrongAt - recs.get(idOf(a))!.lastWrongAt)
    .slice(0, Math.max(1, Math.ceil(n * 0.4)));
  const rest = list.filter((x) => !weak.includes(x)).sort((a, b) => (recs.get(idOf(a))?.lastAt ?? 0) - (recs.get(idOf(b))?.lastAt ?? 0));
  return [...weak, ...rest];
}

/** For comparing typed words: case, curly apostrophes, hyphens and extra spaces don't matter ("follow-up" = "follow up"). */
export function normWord(s: string): string {
  return s.toLowerCase().normalize('NFC').replace(/[’‘`]/g, "'").replace(/[-‐–—]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** One letter off (missing, extra, wrong or two swapped) — only for words of 5 letters or more. */
export function oneOff(typed: string, answer: string): boolean {
  const a = normWord(typed), b = normWord(answer);
  if (b.length < 5 || a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** The meanings in a Vietnamese field ("thông báo, công bố"). */
const viParts = (vi: string) => vi.toLowerCase().normalize('NFC').split(/[,;/]/).map((x) => x.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
/** True when two Vietnamese fields share a meaning. */
export function sameMeaning(a: string, b: string): boolean {
  const pa = viParts(a);
  return viParts(b).some((x) => pa.includes(x));
}

/** Records one answer for the word's practice stats (best effort: practice goes on if it fails). */
export function recordAnswer(wordId: string, mode: PracticeWordMode, ok: boolean, spelling = false): void {
  if (!/^[a-f0-9]{24}$/i.test(wordId)) return;
  void api.practiceResults([{ wordId, mode, ok, ...(spelling ? { spelling } : {}) }]).catch(() => undefined);
}
