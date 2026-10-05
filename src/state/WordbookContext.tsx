import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DAY, MIN, dayKey, emptyForm, isDue, shuffle,
  type Data, type FormData, type Rating, type Settings, type Word
} from '../lib/data';
import type { IconName } from '../lib/icons';
import { api, ApiError, getToken, setToken, setUnauthorizedHandler, type AuthResponse, type CourseDetail, type CourseSaveResult, type LibraryWord, type Topic } from '../lib/api';
import { stopSpeaking } from '../lib/speech';

export const LOOKUP_STEPS = ['Checking your word list', 'Looking up the dictionary', 'Translating to Vietnamese', 'Filling in the details'];

export type Route = 'dashboard' | 'library' | 'vocab' | 'new' | 'edit' | 'detail' | 'practice' | 'categories' | 'tags' | 'settings' | 'review' | 'courses' | 'course' | 'courseEdit';
export type PracticeMode = 'mc' | 'fill' | 'trans' | 'listen';

export interface ReviewState {
  sid: number; queue: string[]; i: number; flipped: boolean; done: boolean; title: string; practice: boolean; anim: number;
  res: { again: number; hard: number; good: number; easy: number };
}
export interface PracticeQuestion { id: string; opts?: string[]; ans?: number; before?: string; after?: string; answer?: string }
export interface PracticeState {
  pid: number; mode: PracticeMode; qs: PracticeQuestion[]; i: number; picked: number | null; input: string;
  checked: boolean; correct: boolean; score: number; done: boolean; anim: number;
}
export type Modal =
  | { kind: 'delWord' | 'delCat' | 'delTag'; id: string; title: string }
  | { kind: 'delAll' | 'delAccount'; title: string }
  | { kind: 'cat'; id: string | null; name: string; icon: IconName; err?: string }
  | { kind: 'tag'; name: string; err?: string };
export interface Filters { q: string; level: string; status: string; cat: string; tag: string }
export interface Toast { msg: string; kind: 'ok' | 'bad' }

interface UiState {
  /** 'auth' = logged out (login/register screen); otherwise the initial load from the API. */
  status: 'auth' | 'loading' | 'ready' | 'error'; loadError: string; saving: boolean;
  route: Route; prevRoute: Route; sel: string | null; rail: boolean;
  filters: Filters;
  menu: string | null; notif: boolean; account: boolean;
  form: FormData; editForm: FormData; formErr: string; aiBusy: boolean; aiStep: number;
  review: ReviewState | null; practice: PracticeState | null;
  modal: Modal | null; toast: Toast | null; chart: '7' | '30';
  /** Search to start the Library page with (set by the header search). */
  libraryQ: string;
  /** The course open on the 'course' / 'courseEdit' pages. */
  courseId: string;
}
export type State = Data & UiState;

const NO_FILTERS: Filters = { q: '', level: 'all', status: 'all', cat: 'all', tag: 'all' };
const EMPTY_DATA: Data = {
  words: [], cats: [], tags: [], shared: [], userId: '', autofill: { used: 0, limit: 3 },
  settings: { name: '', email: '', goal: '20', dir: 'en-vi', autoplay: true, showEx: true, theme: 'light', accent: 'indigo', voice: '', rate: 0.9, pitch: 1 },
  progress: { streak: 0, lastStreakDay: '', reviewedDay: '', reviewedToday: 0 }
};

function errMsg(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.';
}

function initialState(): State {
  return {
    ...EMPTY_DATA, status: getToken() ? 'loading' : 'auth', loadError: '', saving: false,
    route: 'dashboard', prevRoute: 'dashboard', sel: null, rail: false,
    filters: NO_FILTERS, menu: null, notif: false, account: false,
    form: emptyForm(), editForm: emptyForm(), formErr: '', aiBusy: false, aiStep: 0,
    review: null, practice: null, modal: null, toast: null, chart: '7', libraryQ: '', courseId: ''
  };
}

