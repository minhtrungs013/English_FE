import type { Category, Data, FamilyMember, Progress, Rating, Settings, Word } from './data';

/** Wordbook API. Defaults to the server on Render; set VITE_API_URL in .env to use another one (e.g. http://localhost:3000/api). */
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'https://english-be-ys8a.onrender.com/api';
const BASE = API_BASE;
const TOKEN_KEY = 'wordbook:token';

export class ApiError extends Error {
  /** `body` is the server's JSON error, when there is one. */
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown> | null = null) { super(message); }
}

/* ---------- admin ---------- */
export interface AdminStats { users: number; admins: number; newUsers: number; activeToday: number; courses: number; enrollments: number; pendingQuestions: number; libraryWords: number; bankSentences: number; savedWords: number }
export interface Paged<T> { total: number; page: number; pages: number; items: T[] }
export interface AdminUser { id: string; name: string; email: string; role: 'user' | 'admin'; createdAt: number | null; words: number; courses: number }
export interface AdminCourse { id: string; title: string; ownerName: string; visibility: 'private' | 'public'; joinCode: string; totalDays: number; readyDays: number; members: number; pending: number; createdAt: number | null }
export interface AdminSentence { id: string; wordId: string; word: string; form: string; sentence: string; context: string; level: string; topic: string; tense: Tense | ''; verb: string; base: string }
export interface AdminLibraryWord { id: string; word: string; ipa: string; pos: string; meaning: string; vi: string; ex: string; level: Word['level']; topic: Topic; authorName: string; saves: number }

/* ---------- practice sentences ---------- */
/** A sentence for one of my words (from the word sentence bank or the word's own example). */
export interface PracticeSentence {
  wordId: string; word: string; vi: string; key: string; sentence: string;
  /** fill: the word as written in the sentence (the blank). */
  form?: string;
  /** tense: "___ (base)" prompt, answer, other accepted answers, 4 choices (empty: typed only). */
  question?: { prompt: string; answer: string; accept: string[]; choices: string[]; tense: string; tenseLabel: string };
  grammar: GrammarView | null;
}

/* ---------- session token ---------- */
let token: string | null = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { /* storage blocked: stay logged out */ }
let onUnauthorized: ((msg: string) => void) | null = null;

export function getToken(): string | null { return token; }
export function setToken(t: string | null): void {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage blocked: token lives in memory only */ }
}
/** Called when a signed-in request comes back 401 (expired token, deleted account). */
export function setUnauthorizedHandler(fn: (msg: string) => void): void { onUnauthorized = fn; }

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const sentToken = token;
  if (sentToken) headers.Authorization = 'Bearer ' + sentToken;
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Can’t reach the server. Is the API running?', 0);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const m = json?.message;
    const msg = Array.isArray(m) ? m.join(' ') : m || 'Request failed (' + res.status + ')';
    // Only a rejected session logs out; a wrong password on login/change-password doesn't.
    if (res.status === 401 && sentToken && sentToken === token && !path.startsWith('/auth/change-password')) onUnauthorized?.(msg);
    throw new ApiError(msg, res.status, json);
  }
  return json as T;
}

export type WordInput = Omit<Word, 'id' | 'status' | 'dueAt' | 'addedAt' | 'hist'>;
export interface Quota { used: number; limit: number }
export interface LookupResult {
  quota?: Quota;
  source: 'collection' | 'library' | 'builtin' | 'ai' | 'online';
  ipa?: string; pos?: string; meaning?: string; vi?: string; ex?: string; syn?: string[]; ant?: string[]; level?: Word['level'];
  family?: FamilyMember[];
}
export interface User { id: string; name: string; email: string; role?: 'user' | 'admin' }

export type Topic = 'it' | 'interview' | 'customer' | 'leader' | 'toeic' | 'other';
export interface LibraryWord {
  id: string; word: string; ipa: string; pos: string; meaning: string; vi: string; ex: string;
  syn: string[]; ant: string[]; level: Word['level']; topic: Topic;
  /** '' for built-in words. */
  authorId: string; authorName: string; saves: number; sharedAt: number;
  family?: FamilyMember[];
}
/** For each family member: its library entry and my own word with that text, if any. */
export interface FamilyStatus { word: string; libraryId: string | null; myWordId: string | null }
export interface LibraryPage { items: LibraryWord[]; total: number; page: number; limit: number; topics: Record<Topic, number>; all: number }
export interface LibraryQuery { q?: string; topic?: Topic; level?: string; source?: 'me' | 'community' | 'builtin'; page?: number; limit?: number }
export interface AuthResponse { accessToken: string; user: User }

/* ---------- courses ---------- */
export interface CourseWord {
  word: string; ipa: string; pos: string; meaning: string; vi: string; ex: string;
  syn: string[]; ant: string[]; level: Word['level'];
  /** '' when the word isn't in the shared library (yet). */
  libraryId: string; source: 'library' | 'ai' | 'manual';
  family?: FamilyMember[];
}
/**
 * currentDay is 1..30: day 1 = the day they joined (or the course's start date), +1 each day (Vietnam time);
 * 0 = the course hasn't started yet. warmedUp: days whose review (warm-up) is done or skipped ·
 * listened: days whose listening practice is done or skipped.
 */
