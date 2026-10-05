import type { Category, Data, Progress, Rating, Settings, Word } from './data';

/** Wordbook API. Defaults to the server on Render; set VITE_API_URL in .env to use another one (e.g. http://localhost:3000/api). */
const BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'https://english-be-ys8a.onrender.com/api';
const TOKEN_KEY = 'wordbook:token';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
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
    throw new ApiError(msg, res.status);
  }
  return json as T;
}

export type WordInput = Omit<Word, 'id' | 'status' | 'dueAt' | 'addedAt' | 'hist'>;
export interface LookupResult {
  source: 'collection' | 'builtin' | 'online';
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
  unshare: (id: string) => req<void>('DELETE', '/library/' + id)
};