function useWordbookState() {
  const [s, setS] = useState<State>(initialState);
  const ref = useRef(s);
  ref.current = s;
  const toastTimer = useRef<number | undefined>(undefined);

  const set = (p: Partial<State> | ((prev: State) => Partial<State>)) =>
    setS((prev) => ({ ...prev, ...(typeof p === 'function' ? p(prev) : p) }));

  const load = async () => {
    set({ status: 'loading', loadError: '' });
    try {
      const d = await api.bootstrap();
      // An older server may not send autofill yet; keep the defaults then.
      set({ ...d, autofill: d.autofill ?? EMPTY_DATA.autofill, status: 'ready' });
    } catch (e) {
      // A rejected session has already logged out (see setUnauthorizedHandler); keep the login screen.
      if (e instanceof ApiError && e.status === 401) return;
      set({ status: 'error', loadError: errMsg(e) });
    }
  };

  useEffect(() => {
    setUnauthorizedHandler((msg) => logout(msg));
    if (getToken()) void load();
    return () => { window.clearTimeout(toastTimer.current); window.clearTimeout(settingsTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (msg: string, kind: Toast['kind'] = 'ok') => {
    window.clearTimeout(toastTimer.current);
    set({ toast: { msg, kind } });
    toastTimer.current = window.setTimeout(() => set({ toast: null }), 2800);
  };

  /** Runs an API call; on failure shows the error as a toast and returns undefined. */
  const call = async <T,>(p: Promise<T>): Promise<T | undefined> => {
    try {
      return await p;
    } catch (e) {
      showToast(errMsg(e), 'bad');
      return undefined;
    }
  };

  /* ---------- auth ---------- */
  const startSession = async (res: AuthResponse) => {
    setToken(res.accessToken);
    await load();
  };
  const login = async (email: string, password: string) => startSession(await api.login(email, password));
  const register = async (name: string, email: string, password: string) => startSession(await api.register(name, email, password));
  const logout = (msg?: string) => {
    setToken(null);
    stopSpeaking();
    window.clearTimeout(settingsTimer.current);
    pendingSettings.current = {};
    setS(initialState());
    if (msg) showToast(msg, 'bad');
  };

  // Settings are saved as the user types, so batch changes for half a second.
  const settingsTimer = useRef<number | undefined>(undefined);
  const pendingSettings = useRef<Partial<Settings>>({});

  const go = (route: Route, extra?: Partial<State>) => {
    set({ route, menu: null, notif: false, account: false, ...extra });
    try { window.scrollTo(0, 0); } catch { /* ignore */ }
  };

  const inSession = () => {
    const c = ref.current;
    return (c.route === 'review' && !!c.review) || (c.route === 'practice' && !!c.practice);
  };

  /* ---------- review ---------- */
  const startReview = (ids: string[], title = 'Review', practice = false) => {
    const c = ref.current;
    const from: Route = c.route === 'review' ? c.prevRoute : c.route;
    set({
      route: 'review', prevRoute: from === 'review' ? 'dashboard' : from, menu: null, notif: false, account: false, modal: null, practice: null,
      review: { sid: Date.now(), queue: ids, i: 0, flipped: false, res: { again: 0, hard: 0, good: 0, easy: 0 }, done: false, title, practice, anim: 0 }
    });
  };
  const startDue = () => {
    const c = ref.current;
    const goal = Number(c.settings.goal) || 20;
    const now = Date.now();
    const ids = c.words.filter((w) => isDue(w, now)).sort((a, b) => a.dueAt - b.dueAt).slice(0, goal).map((w) => w.id);
    startReview(ids, 'Review', false);
  };
  const exitSession = () => {
    const c = ref.current;
    stopSpeaking();
    if (c.route === 'practice') { set({ practice: null }); return; }
    const back = c.prevRoute && c.prevRoute !== 'review' ? c.prevRoute : 'dashboard';
    set({ review: null });
    go(back);
  };
  const flip = () => {
    const rv = ref.current.review;
    if (!rv || rv.flipped || rv.done) return;
    set({ review: { ...rv, flipped: true } });
  };
  const rate = (r: Rating) => {
    const c = ref.current, rv = c.review;
    if (!rv || !rv.flipped || rv.done) return;
    const id = rv.queue[rv.i];
    const now = Date.now();
    const words = c.words.map((w): Word => {
      if (w.id !== id) return w;
      const goods = w.hist.filter((h) => h.r === 'Good' || h.r === 'Easy').length;
      let status = w.status, dueAt = w.dueAt;
      if (r === 'Again') { status = 'learning'; dueAt = now + 10 * MIN; }
      else if (r === 'Hard') { status = 'learning'; dueAt = now + DAY; }
      else if (r === 'Good') { status = goods >= 2 ? 'mastered' : 'learning'; dueAt = now + 3 * DAY; }
      else { status = goods >= 1 ? 'mastered' : 'learning'; dueAt = now + 7 * DAY; }
      return { ...w, status, dueAt, hist: [{ at: now, r }, ...w.hist] };
    });
    const key = r.toLowerCase() as keyof ReviewState['res'];
    const res = { ...rv.res, [key]: rv.res[key] + 1 };
    const i = rv.i + 1;
    const done = i >= rv.queue.length;
    const patch: Partial<State> = { words, review: { ...rv, i: done ? rv.i : i, flipped: false, res, done, anim: rv.anim + 1 } };
    const today = dayKey(now);
    if (!rv.practice) {
      // Same rule as the API: the first review of a day extends the streak.
      const p = c.progress;
      const progress = { ...p, reviewedDay: today, reviewedToday: (p.reviewedDay === today ? p.reviewedToday : 0) + 1 };
      if (p.lastStreakDay !== today) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        progress.streak = p.lastStreakDay === dayKey(y) ? p.streak + 1 : 1;
        progress.lastStreakDay = today;
      }
      patch.progress = progress;
    }
    // Update the screen right away, then sync with the server's result.
    set(patch);
    void call(api.reviewWord(id, r, rv.practice, today)).then((res) => {
      if (!res) return;
      set((prev) => ({
        words: prev.words.map((w) => (w.id === res.word.id ? res.word : w)),
        ...(res.progress ? { progress: res.progress } : {})
      }));
    });
  };

  /* ---------- practice ---------- */
  const startPractice = (mode: PracticeMode | 'flash') => {
    const ws = ref.current.words;
    if (mode === 'flash') {
      if (!ws.length) { showToast('Add some words first to practice.', 'bad'); return; }
      startReview(shuffle(ws.map((w) => w.id)).slice(0, 20), 'Flashcards', true);
      return;
    }
    let qs: PracticeQuestion[] = [];
    if (mode === 'mc') {
      const withMeaning = ws.filter((w) => w.meaning);
      if (withMeaning.length < 4) { showToast('You need at least 4 words with meanings for multiple choice.', 'bad'); return; }
      qs = shuffle(withMeaning).slice(0, 10).map((w) => {
        const others = shuffle(withMeaning.filter((o) => o.id !== w.id && o.meaning !== w.meaning)).slice(0, 3).map((o) => o.meaning);
        const opts = shuffle([w.meaning, ...others]);
        return { id: w.id, opts, ans: opts.indexOf(w.meaning) };
      });
    } else if (mode === 'fill') {
      qs = shuffle(ws.filter((w) => w.ex && w.ex.toLowerCase().includes(w.word.toLowerCase()))).slice(0, 10).map((w) => {
        const k = w.ex.toLowerCase().indexOf(w.word.toLowerCase());
        return { id: w.id, before: w.ex.slice(0, k), after: w.ex.slice(k + w.word.length), answer: w.word };
      });
    } else if (mode === 'trans') {
      qs = shuffle(ws.filter((w) => w.vi)).slice(0, 10).map((w) => ({ id: w.id, answer: w.word }));
    } else {
      qs = shuffle(ws).slice(0, 10).map((w) => ({ id: w.id, answer: w.word }));
    }
    if (!qs.length) { showToast('Not enough words with the needed details yet.', 'bad'); return; }
    set({ route: 'practice', menu: null, review: null, practice: { pid: Date.now(), mode, qs, i: 0, picked: null, input: '', checked: false, correct: false, score: 0, done: false, anim: 0 } });
  };
  const pUpdate = (patch: Partial<PracticeState>) => set((prev) => (prev.practice ? { practice: { ...prev.practice, ...patch } } : {}));
  const pPick = (idx: number) => {
    const p = ref.current.practice;
    if (!p || p.checked) return;
    const ok = idx === p.qs[p.i].ans;
    pUpdate({ picked: idx, checked: true, correct: ok, score: p.score + (ok ? 1 : 0) });
  };
  const pCheck = (skip: boolean) => {
    const p = ref.current.practice;
    if (!p || p.checked) return;
    if (!skip && !p.input.trim()) return;
    const ok = !skip && p.input.trim().toLowerCase() === (p.qs[p.i].answer ?? '').toLowerCase();
    pUpdate({ checked: true, correct: ok, score: p.score + (ok ? 1 : 0) });
  };
  const pNext = () => {
    const p = ref.current.practice;
    if (!p || !p.checked) return;
    const i = p.i + 1;
    if (i >= p.qs.length) { pUpdate({ done: true }); return; }
    pUpdate({ i, picked: null, input: '', checked: false, correct: false, anim: p.anim + 1 });
  };

  /* ---------- add / edit form ---------- */
  const fk = (): 'form' | 'editForm' => (ref.current.route === 'edit' ? 'editForm' : 'form');
  const setF = (patch: Partial<FormData>) => {
    const k = fk();
    set((prev) => ({ [k]: { ...prev[k], ...patch }, ...(patch.word !== undefined ? { formErr: '' } : {}) }));
  };
  const addChip = (field: 'syn' | 'ant') => {
    const f = ref.current[fk()];
    const inKey = field === 'syn' ? 'synIn' : 'antIn';
    const parts = f[inKey].split(',').map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    const list = f[field].slice();
    parts.forEach((p) => { if (!list.some((x) => x.toLowerCase() === p.toLowerCase())) list.push(p); });
    setF({ [field]: list, [inKey]: '' });
  };
  const generate = async () => {
    const c = ref.current;
    const k = fk();
    const word = c[k].word.trim();
    if (!word) { set({ formErr: 'Type a word first, then auto-fill its details.' }); return; }
    if (c.aiBusy) return;
    set({ aiBusy: true, aiStep: 0, formErr: '' });
    // The lookup is a single request; step through the labels while it runs.
    const stepper = window.setInterval(() => set((prev) => ({ aiStep: Math.min(prev.aiStep + 1, LOOKUP_STEPS.length - 1) })), 600);
    let data: Awaited<ReturnType<typeof api.lookup>> | null = null;
    let failed = '';
    try {
      data = await api.lookup(word);
      if (data.quota) set({ autofill: data.quota });
    } catch (e) {
      const quota = e instanceof ApiError ? (e.body?.quota as { used: number; limit: number } | undefined) : undefined;
      if (quota) set({ autofill: quota });
      // Daily limit reached (429): show the server's message and mark today's auto-fills as used up.
      if (e instanceof ApiError && e.status === 429) set((prev) => ({ autofill: { ...prev.autofill, used: prev.autofill.limit } }));
      if (!(e instanceof ApiError && e.status === 404)) failed = errMsg(e);
    } finally {
      window.clearInterval(stepper);
    }
    set({ aiBusy: false, aiStep: 0 });
    if (ref.current.route !== (k === 'form' ? 'new' : 'edit')) return;
    if (data) {
      // Fill only what was found; keep anything the user typed for missing fields.
      const patch: Partial<FormData> = {};
      for (const key of ['ipa', 'pos', 'meaning', 'vi', 'ex', 'syn', 'ant', 'level'] as const) {
        const v = data[key];
        if (Array.isArray(v) ? v.length : v) Object.assign(patch, { [key]: v });
      }
      setF(patch);
      showToast('Details filled in — review and edit before saving.');
    } else {
      showToast(failed || 'No details found for “' + word + '”. You can fill them in yourself.', 'bad');
    }
  };
  const save = async () => {
    const c = ref.current, k = fk();
    if (c.saving) return;
    const f = { ...c[k] };
    const word = f.word.trim();
    if (!word) { set({ formErr: 'Please enter a word.' }); return; }
    const dup = c.words.find((w) => w.word.toLowerCase() === word.toLowerCase() && (k === 'form' || w.id !== c.sel));
    if (dup) { set({ formErr: '“' + word + '” is already in your collection.' }); return; }
    (['syn', 'ant'] as const).forEach((fld) => {
      const extra = f[fld === 'syn' ? 'synIn' : 'antIn'].split(',').map((x) => x.trim()).filter(Boolean);
      f[fld] = f[fld].concat(extra.filter((x) => !f[fld].includes(x)));
    });
    const data = { word, ipa: f.ipa.trim(), pos: f.pos, meaning: f.meaning.trim(), vi: f.vi.trim(), ex: f.ex.trim(), syn: f.syn, ant: f.ant, level: f.level, cat: f.cat, tags: f.tags, notes: f.notes.trim() };
    set({ saving: true });
    try {
      if (k === 'form') {
        const nw = await api.createWord(data);
        set((prev) => ({ words: [nw, ...prev.words], form: emptyForm(), formErr: '' }));
        go('detail', { sel: nw.id });
        showToast('Saved “' + word + '” to your vocabulary.');
      } else {
        const id = c.sel!;
        const uw = await api.updateWord(id, data);
        set((prev) => ({ words: prev.words.map((w) => (w.id === id ? uw : w)), formErr: '' }));
        go('detail', { sel: id });
        showToast('Changes saved.');
      }
    } catch (e) {
      set({ formErr: errMsg(e) });
    } finally {
      set({ saving: false });
    }
  };
  const openEdit = (id: string) => {
    const w = ref.current.words.find((x) => x.id === id);
    if (!w) return;
    go('edit', {
      sel: id, formErr: '',
      editForm: { word: w.word, ipa: w.ipa, pos: w.pos, meaning: w.meaning, vi: w.vi, ex: w.ex, syn: w.syn.slice(), ant: w.ant.slice(), level: w.level, cat: w.cat, tags: w.tags.slice(), notes: w.notes, synIn: '', antIn: '' }
    });
  };
  const goNew = () => {
    const c = ref.current;
    go('new', { prevRoute: c.route === 'new' ? c.prevRoute : c.route, formErr: '' });
  };
  const formCancel = () => {
    const c = ref.current;
    if (c.route === 'edit') { go('detail', { sel: c.sel, formErr: '' }); return; }
    set({ form: emptyForm(), formErr: '' });
    go(c.prevRoute && c.prevRoute !== 'new' && c.prevRoute !== 'edit' ? c.prevRoute : 'vocab');
  };

  /* ---------- modals ---------- */
  const askDeleteWord = (id: string) => {
    const w = ref.current.words.find((x) => x.id === id);
    if (w) set({ modal: { kind: 'delWord', id, title: 'Delete “' + w.word + '”?' } });
  };
  const confirmModal = async () => {
    const c = ref.current, m = c.modal;
    if (!m || c.saving) return;
    set({ saving: true });
    try {
      if (m.kind === 'delWord') {
        await api.deleteWord(m.id);
        const w = c.words.find((x) => x.id === m.id);
        set((prev) => ({ modal: null, words: prev.words.filter((x) => x.id !== m.id) }));
        if (c.route === 'detail' || c.route === 'edit') go('vocab');
        showToast('Deleted “' + (w ? w.word : '') + '”.');
      } else if (m.kind === 'delCat') {
        await api.deleteCategory(m.id);
        set((prev) => ({
          modal: null, cats: prev.cats.filter((x) => x.id !== m.id),
          words: prev.words.map((w) => (w.cat === m.id ? { ...w, cat: '' } : w)),
          filters: { ...prev.filters, cat: prev.filters.cat === m.id ? 'all' : prev.filters.cat }
        }));
        showToast('Category deleted. Its words are now uncategorized.');
      } else if (m.kind === 'delTag') {
        await api.deleteTag(m.id);
        set((prev) => ({
          modal: null, tags: prev.tags.filter((t) => t !== m.id),
          words: prev.words.map((w) => (w.tags.includes(m.id) ? { ...w, tags: w.tags.filter((t) => t !== m.id) } : w)),
          filters: { ...prev.filters, tag: prev.filters.tag === m.id ? 'all' : prev.filters.tag }
        }));
        showToast('Tag #' + m.id + ' deleted.');
      } else if (m.kind === 'delAll') {
        await api.clearAll();
        set({ modal: null, words: [], cats: [], tags: [], filters: NO_FILTERS, progress: EMPTY_DATA.progress });
        go('dashboard');
        showToast('All data deleted.');
      } else if (m.kind === 'delAccount') {
        await api.deleteAccount();
        logout();
        showToast('Your account has been deleted.');
      }
    } catch (e) {
      set({ modal: null });
      showToast(errMsg(e), 'bad');
    } finally {
      set({ saving: false });
    }
  };
  const submitModal = async () => {
    const c = ref.current, m = c.modal;
    if (!m || c.saving) return;
    const k = fk();
    const inForm = c.route === 'new' || c.route === 'edit';
    if (m.kind === 'cat') {
      const name = m.name.trim();
      if (!name) { set({ modal: { ...m, err: 'Please enter a category name.' } }); return; }
      if (c.cats.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== m.id)) { set({ modal: { ...m, err: 'A category with this name already exists.' } }); return; }
      set({ saving: true });
      try {
        if (m.id) {
          const id = m.id;
          const cat = await api.updateCategory(id, { name, icon: m.icon });
          set((prev) => ({ modal: null, cats: prev.cats.map((x) => (x.id === id ? cat : x)) }));
          showToast('Category updated.');
        } else {
          const cat = await api.createCategory({ name, icon: m.icon });
          set((prev) => ({ modal: null, menu: null, cats: [...prev.cats, cat], ...(inForm ? { [k]: { ...prev[k], cat: cat.id } } : {}) }));
          showToast('Category “' + name + '” created.');
        }
      } catch (e) {
        set({ modal: { ...m, err: errMsg(e) } });
      } finally {
        set({ saving: false });
      }
    } else if (m.kind === 'tag') {
      const name = m.name.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (!name) { set({ modal: { ...m, err: 'Please enter a tag name.' } }); return; }
      if (c.tags.includes(name)) { set({ modal: { ...m, err: '#' + name + ' already exists.' } }); return; }
      set({ saving: true });
      try {
        const res = await api.createTag(name);
        set((prev) => ({ modal: null, tags: [...prev.tags, res.name], ...(inForm ? { [k]: { ...prev[k], tags: [...prev[k].tags, res.name] } } : {}) }));
        showToast('Tag #' + res.name + ' created.');
      } catch (e) {
        set({ modal: { ...m, err: errMsg(e) } });
      } finally {
        set({ saving: false });
      }
    }
  };
  const patchModal = (patch: Record<string, unknown>) => set((prev) => (prev.modal ? { modal: { ...prev.modal, ...patch } as Modal } : {}));

  /* ---------- misc ---------- */
  const exportData = () => {
    const c = ref.current;
    try {
      const data = c.words.map((w) => ({
        word: w.word, pronunciation: w.ipa, partOfSpeech: w.pos, meaning: w.meaning, translation: w.vi, example: w.ex,
        synonyms: w.syn, antonyms: w.ant, level: w.level, status: w.status, tags: w.tags, notes: w.notes,
        category: c.cats.find((x) => x.id === w.cat)?.name ?? ''
      }));
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'vocabulary.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast('Exported ' + c.words.length + ' words.');
    } catch {
      showToast('Export is not available here.', 'bad');
    }
  };
  const setSettings = (patch: Partial<Settings>) => {
    set((prev) => ({ settings: { ...prev.settings, ...patch } }));
    pendingSettings.current = { ...pendingSettings.current, ...patch };
    window.clearTimeout(settingsTimer.current);
    settingsTimer.current = window.setTimeout(() => {
      const { name, ...prefs } = pendingSettings.current;
      delete prefs.email;
      pendingSettings.current = {};
      // The name belongs to the account; the email is the login and can't be changed here.
      if (name !== undefined && name.trim()) void call(api.updateMe(name.trim()));
      if (Object.keys(prefs).length) void call(api.updateSettings(prefs));
    }, 500);
  };
  /* ---------- library ---------- */
  /** Copies a library word into my vocabulary. Returns the new word, or undefined on failure. */
  const saveFromLibrary = async (lw: LibraryWord): Promise<Word | undefined> => {
    const res = await call(api.saveFromLibrary(lw.id));
    if (!res) return undefined;
    set((prev) => ({
      words: [res.word, ...prev.words],
      tags: prev.tags.includes(res.tag) ? prev.tags : [...prev.tags, res.tag],
      shared: prev.shared.includes(lw.word.toLowerCase()) ? prev.shared : [...prev.shared, lw.word.toLowerCase()]
    }));
    showToast('Saved “' + lw.word + '” to your vocabulary.');
    return res.word;
  };
  const shareWord = async (w: Word, topic: Topic): Promise<boolean> => {
    const res = await call(api.shareToLibrary(w.id, topic));
    if (!res) return false;
    set((prev) => ({ shared: [...prev.shared, w.word.toLowerCase()] }));
    showToast('Shared “' + w.word + '” to the library. Everyone can see it now.');
    return true;
  };

  /* ---------- courses ---------- */
  /** Adds course words the server saved to my vocabulary (and the course tag, if it's new). */
  const mergeCourseWords = (res: CourseSaveResult) =>
    set((prev) => {
      const have = new Set(prev.words.map((w) => w.id));
      return {
        words: [...res.added.filter((w) => !have.has(w.id)), ...prev.words],
        tags: !res.tag || prev.tags.includes(res.tag) ? prev.tags : [...prev.tags, res.tag]
      };
    });
  /**
   * Marks a course day learned. save: which of its words to also save into my vocabulary ([] = none, omitted = all).
   * Returns the updated course, or undefined on failure.
   */
  const learnCourseDay = async (courseId: string, day: number, save?: string[]): Promise<CourseDetail | undefined> => {
    const res = await call(api.learnCourseDay(courseId, day, save));
    if (!res) return undefined;
    mergeCourseWords(res);
    const n = res.added.length, k = res.skipped.length;
    showToast(n
      ? 'Saved ' + n + (n === 1 ? ' word' : ' words') + (k ? ' · ' + k + ' already in your words' : '')
      : k ? 'All ' + k + (k === 1 ? ' word is' : ' words are') + ' already in your words.' : 'Day ' + day + ' learned.');
    return res.course;
  };
  /** Saves some of a course day's words into my vocabulary without marking the day learned. Returns false on failure. */
  const saveCourseWords = async (courseId: string, day: number, words: string[]): Promise<boolean> => {
    const res = await call(api.saveCourseWords(courseId, day, words));
    if (!res) return false;
    mergeCourseWords(res);
    const n = res.added.length, k = res.skipped.length;
    showToast(n === 1 && !k ? 'Saved “' + res.added[0].word + '” to My Vocabulary.'
      : n ? 'Saved ' + n + (n === 1 ? ' word' : ' words') + ' to My Vocabulary' + (k ? ' · ' + k + ' already there.' : '.')
        : k === 1 ? '“' + res.skipped[0] + '” is already in My Vocabulary.' : 'All ' + k + ' words are already in My Vocabulary.');
    return true;
  };
  const openCourse = (id: string, edit = false) => go(edit ? 'courseEdit' : 'course', { courseId: id });

  const setFilters = (patch: Partial<Filters>) => set((prev) => ({ filters: { ...prev.filters, ...patch } }));
  const showWordsWith = (patch: Partial<Filters>) => go('vocab', { filters: { ...NO_FILTERS, ...patch } });

  const actions = {
    set, go, showToast, inSession,
    startReview, startDue, exitSession, flip, rate,
    startPractice, pUpdate, pPick, pCheck, pNext,
    setF, addChip, generate, save, openEdit, goNew, formCancel,
    askDeleteWord, confirmModal, submitModal, patchModal,
    exportData, setSettings, setFilters, showWordsWith, reload: load, login, register, logout, saveFromLibrary, shareWord, learnCourseDay, saveCourseWords, openCourse,
    clearFilters: () => set({ filters: NO_FILTERS }),
    setMenu: (menu: string | null) => set({ menu, notif: false, account: false }),
    closeMenus: () => set({ menu: null, notif: false, account: false }),
    closeModal: () => set({ modal: null }),
    openNewCat: () => set({ menu: null, modal: { kind: 'cat', id: null, name: '', icon: 'briefcase' } }),
    openNewTag: () => set({ menu: null, modal: { kind: 'tag', name: '' } })
  };
  return { s, a: actions };
}

type Ctx = ReturnType<typeof useWordbookState>;
const WordbookContext = createContext<Ctx | null>(null);

export function WordbookProvider({ children }: { children: ReactNode }) {
  const value = useWordbookState();
  return <WordbookContext.Provider value={value}>{children}</WordbookContext.Provider>;
}

export function useWB(): Ctx {
  const ctx = useContext(WordbookContext);
  if (!ctx) throw new Error('useWB must be used inside <WordbookProvider>');
  return ctx;
}