export type CourseEnrollment = { startDay: string; currentDay: number; learned: number[]; warmedUp: number[]; listened: number[] } | null;
export interface CourseSummary {
  id: string; title: string; description: string; ownerId: string; ownerName: string; isOwner: boolean;
  visibility: 'private' | 'public'; wordsPerDay: number; totalDays: number; tag: string;
  /** Dictation questions in each day's homework (0–3). */
  dictationPerDay: number;
  readyDays: number; members: number;
  /** '' = self-paced (each learner's day 1 is the day they join) · 'YYYY-MM-DD' = day 1 for everyone. */
  startDate: string;
  /** Only sent to the owner. */
  joinCode?: string;
  enrollment: CourseEnrollment;
}
export interface CourseDay {
  day: number; count: number;
  /** null = locked for this learner (a future day). */
  words: CourseWord[] | null;
  /** My final homework score for the day (0–100) once handed in; null otherwise or when not enrolled. */
  myScore: number | null;
  /** Question bank counts (recap included); only sent to the owner. */
  bank?: { pending: number; approved: number };
}
export interface CourseDetail extends CourseSummary { days: CourseDay[] }
export type CourseScope = 'joined' | 'mine' | 'public';
export interface CourseInput { title: string; description?: string; wordsPerDay?: number; dictationPerDay?: number; visibility?: 'private' | 'public'; startDate?: string }
export interface CourseAiWord { source: 'library' | 'ai' | 'online'; word: CourseWord; quota: Quota }
export interface CourseSaveResult { added: Word[]; skipped: string[]; tag: string }
export interface CourseLearnResult extends CourseSaveResult { course: CourseDetail }

/* ---------- homework & leaderboards ---------- */
/**
 * meaning: pick the Vietnamese meaning of the English prompt · word: pick the English word for the meaning ·
 * type: type the word for the meaning · blank: type the word missing from the sentence ("_____") ·
 * tense: type the verb in brackets in the right tense ("___ (deploy)") · tenseChoice: pick the right verb form ·
 * dictation: listen to a sentence (the device speaks `audio`) and type it ·
 * wordform: type the right form of the word in brackets ("The ___ (decide) was made."); hint = the part of speech ("noun").
 */
export type HomeworkType = 'meaning' | 'word' | 'type' | 'blank' | 'tense' | 'tenseChoice' | 'dictation' | 'wordform';
export interface HomeworkQuestion {
  type: HomeworkType;
  /** A word from an earlier day. */
  review: boolean;
  prompt: string; hint: string;
  /** Four choices for meaning/word questions, empty for typed ones. */
  choices: string[];
  /** Dictation only: the sentence, base64 (UTF-8), for the device to speak. Never shown before handing in. */
  audio?: string;
}
export interface HomeworkReview extends HomeworkQuestion {
  yourAnswer: string; answer: string; correct: boolean;
  /** Tense questions only ('' otherwise); explain is in Vietnamese. */
  tense?: string; tenseLabel?: string; explain?: string;
  /** The sentence's grammar (answer in place), or null for questions without a sentence. */
  grammar?: GrammarView | null;
  /** Dictation only: the word-by-word grade (answer = the sentence). */
  grade?: DictationGrade;
}
export interface HomeworkResult {
  /** Final score (raw × penalty), 0–100. */
  score: number; raw: number; correct: number; total: number;
  lateDays: number; penalty: number; durationMs: number; submittedAt: number | null;
  review: HomeworkReview[];
}
export interface Homework {
  day: number; total: number;
  /** Days after the day opened for me; penalty = % of the score kept (100 on time, then 80, 60, 50). */
  lateDays: number; penalty: number;
  questions: HomeworkQuestion[];
  /** Set once I've handed it in. */
  submission: HomeworkResult | null;
}
export type BoardRow<T> = { rank: number; name: string; me: boolean } & T;
/** rows: the top 50 · me: my row, even when it's outside the top · count: everyone on the board. */
export interface Board<T> { rows: BoardRow<T>[]; me: BoardRow<T> | null; count: number }
export interface Leaderboard {
  day: number; maxDay: number; members: number;
  dayBoard: Board<{ score: number; correct: number; total: number; lateDays: number; durationMs: number }>;
  overall: Board<{ score: number; days: number }>;
  streak: Board<{ streak: number; score: number }>;
}

/* ---------- tense question bank & warm-up ---------- */
export type Tense = 'present-simple' | 'present-continuous' | 'present-perfect' | 'past-simple' | 'past-continuous' | 'future-simple' | 'going-to';
/** The tenses in the order the grammar lessons teach them. */
export const TENSES: readonly Tense[] = ['present-simple', 'present-continuous', 'present-perfect', 'past-simple', 'past-continuous', 'future-simple', 'going-to'];
export const isTense = (t: unknown): t is Tense => typeof t === 'string' && (TENSES as readonly string[]).includes(t);
/**
 * tense: typed — the sentence has one "___" and the base verb in brackets ("Yesterday we ___ (deploy) the hotfix.") ·
 * tenseChoice: the same with 4 choices · recap: a short story using earlier days' words (explain = its Vietnamese translation) ·
 * dialogue: a listening dialogue (data; prompt = its title, explain = its scenario).
 */
