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
/** currentDay is 1..30: day 1 = the day they joined, +1 each day (Vietnam time). */
export type CourseEnrollment = { startDay: string; currentDay: number; learned: number[] } | null;
export interface CourseSummary {
  id: string; title: string; description: string; ownerId: string; ownerName: string; isOwner: boolean;
  visibility: 'private' | 'public'; wordsPerDay: number; totalDays: number; tag: string;
  readyDays: number; members: number;
  /** Only sent to the owner. */
  joinCode?: string;
  enrollment: CourseEnrollment;
}
export interface CourseDay {
  day: number; count: number;
  /** null = locked for this learner (a future day). */
  words: CourseWord[] | null;
}
export interface CourseDetail extends CourseSummary { days: CourseDay[] }
export type CourseScope = 'joined' | 'mine' | 'public';
export interface CourseInput { title: string; description?: string; wordsPerDay?: number; visibility?: 'private' | 'public' }
export interface CourseAiWord { source: 'library' | 'ai' | 'online'; word: CourseWord; quota: Quota }
export interface CourseLearnResult { added: Word[]; skipped: string[]; tag: string; course: CourseDetail }

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
  /** Saves that day's words into my vocabulary (tagged with the course tag). */
  learnCourseDay: (id: string, day: number) => req<CourseLearnResult>('POST', '/courses/' + id + '/days/' + day + '/learn')
};
