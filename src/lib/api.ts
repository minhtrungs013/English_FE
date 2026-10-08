import type { Category, Data, Progress, Rating, Settings, Word } from './data';

/** Wordbook API. Defaults to the server on Render; set VITE_API_URL in .env to use another one (e.g. http://localhost:3000/api). */
const BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'https://english-be-ys8a.onrender.com/api';
const TOKEN_KEY = 'wordbook:token';

export class ApiError extends Error {
  /** `body` is the server's JSON error, when there is one. */
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown> | null = null) { super(message); }
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
}
export interface User { id: string; name: string; email: string }

export type Topic = 'it' | 'interview' | 'customer' | 'leader' | 'toeic' | 'other';
export interface LibraryWord {
  id: string; word: string; ipa: string; pos: string; meaning: string; vi: string; ex: string;
  syn: string[]; ant: string[]; level: Word['level']; topic: Topic;
  /** '' for built-in words. */
  authorId: string; authorName: string; saves: number; sharedAt: number;
}
export interface LibraryPage { items: LibraryWord[]; total: number; page: number; limit: number; topics: Record<Topic, number>; all: number }
export interface LibraryQuery { q?: string; topic?: Topic; level?: string; source?: 'me' | 'community' | 'builtin'; page?: number; limit?: number }
export interface AuthResponse { accessToken: string; user: User }