export type BankKind = 'tense' | 'tenseChoice' | 'recap' | 'dialogue';
export type BankStatus = 'pending' | 'approved' | 'rejected';
export interface BankItem {
  id: string; day: number; kind: BankKind; word: string; tense: Tense | ''; tenseLabel: string;
  prompt: string; choices: string[]; answer: string; accept: string[]; explain: string;
  source: 'ai' | 'template' | 'manual' | 'bank'; status: BankStatus;
  /** Dialogues only. */
  data?: Dialogue;
}
export interface BankInput { kind: BankKind; word?: string; tense?: string; prompt: string; choices?: string[]; answer?: string; accept?: string[]; explain?: string }
export type BankPatch = Partial<Omit<BankInput, 'kind'>> & { status?: BankStatus; data?: Dialogue };
/** source 'template' = built-in questions, used when AI isn't available. items: the day's whole bank. */
export interface BankGenerateResult { source: 'ai' | 'template'; added: number; quota: Quota; items: BankItem[] }
/**
 * One row of a question import (CSV columns or JSON keys). type: 'typed' | 'multi' · word: one of the day's words ·
 * sentence: one "___" · multi: choice1..choice4 (or choices) · accept: "a|b" or a list · explain: Vietnamese.
 */
export type ImportRow = Record<string, unknown>;
/** A sentence of the word sentence bank, as the owner sees it when picking questions. */
export interface BankSentence {
  id: string; sentence: string; verb: string; tense: Tense | ''; tenseLabel: string; context: string; level: string;
  /** Already one of this course's questions. */
  used: boolean;
  /** Can become a tense question (typed); canChoose: also multiple choice. */
  canAsk: boolean; canChoose: boolean;
}
/** has: tenses this word already has questions in, in this course. */
export interface BankWord { word: string; has: Tense[]; sentences: BankSentence[] }
/** errors[].index points into the sent items; good rows are saved as approved. items: the day's whole bank. */
export interface ImportResult { added: number; errors: { index: number; message: string }[]; items: BankItem[] }
/** missed: times I got the word wrong in earlier homework. */
/** A sentence's grammar: tense, formula and lesson from the grammar lessons; parts/explain from storage when analysed ('full'). */
export interface GrammarView {
  text: string; tense: string;
  lesson: { id: string; name: string; vi: string } | null;
  /** The structure's name (Vietnamese) when there's no lesson for it: passive, modal… */
  label?: string;
  formula: string; signals: string[];
  parts: { text: string; role: 'S' | 'V' | 'O' | 'C' | 'time' | 'place' | 'adv' | 'clause' | 'other' }[];
  explain: string; notes: { on: string; text: string }[];
  level: 'full' | 'basic';
}
export interface WarmupWord { word: string; ipa: string; vi: string; meaning: string; missed: number }
/** Not graded, so the answers come with the questions. */
export interface WarmupQuestion {
  type: HomeworkType; word: string; prompt: string; hint: string; choices: string[];
  answer: string; accept: string[]; tense: string; tenseLabel: string; explain: string;
  grammar?: GrammarView | null;
}

/* ---------- listening dialogues ---------- */
export interface DialogueSpeaker { name: string; gender: 'female' | 'male' }
/**
 * s: the speaker (0 or 1) · text: the English line; blanks are written [[word]] or [[said form|word]]
 * (said form = what's spoken and the right fill, word = the base word in the word bank) · vi: its Vietnamese translation.
 */
export interface DialogueLine { s: 0 | 1; text: string; vi: string }
/** Four different choices, one of them the answer; explain is in Vietnamese. */
export interface DialogueQuestion { question: string; choices: string[]; answer: string; explain: string }
/** A short two-person conversation for a course day: 2 speakers, 4–16 lines, 2–10 blanks, up to 5 questions. */
export interface Dialogue { title: string; scenario: string; speakers: DialogueSpeaker[]; lines: DialogueLine[]; questions: DialogueQuestion[] }
/** The day's approved dialogue for practice (answers included), with the blanks' base words shuffled. */
export interface ListeningDialogue extends Dialogue { id: string; wordBank: string[] }
export interface Listening { day: number; dialogue: ListeningDialogue | null }
export interface DialogueGenerateResult { quota: Quota; items: BankItem[] }

export interface Warmup { day: number; recap: { text: string; vi: string } | null; words: WarmupWord[]; questions: WarmupQuestion[] }

/* ---------- members (owner) ---------- */
/**
 * A learner's progress, for the course owner. learned / warmedUp / listened / homework: days done · missing: open days
 * with words but no homework handed in · late: homework handed in late · joinedAt / lastActive: ms.
 */
