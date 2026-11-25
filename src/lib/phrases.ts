import type { PhraseDrill } from './api';

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

/**
 * right: one of the listed answers (or the right choice); close: another correct way — it has the phrase in some
 * form, the word that was put in, and looks like a question when one is asked; wrong: anything else.
 */
export function gradeDrill(d: PhraseDrill, input: string): 'right' | 'close' | 'wrong' {
  if (d.choices.length) return d.answers.includes(input) ? 'right' : 'wrong';
  const a = normSentence(input);
  if (!a) return 'wrong';
  if (d.answers.some((x) => normSentence(x) === a)) return 'right';
  if (!d.check) return 'wrong';
  const raw = input.toLowerCase().replace(/[’‘`]/g, "'");
  const hasPhrase = new RegExp(d.check.phrase, 'i').test(raw);
  const hasWords = d.check.need.every((w) => new RegExp('\\b' + esc(w) + '(?:s|es)?\\b', 'i').test(raw));
  const isQuestion = !d.check.question || /\?\s*$/.test(input.trim()) || QUESTION_START.test(input.trim());
  return hasPhrase && hasWords && isQuestion && a.split(' ').length >= 3 ? 'close' : 'wrong';
}

/** "S + run out of + X" → its parts, the slot (X) marked. */
export function patternParts(pattern: string): { text: string; slot: boolean }[] {
  return pattern.split(/\s*\+\s*/).filter(Boolean).map((p) => ({ text: p.trim(), slot: p.trim() === 'X' || p.trim() === 'S' }));
}

export const DRILL_TITLE: Record<PhraseDrill['type'], string> = {
  translate: 'Say it in English', fill: 'Fill in the phrase', transform: 'Make it a question',
  situation: 'What would you say?', reply: 'Pick the natural reply', meaning: 'What does it mean?'
};
export const FUNCTION_LABEL: Record<string, string> = {
  greeting: 'Greeting', farewell: 'Goodbye', thanks: 'Thanks', apology: 'Apology', opinion: 'Opinion', agree: 'Agreeing',
  disagree: 'Disagreeing', softening: 'Softening', transition: 'Changing topic', asking: 'Asking', reacting: 'Reacting', request: 'Request', other: 'Other'
};
export const REGISTER_LABEL: Record<string, string> = { informal: 'Informal', neutral: 'Neutral', formal: 'Formal' };