/* ---------- courses ---------- */
export interface CourseWord {
  word: string; ipa: string; pos: string; meaning: string; vi: string; ex: string;
  syn: string[]; ant: string[]; level: Word['level'];
  /** '' when the word isn't in the shared library (yet). */
  libraryId: string; source: 'library' | 'ai' | 'manual';
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
export interface CourseInput { title: string; description?: string; wordsPerDay?: number; visibility?: 'private' | 'public'; startDate?: string }
export interface CourseAiWord { source: 'library' | 'ai' | 'online'; word: CourseWord; quota: Quota }
export interface CourseSaveResult { added: Word[]; skipped: string[]; tag: string }
export interface CourseLearnResult extends CourseSaveResult { course: CourseDetail }

/* ---------- homework & leaderboards ---------- */
/**
 * meaning: pick the Vietnamese meaning of the English prompt · word: pick the English word for the meaning ·
 * type: type the word for the meaning · blank: type the word missing from the sentence ("_____") ·
 * tense: type the verb in brackets in the right tense ("___ (deploy)") · tenseChoice: pick the right verb form.
 */
export type HomeworkType = 'meaning' | 'word' | 'type' | 'blank' | 'tense' | 'tenseChoice';
export interface HomeworkQuestion {
  type: HomeworkType;
  /** A word from an earlier day. */
  review: boolean;
  prompt: string; hint: string;
  /** Four choices for meaning/word questions, empty for typed ones. */
  choices: string[];
}
export interface HomeworkReview extends HomeworkQuestion {
  yourAnswer: string; answer: string; correct: boolean;
  /** Tense questions only ('' otherwise); explain is in Vietnamese. */
  tense?: string; tenseLabel?: string; explain?: string;
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
  source: 'ai' | 'template' | 'manual'; status: BankStatus;
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
/** errors[].index points into the sent items; good rows are saved as approved. items: the day's whole bank. */
export interface ImportResult { added: number; errors: { index: number; message: string }[]; items: BankItem[] }
/** missed: times I got the word wrong in earlier homework. */
export interface WarmupWord { word: string; ipa: string; vi: string; meaning: string; missed: number }
/** Not graded, so the answers come with the questions. */
export interface WarmupQuestion {
  type: HomeworkType; word: string; prompt: string; hint: string; choices: string[];
  answer: string; accept: string[]; tense: string; tenseLabel: string; explain: string;
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

/* ---------- grammar (tense lessons & practice) ---------- */
/** mastery: 0–100 from the recent answers · lastAt: ms of the last practice, null when never practised. */
export interface GrammarTense {
  id: Tense; name: string; vi: string; summary: string; drills: number; mastery: number; attempts: number; lastAt: number | null;
}
export interface GrammarExample { en: string; vi: string }
export type GrammarForm = 'affirmative' | 'negative' | 'question';
/** Theory (summary, explain, vi) is in Vietnamese; patterns and examples are in English. */
export interface GrammarLesson {
  id: Tense; name: string; vi: string; summary: string;
  formula: Record<GrammarForm, { pattern: string; example: string; vi: string }>;
  uses: { title: string; explain: string; examples: GrammarExample[] }[];
  signals: string[];
  mistakes: { wrong: string; right: string; explain: string }[];
  compare: { with: Tense; explain: string; examples: (GrammarExample & { tense: Tense })[] };
  compareName: string; drillCount: number; mastery: number; attempts: number;
}
/** prompt has one "___"; typed ones ('tense') show the base verb in brackets after it. No answers — they're graded on submit. */
export interface GrammarQuestion { id: string; kind: 'tense' | 'tenseChoice'; level: 'easy' | 'medium' | 'hard'; prompt: string; choices: string[] }
/** mode: a tense id, or 'mix' (weaker tenses come up more often). */
export interface GrammarPractice { mode: string; questions: GrammarQuestion[] }
/** lesson: the lesson the question belongs to (its mastery changes) · tense / tenseLabel: the tense of the answer · explain: Vietnamese. */
export interface GrammarResult {
  id: string; lesson: Tense; tense: Tense; tenseLabel: string; prompt: string;
  yourAnswer: string; answer: string; correct: boolean; explain: string;
}
/** mastery: each practised lesson's mastery after this set. */
export interface GrammarGraded { results: GrammarResult[]; correct: number; total: number; mastery: Partial<Record<Tense, number>> }

export const api = {
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

  listCourses: (scope: CourseScope) => req<CourseSummary[]>('GET', '/courses?scope=' + scope),
  createCourse: (c: CourseInput) => req<CourseDetail>('POST', '/courses', c),
  getCourse: (id: string) => req<CourseDetail>('GET', '/courses/' + id),
  updateCourse: (id: string, c: Partial<CourseInput>) => req<CourseDetail>('PATCH', '/courses/' + id, c),
  deleteCourse: (id: string) => req<void>('DELETE', '/courses/' + id),
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
  importQuestions: (id: string, day: number, items: ImportRow[]) =>
    req<ImportResult>('POST', '/courses/' + id + '/days/' + day + '/questions/import', { items }),

  /* Notifications. Both GETs also make the server check for new ones (at most once a minute per user). */
  notifications: (limit = 30, before?: number) => req<NotePage>('GET', '/notifications?limit=' + limit + (before ? '&before=' + before : '')),
  unreadNotifications: () => req<{ unread: number }>('GET', '/notifications/unread'),
  /** Marks the given notifications read, or every one with 'all'. */
  markNotificationsRead: (ids: string[] | 'all') => req<{ unread: number }>('POST', '/notifications/read', ids === 'all' ? { all: true } : { ids }),
  deleteNotification: (id: string) => req<void>('DELETE', '/notifications/' + id),

  /* Grammar: the tense lessons, my mastery of each, and practice sets (graded on the server). */
  grammar: () => req<{ tenses: GrammarTense[] }>('GET', '/grammar'),
  grammarLesson: (tense: string) => req<GrammarLesson>('GET', '/grammar/' + encodeURIComponent(tense)),
  grammarPractice: (mode: string, n = 10) => req<GrammarPractice>('GET', '/grammar/practice?mode=' + encodeURIComponent(mode) + '&n=' + n),
  /** 1–20 answers ('' for none). Updates my mastery of each lesson in the set. */
  submitGrammar: (answers: { id: string; answer: string }[]) => req<GrammarGraded>('POST', '/grammar/practice', { answers })
};