export interface CourseMember {
  userId: string; name: string; isOwner: boolean; joinedAt: number | null; startDay: string; currentDay: number;
  learned: number; warmedUp: number; listened: number; homework: number; missing: number; late: number;
  totalScore: number; avgScore: number | null; streak: number; lastActive: number | null;
}
/** members: sorted by last activity. */
export interface CourseMembers { members: CourseMember[]; totalDays: number; daysWithWords: number }
/** homework: null = not opened · { opened } = opened, not handed in · else the result. warmup / listening: null when skipped or not done. */
export interface MemberDay {
  day: number; date: string; open: boolean; words: number;
  learnedAt: number | null; warmedUpAt: number | null; listenedAt: number | null;
  warmup: { correct: number; total: number } | null;
  listening: { correct: number; total: number } | null;
  homework: null | { opened: true } | { score: number; raw: number; correct: number; total: number; lateDays: number; durationMs: number; submittedAt: number };
}
export interface CourseMemberDetail {
  userId: string; name: string; isOwner: boolean; joinedAt: number | null; startDay: string; currentDay: number; days: MemberDay[];
}

/* ---------- notifications ---------- */
export type NoteType =
  | 'day_open' | 'homework_due' | 'homework_late' | 'streak_risk' | 'course_start' | 'words_due'
  | 'member_joined' | 'member_removed' | 'owner_pending' | 'owner_empty_day' | 'library_saved';
/** Where a notification takes the user: a course (optionally a day / tab / study step), the due review, or the library. */
export interface NoteLink {
  to: 'course' | 'review' | 'library';
  courseId?: string; day?: number;
  tab?: 'today' | 'map' | 'board' | 'members';
  step?: 'review' | 'learn' | 'listen' | 'homework';
}
/** count: repeats grouped into one (e.g. "3 people joined") · at: ms of the latest change. */
export interface Note { id: string; type: NoteType; title: string; body: string; link: NoteLink | null; count: number; read: boolean; at: number }
/** Newest first; hasMore: older ones exist (page back with `before` = the last item's `at`). */
export interface NotePage { items: Note[]; hasMore: boolean; unread: number }

/* ---------- grammar (foundations & tense lessons, practice) ---------- */
/**
 * The Foundations lessons (helping verbs, then irregular verbs V1–V2–V3) in the order they're taught; the cheat sheet is a
 * reference page (no practice).
 */
export type Foundation = 'be' | 'do' | 'have' | 'agreement' | 'irregular-verbs' | 'word-formation' | 'aux-cheatsheet';
export const FOUNDATIONS: readonly Foundation[] = ['be', 'do', 'have', 'agreement', 'irregular-verbs', 'word-formation', 'aux-cheatsheet'];
/** The irregular verbs lesson: its tables (one per pattern) get search, pattern filters and 🔊; results link to it with `verb`. */
export const IRREGULAR_LESSON = 'irregular-verbs' satisfies Foundation;
/** Mixed practice with real-world texts (name the tense, fix the mistake, fill in a text): in the tenses group, but not a tense. */
export type MixedLesson = 'mixed';
export const MIXED_LESSON: MixedLesson = 'mixed';
/** Any grammar lesson: Foundations first, then the tenses, then mixed practice (the API's order). */
export type LessonId = Foundation | Tense | MixedLesson;
export const LESSON_IDS: readonly LessonId[] = [...FOUNDATIONS, ...TENSES, MIXED_LESSON];
export const isLesson = (t: unknown): t is LessonId => typeof t === 'string' && (LESSON_IDS as readonly string[]).includes(t);
export type GrammarGroup = 'foundations' | 'tenses';

/** A lesson in the list · mastery: 0–100 from the recent answers · lastAt: ms of the last practice, null when never practised · drills: 0 for the cheat sheet. */
export interface GrammarTense {
  id: LessonId; group: GrammarGroup; name: string; vi: string; summary: string; drills: number; mastery: number; attempts: number; lastAt: number | null;
}
export interface GrammarExample { en: string; vi: string }
export type GrammarForm = 'affirmative' | 'negative' | 'question';
/** The helping verb by subject in one tense (e.g. "he / she / it": works · doesn't work · Does she work?). */
export interface GrammarPerson { subject: string; affirmative: string; negative: string; question: string }
/** A conjugation / reference table: cells has one entry per column (the first is the row's subject); link opens another lesson. */
export interface GrammarTable {
  title: string; columns: string[];
  rows: { label: string; cells: string[]; link?: string }[];
  note?: string;
}
/**
 * Theory (summary, explain, vi, notes) is in Vietnamese; patterns and examples are in English.
 * Tenses have formula, signals and compare; Foundations have tables instead (and compareName is '').
 */
export interface GrammarLesson {
  id: LessonId; group: GrammarGroup; name: string; vi: string; summary: string;
  formula?: Record<GrammarForm, { pattern: string; example: string; vi: string }> & {
    persons?: GrammarPerson[];
    /** The Foundations lesson about this tense's helping verb (none for future simple). */
    foundation?: 'be' | 'do' | 'have';
  };
  tables?: GrammarTable[];
  uses: { title: string; explain: string; examples: GrammarExample[] }[];
  signals?: string[];
  mistakes: { wrong: string; right: string; explain: string }[];
  compare?: { with: Tense; explain: string; examples: (GrammarExample & { tense: Tense })[] };
  compareName: string; drillCount: number; mastery: number; attempts: number;
}
/** A latest placement test: lesson id → right / asked, and the 3 lessons to start with (weakest first). */
export interface GrammarPlacementInfo { at: number | null; recommended: string[]; scores: Record<string, { correct: number; total: number }> }
/** practisedToday: any lesson practised today · placement: my latest placement test, null when never taken (missing on an older API). */
export interface GrammarList { tenses: GrammarTense[]; practisedToday?: boolean; placement?: GrammarPlacementInfo | null }
export type GrammarKind = 'tense' | 'tenseChoice' | 'identify' | 'fixError' | 'cloze';
/**
 * No answers — they're graded on submit.
 * tense: prompt has one "___" and the base verb in brackets (typed) · tenseChoice: the same with choices ·
 * identify: name the tense of the [[highlighted]] verb phrase — choices are tense ids, labels their names (same order) ·
 * fixError: tap the wrong word in `tokens` (the prompt split on spaces) and type the correction ·
 * cloze: a short text (`title`) with `blanks` "___ (verb)" gaps.
 */
