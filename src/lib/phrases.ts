import type { PhraseDrill, PhraseTense } from './api';
export type { PhraseTense };

/** Contractions written out, so "I've run out of" = "I have run out of". */
const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, 'cannot'], [/\bwon't\b/g, 'will not'], [/n't\b/g, ' not'], [/'ve\b/g, ' have'], [/'re\b/g, ' are'], [/'m\b/g, ' am'],
  [/'ll\b/g, ' will'], [/'d\b/g, ' would'], [/\b(it|that|what|how|who|there|here|where|he|she|this|everything)'s\b/g, '$1 is'], [/\blet's\b/g, 'let us']
];

/** For comparing sentences: case, curly quotes, contractions, punctuation and extra spaces don't matter. */
export function normSentence(s: string): string {
  let t = s.toLowerCase().normalize('NFC').replace(/[’‘`]/g, "'");
  for (const [re, by] of CONTRACTIONS) t = t.replace(re, by);
  return t.replace(/[.,!?;:"“”()]/g, ' ').replace(/\s+/g, ' ').trim();
}

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const QUESTION_START = /^(are|is|am|was|were|do|does|did|have|has|had|can|could|will|would|should|shall|may|who|what|how|where|when|why|which)\b/i;

/** What each tense is called, and how it's made (the hint shown with the question). */
export const TENSE_HINT: Record<PhraseTense, { vi: string; form: string }> = {
  perfect: { vi: 'Hiện tại hoàn thành', form: 'have/has + V3' },
  past: { vi: 'Quá khứ đơn', form: 'V2 / V-ed' },
  continuous: { vi: 'Tiếp diễn', form: 'am/is/are + V-ing' },
  modal: { vi: 'Will / động từ khuyết thiếu / to + V', form: 'will, can, need to… + V' },
  present: { vi: 'Hiện tại đơn', form: 'V / V-s' }
};

const PERFECT = new Set(['have', 'has', 'had']);
const MODAL = new Set(['will', 'would', 'can', 'could', 'should', 'must', 'may', 'might', 'shall', 'to', 'going']);
const AUX = new Set([...PERFECT, ...MODAL, 'do', 'does', 'did', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
/** Contractions written out for finding the tense ("I've" → "I have"). */
function expand(s: string): string {
  return s.toLowerCase().replace(/[’‘`]/g, "'")
    .replace(/\bcan't\b/g, 'can not').replace(/\bwon't\b/g, 'will not').replace(/n't\b/g, ' not')
    .replace(/'ve\b/g, ' have').replace(/'re\b/g, ' are').replace(/'m\b/g, ' am').replace(/'ll\b/g, ' will').replace(/'d\b/g, ' would')
    .replace(/'s been\b/g, ' has been').replace(/\b(it|he|she|that|what|who|there|here)'s\b/g, '$1 is');
}
/** The tense the phrase is used in — the same rules as the server (phrases/tense.ts). */
export function tenseOf(sentence: string, re: string, base: string, past: string[]): PhraseTense | '' {
  const t = expand(sentence);
  const m = new RegExp(re, 'i').exec(t);
  if (!m) return '';
  const head = m[0].trim().split(/\s+/)[0].replace(/^'/, '');
  if (/ing$/.test(head) && head !== base) return 'continuous';
  const aux = t.slice(0, m.index).split(/[^a-z]+/).filter(Boolean).reverse().find((w) => AUX.has(w));
  if (aux && PERFECT.has(aux) && !(base === 'have' && aux === head)) return 'perfect';
  if (aux && MODAL.has(aux)) return 'modal';
  if (aux === 'did') return 'past';
  if (base === 'be') return head === 'was' || head === 'were' ? 'past' : 'present';
  return past.includes(head) ? 'past' : 'present';
}

export interface Grade { verdict: 'right' | 'close' | 'wrong'; /** Wrong only because of the tense: the one it should be in. */ tense?: PhraseTense }

/**
 * right: one of the listed answers (or the right choice); close: another correct way — it has the phrase in the same
 * tense, the word that was put in, and looks like a question when one is asked; wrong: anything else (with the tense
 * when that's the only problem: "I ran out of toothpaste" for "Tôi hết kem đánh răng rồi").
 */
export function gradeDrill(d: PhraseDrill, input: string): Grade {
  if (d.choices.length) return { verdict: d.answers.includes(input) ? 'right' : 'wrong' };
  const a = normSentence(input);
  if (!a) return { verdict: 'wrong' };
  if (d.answers.some((x) => normSentence(x) === a)) return { verdict: 'right' };
  if (!d.check) return { verdict: 'wrong' };
  const raw = input.toLowerCase().replace(/[’‘`]/g, "'");
  const hasPhrase = new RegExp(d.check.phrase, 'i').test(expand(raw)) || new RegExp(d.check.phrase, 'i').test(raw);
  const hasWords = d.check.need.every((w) => new RegExp('\\b' + esc(w) + '(?:s|es)?\\b', 'i').test(raw));
  const isQuestion = !d.check.question || /\?\s*$/.test(input.trim()) || QUESTION_START.test(input.trim());
  if (!(hasPhrase && hasWords && isQuestion && a.split(' ').length >= 3)) return { verdict: 'wrong' };
  const want = d.check.tense;
  if (want && tenseOf(input, d.check.phrase, d.check.base, d.check.past) !== want) return { verdict: 'wrong', tense: want };
  return { verdict: 'close' };
}

/** "S + run out of + X" → its parts, the slot (X) marked. */
export function patternParts(pattern: string): { text: string; slot: boolean }[] {
  return pattern.split(/\s*\+\s*/).filter(Boolean).map((p) => ({ text: p.trim(), slot: p.trim() === 'X' || p.trim() === 'S' }));
}

export const DRILL_TITLE: Record<PhraseDrill['type'], string> = {
  translate: 'Say it in English', fill: 'Fill in the phrase', transform: 'Make it a question',
  situation: 'What would you say?', reply: 'Pick the natural reply', meaning: 'What does it mean?', own: 'Your own sentence'
};
export const FUNCTION_LABEL: Record<string, string> = {
  greeting: 'Greeting', farewell: 'Goodbye', thanks: 'Thanks', apology: 'Apology', opinion: 'Opinion', agree: 'Agreeing',
  disagree: 'Disagreeing', softening: 'Softening', transition: 'Changing topic', asking: 'Asking', reacting: 'Reacting', request: 'Request', other: 'Other'
};
export const REGISTER_LABEL: Record<string, string> = { informal: 'Informal', neutral: 'Neutral', formal: 'Formal' };

/** "deal with" → "d___ w___": a first hint that doesn't give the phrase away. */
export const firstLetters = (s: string) => s.split(/\s+/).filter(Boolean).map((w) => (/^['’]/.test(w) ? w.slice(0, 2) : w.charAt(0)) + '_'.repeat(Math.max(2, w.length - 1))).join(' ');
/** The questions where the phrase is hidden until a hint is asked for (it would give the answer away). */
export const hidesPhrase = (type: string) => type === 'fill' || type === 'translate' || type === 'situation';
