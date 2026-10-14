import { sortFamily, type FamilyMember, type FamilyPos } from './data';

/**
 * "Word form" questions (TOEIC Part 5 style) built from a word family: one member's example sentence with that member
 * blanked out and another member of the family given as the hint, e.g. "The ___ (decide) was announced yesterday." → decision.
 */
export interface WordformQuestion {
  /** The sentence before the gap, and after it (the hint is not included). */
  before: string; after: string;
  /** The word given in brackets after the gap (another member of the family). */
  hint: string;
  /** The whole prompt: before + "___ (hint)" + after. */
  prompt: string;
  /** The member asked for, exactly as it appears in the example. */
  answer: string;
  /** The member's part of speech (the key clue), lower-case: "noun", "verb", "adjective", "adverb", "other". */
  pos: string;
  /** The member's Vietnamese meaning. */
  vi: string;
  /** The whole family: "decide (v) → decision (n) → decisive (adj) → decisively (adv)". */
  family: string;
}

const POS_ABBR: Record<FamilyPos, string> = { Verb: 'v', Noun: 'n', Adjective: 'adj', Adverb: 'adv', Other: '' };

/** The family as one line, in display order: "decide (v) → decision (n) → decisive (adj)". */
export function familyLine(family: FamilyMember[]): string {
  return sortFamily(family).map((m) => (POS_ABBR[m.pos] ? m.word + ' (' + POS_ABBR[m.pos] + ')' : m.word)).join(' → ');
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where `word` appears in `ex` as a whole word (case-insensitive), or null. */
function findWhole(ex: string, word: string): { start: number; end: number } | null {
  const w = word.trim();
  if (!w) return null;
  const re = new RegExp('(^|[^\\p{L}\\p{N}\'’-])(' + escapeRe(w).replace(/\s+/g, '\\s+') + ')(?=$|[^\\p{L}\\p{N}\'’-])', 'iu');
  const m = re.exec(ex);
  if (!m) return null;
  const start = m.index + m[1].length;
  return { start, end: start + m[2].length };
}

/** The hint for member `m`: the family's verb if there is one, else its shortest other member; never the answer itself. */
function hintFor(family: FamilyMember[], m: FamilyMember): string {
  const key = m.word.trim().toLowerCase();
  const others = family.filter((o) => o !== m && o.word.trim() && o.word.trim().toLowerCase() !== key);
  if (!others.length) return '';
  const verb = others.find((o) => o.pos === 'Verb');
  if (verb) return verb.word.trim();
  return others.reduce((a, b) => (b.word.trim().length < a.word.trim().length ? b : a)).word.trim();
}

/** Every question the family can give (one per usable member); [] for a family of fewer than 2 forms. */
export function wordformQuestions(family: FamilyMember[] | undefined): WordformQuestion[] {
  if (!family || family.length < 2) return [];
  const line = familyLine(family);
  const out: WordformQuestion[] = [];
  for (const m of family) {
    const ex = (m.ex ?? '').trim();
    if (!ex) continue;
    const at = findWhole(ex, m.word);
    if (!at) continue;
    const hint = hintFor(family, m);
    if (!hint) continue;
    const before = ex.slice(0, at.start), after = ex.slice(at.end);
    out.push({
      before, after, hint, prompt: before + '___ (' + hint + ')' + after,
      answer: ex.slice(at.start, at.end), pos: m.pos.toLowerCase(), vi: m.vi, family: line
    });
  }
  return out;
}

/** One random question from the family, or null when no member is usable. */
export function buildWordform(family: FamilyMember[] | undefined, rnd: () => number = Math.random): WordformQuestion | null {
  const qs = wordformQuestions(family);
  return qs.length ? qs[Math.floor(rnd() * qs.length)] : null;
}

/** True when the family can give at least one word-form question. */
export const hasWordform = (family: FamilyMember[] | undefined) => wordformQuestions(family).length > 0;

/** Lower-case, trimmed, straight quotes, single spaces, no punctuation around it (like the server). */
export function normalizeAnswer(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}