export interface GrammarQuestion {
  id: string; kind: GrammarKind; level: 'easy' | 'medium' | 'hard'; prompt: string; choices: string[];
  labels?: string[]; tokens?: string[]; title?: string; blanks?: number;
}
/** One answer: typed / picked text (identify: a tense id; fixError: the correction), the word picked (fixError), one text per blank (cloze). */
export interface GrammarAnswer { id: string; answer?: string; pick?: number; answers?: string[] }
/** One blank of a graded cloze text · verb: the base form when the answer is a form of an irregular verb (never be/have/do). */
export interface GrammarBlankResult { yourAnswer: string; answer: string; correct: boolean; tense: string; tenseLabel: string; explain: string; verb?: string }
/** mode: a lesson id, 'mix' / 'mix-tenses' / 'mix-foundations' (weaker lessons come up more often) or 'daily' (recent mistakes first, then weak lessons). */
export interface GrammarPractice { mode: string; questions: GrammarQuestion[] }
/**
 * lesson: the lesson the question belongs to (its mastery changes) · tense: the lesson to review for it (a tense id, or a
 * Foundations id like 'do') · tenseLabel: what to show (a tense name, or a topic like "Be · past") · explain: Vietnamese.
 */
export interface GrammarResult {
  id: string; kind?: GrammarKind; lesson: LessonId; tense: string; tenseLabel: string; prompt: string;
  yourAnswer: string; answer: string; correct: boolean; explain: string;
  /** tense / tenseChoice / fixError: the base form (e.g. "write") when the answer is a form of an irregular verb (never be/have/do). */
  verb?: string;
  /** identify: the prompt with its [[highlight]], and the names of the tenses picked / right. */
  highlight?: string; yourLabel?: string; answerLabel?: string;
  /** fixError: the words, the indexes of the wrong one(s), the word picked (null: none) and whether it was one of them. */
  tokens?: string[]; wrongTokens?: number[]; wrong?: string; pick?: number | null; pickRight?: boolean;
  /** fixError: whether the typed correction is right (the server knows the accepted alternatives). */
  fixRight?: boolean;
  /** cloze: the text's title, right blanks / blanks, and each blank (correct is true only when every blank is). */
  title?: string; score?: { correct: number; total: number }; blanks?: GrammarBlankResult[];
}
/** mastery: each practised lesson's mastery after this set. */
export interface GrammarGraded { results: GrammarResult[]; correct: number; total: number; mastery: Partial<Record<LessonId, number>> }
/** The placement test graded: per-lesson scores and the 3 lessons to start with. */
export interface GrammarPlacementGraded extends GrammarGraded { scores: Record<string, { correct: number; total: number }>; recommended: string[] }

/* ---------- dictation ("Nghe – chép"): graded on the server ---------- */
export type DictationGroup = 'basics' | 'sentences' | 'passages';
export type DictationLevel = 'easy' | 'medium' | 'hard';
export type DictationTokenStatus = 'ok' | 'near' | 'wrong' | 'missing' | 'extra';
/** One word of the alignment: expected / typed keep the original spelling (after contractions are expanded). */
export interface DictationToken { status: DictationTokenStatus; expected?: string; typed?: string }
/** score = round(100 · correct / total); passed = every expected word right and nothing extra. */
export interface DictationGrade { tokens: DictationToken[]; correct: number; total: number; score: number; passed: boolean }
export interface DictationSetInfo { id: string; group: DictationGroup; name: string; vi: string; summary: string; items: number; mastery: number; attempts: number; lastAt: number | null }
export interface DictationList { practisedToday: boolean; sets: DictationSetInfo[] }
export interface DictationSetDetail { id: string; group: DictationGroup; name: string; vi: string; summary: string; tips: string[]; itemCount: number; mastery: number; attempts: number }
export interface DictationSentence { text: string; vi: string }
export type DictationQuestion =
  | { id: string; kind: 'line'; level: DictationLevel; text: string; vi: string; focus?: string }
  | { id: string; kind: 'passage'; level: DictationLevel; title: string; sentences: DictationSentence[] };
export interface DictationPracticeSet { mode: string; items: DictationQuestion[] }
export interface DictationAnswer { id: string; typed?: string; typedSentences?: string[]; plays?: number; hints?: number }
export interface DictationResult {
  id: string; set: string; kind: 'line' | 'passage'; passed: boolean; score: number;
  text?: string; vi?: string; title?: string; grade?: DictationGrade;
  sentences?: (DictationSentence & { grade: DictationGrade })[];
  plays: number; hints: number;
}
export interface DictationGraded { results: DictationResult[]; passed: number; total: number; mastery: Record<string, number> }

const query = (o: Record<string, string | number | undefined>) => Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => k + '=' + encodeURIComponent(String(v))).join('&');

export const api = {
  /** Sentences for practising my words; fresh ones first, never ones from my courses' homework. */
  practiceSentences: (mode: 'fill' | 'tense' | 'dictation' | 'flash', n = 10, words?: string[]) =>
    req<{ items: PracticeSentence[] }>('GET', '/practice/sentences?' + query({ mode, n, words: words?.join(',') })),
  /** Marks practised sentences (ok = answered right), so the next session prefers others. */
  practiceSeen: (items: { key: string; ok?: boolean }[]) => req<void>('POST', '/practice/sentences/seen', { items }),
  /* admin (403 for everyone else) */
  adminStats: () => req<AdminStats>('GET', '/admin/stats'),
  adminUsers: (q: string, page: number) => req<Paged<AdminUser>>('GET', '/admin/users?' + query({ q, page })),
  adminSetRole: (id: string, role: 'user' | 'admin') => req<{ id: string; role: string }>('PATCH', '/admin/users/' + id, { role }),
  adminCourses: () => req<AdminCourse[]>('GET', '/admin/courses'),
  adminSentences: (q: string, tense: string, page: number) => req<Paged<AdminSentence>>('GET', '/admin/sentences?' + query({ q, tense, page })),
  adminPatchSentence: (id: string, patch: Partial<Pick<AdminSentence, 'sentence' | 'tense' | 'verb' | 'base' | 'context'>>) => req<AdminSentence>('PATCH', '/admin/sentences/' + id, patch),
  adminDeleteSentence: (id: string) => req<void>('DELETE', '/admin/sentences/' + id),
  adminLibrary: (q: string, page: number) => req<Paged<AdminLibraryWord>>('GET', '/admin/library?' + query({ q, page })),
  adminPatchLibrary: (id: string, patch: Partial<Omit<AdminLibraryWord, 'id' | 'authorName' | 'saves'>>) => req<AdminLibraryWord>('PATCH', '/admin/library/' + id, patch),
  adminDeleteLibrary: (id: string) => req<void>('DELETE', '/admin/library/' + id),
  register: (name: string, email: string, password: string) => req<AuthResponse>('POST', '/auth/register', { name, email, password }),
  login: (email: string, password: string) => req<AuthResponse>('POST', '/auth/login', { email, password }),
  updateMe: (name: string) => req<User>('PATCH', '/auth/me', { name }),
  changePassword: (currentPassword: string, newPassword: string) => req<void>('POST', '/auth/change-password', { currentPassword, newPassword }),
  deleteAccount: () => req<void>('DELETE', '/auth/me'),

  bootstrap: () => req<Data>('GET', '/bootstrap'),

  createWord: (w: WordInput) => req<Word>('POST', '/words', w),
  updateWord: (id: string, w: Partial<WordInput>) => req<Word>('PATCH', '/words/' + id, w),
  deleteWord: (id: string) => req<void>('DELETE', '/words/' + id),
  reviewWord: (id: string, rating: Rating, practice: boolean, day: string) =>
    req<{ word: Word; progress?: Progress }>('POST', '/words/' + id + '/review', { rating, practice, day }),

  createCategory: (c: Omit<Category, 'id'>) => req<Category>('POST', '/categories', c),
  updateCategory: (id: string, c: Partial<Omit<Category, 'id'>>) => req<Category>('PATCH', '/categories/' + id, c),
  deleteCategory: (id: string) => req<void>('DELETE', '/categories/' + id),

  createTag: (name: string) => req<{ name: string }>('POST', '/tags', { name }),
  deleteTag: (name: string) => req<void>('DELETE', '/tags/' + encodeURIComponent(name)),

  updateSettings: (s: Partial<Omit<Settings, 'name' | 'email'>>) => req<Settings>('PATCH', '/profile/settings', s),
  lookup: (word: string) => req<LookupResult>('GET', '/lookup?word=' + encodeURIComponent(word)),
  clearAll: () => req<void>('DELETE', '/data'),

  library: (q: LibraryQuery) => {
    const qs = Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => k + '=' + encodeURIComponent(String(v))).join('&');
    return req<LibraryPage>('GET', '/library' + (qs ? '?' + qs : ''));
  },
  /** Exact library entry for a word (case-insensitive), or null. */
  findInLibrary: (word: string) => req<{ word: LibraryWord | null }>('GET', '/library/find?word=' + encodeURIComponent(word)),
  saveFromLibrary: (id: string) => req<{ word: Word; tag: string }>('POST', '/library/' + id + '/save'),
  shareToLibrary: (wordId: string, topic: Topic) => req<LibraryWord>('POST', '/library/share', { wordId, topic }),
  unshare: (id: string) => req<void>('DELETE', '/library/' + id),
  /** Library id / my word id for 1–10 family member words. */
  familyStatus: (words: string[]) => req<{ items: FamilyStatus[] }>('POST', '/library/family-status', { words }),

  listCourses: (scope: CourseScope) => req<CourseSummary[]>('GET', '/courses?scope=' + scope),
  createCourse: (c: CourseInput) => req<CourseDetail>('POST', '/courses', c),
  getCourse: (id: string) => req<CourseDetail>('GET', '/courses/' + id),
  updateCourse: (id: string, c: Partial<CourseInput>) => req<CourseDetail>('PATCH', '/courses/' + id, c),
  deleteCourse: (id: string) => req<void>('DELETE', '/courses/' + id),
  /** Fills days with random library words (no AI). 'replace' fails with 409 once anyone has joined. */
  autoFillCourse: (id: string, body: { levels?: ('A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2')[]; topics?: Topic[]; mode?: 'empty' | 'replace' }) =>
    req<{ added: number; missing: number; course: CourseDetail }>('POST', '/courses/' + id + '/auto-fill', body),
  /** Replaces one day's words (at most wordsPerDay, no duplicates). */
  setCourseDay: (id: string, day: number, words: CourseWord[]) => req<CourseDetail>('PUT', '/courses/' + id + '/days/' + day, { words }),
  /** Library entry for the word, or a generated one (daily limit). Not saved: add it to a day and PUT the day. */
  courseAiWord: (word: string) => req<CourseAiWord>('POST', '/courses/ai-word', { word }),
  addCourseWordToLibrary: (id: string, day: number, index: number, topic?: Topic) =>
    req<CourseDetail>('POST', '/courses/' + id + '/days/' + day + '/words/' + index + '/library', topic ? { topic } : {}),
  joinCourseByCode: (code: string) => req<CourseDetail>('POST', '/courses/join', { code }),
  joinCourse: (id: string) => req<CourseDetail>('POST', '/courses/' + id + '/join'),
  leaveCourse: (id: string) => req<void>('DELETE', '/courses/' + id + '/enrollment'),
  /**
   * Marks the day learned. save: which of its words to also save into my vocabulary (tagged with the course tag) —
   * [] saves none, omitted saves them all.
   */
  learnCourseDay: (id: string, day: number, save?: string[]) =>
    req<CourseLearnResult>('POST', '/courses/' + id + '/days/' + day + '/learn', save ? { save } : {}),
  /** Saves some of an open day's words into my vocabulary (tagged with the course tag); doesn't mark the day learned. */
  saveCourseWords: (id: string, day: number, words: string[]) =>
    req<CourseSaveResult>('POST', '/courses/' + id + '/days/' + day + '/words/save', { words }),
  /** Opening the homework starts its timer, so only call this when the learner starts (or reviews) it. */
  getHomework: (id: string, day: number) => req<Homework>('GET', '/courses/' + id + '/days/' + day + '/homework'),
  /** One answer per question, in order ('' for none). Each day can be handed in once. */
  submitHomework: (id: string, day: number, answers: string[]) => req<HomeworkResult>('POST', '/courses/' + id + '/days/' + day + '/homework', { answers }),
  getLeaderboard: (id: string, day?: number) => req<Leaderboard>('GET', '/courses/' + id + '/leaderboard' + (day ? '?day=' + day : '')),
  /** Earlier words to practise (missed ones first) and the day's recap story. Not graded. */
  getWarmup: (id: string, day: number) => req<Warmup>('GET', '/courses/' + id + '/days/' + day + '/warmup'),
  /** Marks the day's warm-up as done: after the practice (with its result) or when the learner skips it (no result). */
  /** The grammar of a day's example sentences (Learn step). */
  courseGrammar: (id: string, day: number) => req<{ items: { word: string; ex: string; grammar: GrammarView }[] }>('GET', '/courses/' + id + '/days/' + day + '/grammar'),
  warmupDone: (id: string, day: number, correct?: number, total?: number) =>
    req<{ warmedUp: number[] }>('POST', '/courses/' + id + '/days/' + day + '/warmup/done', correct !== undefined ? { correct, total } : {}),
  /** The day's approved listening dialogue, or { dialogue: null } when there's none. 403 when the day isn't open for me. */
  getListening: (id: string, day: number) => req<Listening>('GET', '/courses/' + id + '/days/' + day + '/listening'),
  /** Marks the day's listening as done: after the practice (with its result) or when the learner skips it (no result). */
  listeningDone: (id: string, day: number, correct?: number, total?: number) =>
    req<{ listened: number[] }>('POST', '/courses/' + id + '/days/' + day + '/listening/done', correct !== undefined ? { correct, total } : {}),

  /* Owner: who's taking the course and how they're doing. 403 for everyone else. */
  listMembers: (id: string) => req<CourseMembers>('GET', '/courses/' + id + '/members'),
  getMember: (id: string, userId: string) => req<CourseMemberDetail>('GET', '/courses/' + id + '/members/' + userId),
  /** Removes a learner; their homework is deleted too. 400 for the owner themself. */
  removeMember: (id: string, userId: string) => req<void>('DELETE', '/courses/' + id + '/members/' + userId),

  /* Owner: the tense question bank. Homework uses approved items and is frozen once someone hands that day in. */
  listQuestions: (id: string, day: number) => req<BankItem[]>('GET', '/courses/' + id + '/questions?day=' + day),
  /** Adds pending questions (AI, or built-in templates when AI is unavailable). Can take a while. */
  generateQuestions: (id: string, day: number, opts: { tenses?: Tense[]; perWord?: number }) =>
    req<BankGenerateResult>('POST', '/courses/' + id + '/days/' + day + '/questions/generate', opts),
  /** A question (or recap) written by hand; approved straight away. A new recap replaces the day's old one. */
  addQuestion: (id: string, day: number, q: BankInput) => req<BankItem>('POST', '/courses/' + id + '/days/' + day + '/questions', q),
  updateQuestion: (id: string, qid: string, q: BankPatch) => req<BankItem>('PATCH', '/courses/' + id + '/questions/' + qid, q),
  /** A listening dialogue written by hand or imported; approved straight away (replaces the day's approved one). */
  addDialogue: (id: string, day: number, data: Dialogue) => req<BankItem>('POST', '/courses/' + id + '/days/' + day + '/questions', { kind: 'dialogue', data }),
  /** AI writes a pending dialogue with the day's words (one daily AI generation). 422 when AI isn't available. */
  generateDialogue: (id: string, day: number) => req<DialogueGenerateResult>('POST', '/courses/' + id + '/days/' + day + '/dialogue/generate'),
  setQuestionsStatus: (id: string, ids: string[], status: BankStatus) => req<{ updated: number }>('POST', '/courses/' + id + '/questions/status', { ids, status }),
  deleteQuestion: (id: string, qid: string) => req<void>('DELETE', '/courses/' + id + '/questions/' + qid),
  /** Imports up to 100 rows; good ones are approved straight away, bad ones come back in errors. */
  /** The word sentence bank's sentences for a day's words (owner). */
  bankSentences: (id: string, day: number) => req<{ words: BankWord[] }>('GET', '/courses/' + id + '/days/' + day + '/sentence-bank'),
  /** Turn picked bank sentences into the day's questions (approved). items: the day's whole bank. */
  addFromBank: (id: string, day: number, items: { id: string; kind: 'tense' | 'tenseChoice' }[]) =>
    req<{ added: number; skipped: number; items: BankItem[] }>('POST', '/courses/' + id + '/days/' + day + '/sentence-bank', { items }),
  importQuestions: (id: string, day: number, items: ImportRow[]) =>
    req<ImportResult>('POST', '/courses/' + id + '/days/' + day + '/questions/import', { items }),

  /* Notifications. Both GETs also make the server check for new ones (at most once a minute per user). */
  notifications: (limit = 30, before?: number) => req<NotePage>('GET', '/notifications?limit=' + limit + (before ? '&before=' + before : '')),
  unreadNotifications: () => req<{ unread: number }>('GET', '/notifications/unread'),
  /** Marks the given notifications read, or every one with 'all'. */
  markNotificationsRead: (ids: string[] | 'all') => req<{ unread: number }>('POST', '/notifications/read', ids === 'all' ? { all: true } : { ids }),
  deleteNotification: (id: string) => req<void>('DELETE', '/notifications/' + id),

  /* Grammar: the lessons (Foundations, then tenses), my mastery of each, and practice sets (graded on the server). */
  grammar: () => req<GrammarList>('GET', '/grammar'),
  grammarLesson: (tense: string) => req<GrammarLesson>('GET', '/grammar/' + encodeURIComponent(tense)),
  grammarPractice: (mode: string, n = 10) => req<GrammarPractice>('GET', '/grammar/practice?mode=' + encodeURIComponent(mode) + '&n=' + n),
  /** 1–30 answers ('' for none). Updates my mastery of each lesson in the set. */
  submitGrammar: (answers: GrammarAnswer[]) => req<GrammarGraded>('POST', '/grammar/practice', { answers }),
  /** The placement test (fixed questions, about 19) and my last result. */
  grammarPlacement: () => req<{ questions: GrammarQuestion[]; last: GrammarPlacementInfo | null }>('GET', '/grammar/placement'),
  /** Grades the placement test and starts each lesson's mastery from it (throttled: 10 a minute). */
  submitPlacement: (answers: GrammarAnswer[]) => req<GrammarPlacementGraded>('POST', '/grammar/placement', { answers }),

  /* Dictation: the sets with my mastery, a set's tips, practice items (the text is sent because the device speaks it). */
  dictation: () => req<DictationList>('GET', '/dictation'),
  dictationSet: (id: string) => req<DictationSetDetail>('GET', '/dictation/' + encodeURIComponent(id)),
  /** mode: a set id, 'mix' or 'daily'; n 5–20 (for passages it counts passages, at most 3). */
  dictationPractice: (mode: string, n = 10) => req<DictationPracticeSet>('GET', '/dictation/practice?mode=' + encodeURIComponent(mode) + '&n=' + n),
  /** Grades answers (1–20) and records them in my mastery. */
  submitDictation: (answers: DictationAnswer[]) => req<DictationGraded>('POST', '/dictation/practice', { answers }),
  /** Stateless grading (1–20 pairs) — sentences from my own words. */
  gradeDictation: (items: { text: string; typed: string }[]) => req<{ results: DictationGrade[] }>('POST', '/dictation/grade', { items })
};
