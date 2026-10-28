import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  api,
  type DictationGrade, type DictationGraded, type DictationGroup, type DictationList, type DictationQuestion, type DictationSetDetail,
  type DictationSetInfo, type DictationToken
} from '../lib/api';
import { shuffle, type Word } from '../lib/data';
import { recordAnswer } from '../lib/practice';
import { canSpeak, getVoicePrefs, speak, speakLine, stopSpeaking } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { Icon, PageHead } from '../components/ui';
import { ConfirmDialog, errText } from './Courses';
import { MasteryBadge, masteryLevel } from './Grammar';

/* ---------- shared ---------- */

/** Practice modes besides a set id. */
export const DICT_MINE = 'mine';
export const DICT_DAILY = 'daily';
export const DICT_MIX = 'mix';
const DICT_N = 10;
/** Slow playback: the learner's speed × this. */
export const SLOW = 0.6;

const GROUPS: { id: DictationGroup; title: string; emoji: string }[] = [
  { id: 'basics', title: 'Basics', emoji: '🔢' },
  { id: 'sentences', title: 'Sentences', emoji: '💬' },
  { id: 'passages', title: 'Passages', emoji: '📄' }
];

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

/** One item to type: a line (one part) or a passage (3–5 sentences). `note` is shown after checking (own words: the word and its meaning). */
interface Item {
  id: string; kind: 'line' | 'passage'; title?: string; focus?: string; note?: string;
  /** From my words: the bank sentence's key (marked practised after checking). */
  key?: string;
  parts: { text: string; vi: string }[];
}

/**
 * "From my words": up to 10 example sentences from the learner's word list (shuffled). With fewer than 3 examples the
 * words themselves fill the set up.
 */
export function wordItems(words: Word[], n = DICT_N): Item[] {
  const ok = (t: string) => t.trim().length > 0 && t.trim().length <= 400;
  const withEx = shuffle(words.filter((w) => ok(w.ex ?? '')));
  const items: Item[] = withEx.slice(0, n).map((w) => ({
    id: 'w:' + w.id, kind: 'line', parts: [{ text: w.ex.trim(), vi: '' }], note: w.word + (w.vi ? ' — ' + w.vi : '')
  }));
  if (items.length < 3) {
    const used = new Set(items.map((x) => x.id));
    const rest = shuffle(words.filter((w) => !used.has('w:' + w.id) && ok(w.word))).slice(0, n - items.length);
    items.push(...rest.map((w): Item => ({ id: 'w:' + w.id + ':word', kind: 'line', parts: [{ text: w.word.trim(), vi: w.vi }] })));
  }
  return items;
}

function fromQuestion(q: DictationQuestion): Item {
  return q.kind === 'passage'
    ? { id: q.id, kind: 'passage', title: q.title, parts: q.sentences.map((x) => ({ text: x.text, vi: x.vi })) }
    : { id: q.id, kind: 'line', focus: q.focus, parts: [{ text: q.text, vi: q.vi }] };
}

/** The set an M item belongs to: ids are "<set>:<index>". */
const setOf = (id: string) => id.split(':')[0];

/** Hint 1: one "_" per word · hint 2: each word's first letter, the rest as "_" (punctuation kept) · hint 3: the text. */
function hintText(text: string, level: number): string {
  const words = text.trim().split(/\s+/);
  if (level >= 3) return text;
  if (level === 1) return words.map(() => '_').join(' ');
  return words.map((w) => {
    let first = true;
    return Array.from(w).map((ch) => {
      if (!/[\p{L}\p{N}]/u.test(ch)) return ch;
      if (first) { first = false; return ch; }
      return '_';
    }).join('');
  }).join(' ');
}

/** The hint in words, for screen readers. */
function hintSr(text: string, level: number): string {
  const words = text.trim().split(/\s+/);
  if (level >= 3) return 'Answer: ' + text;
  if (level === 1) return 'Hint: ' + plural(words.length, 'word') + '.';
  return 'Hint: ' + plural(words.length, 'word') + ', starting with ' + words.map((w) => (w.match(/[\p{L}\p{N}]/u)?.[0] ?? w)).join(', ') + '.';
}

/* ---------- Dictation hub ---------- */

function MasteryBar({ value }: { value: number }) {
  return <span className="gpl-bar dc-bar" aria-hidden="true"><span className={'m-' + masteryLevel(value)} style={{ width: Math.min(100, Math.max(0, value)) + '%' }} /></span>;
}

function SetCard({ t }: { t: DictationSetInfo }) {
  const { a } = useWB();
  return (
    <li className="card gcard dc-set">
      <div className="gcard-t">
        <h3 className="gcard-name dc-set-name">
          <button className="gcard-link" onClick={() => a.startDictation(t.id)} aria-describedby={'dcs-' + t.id}>
            {t.name}<span className="c-sr">: start dictation</span>
          </button>
        </h3>
        <span className="gcard-vi" lang="vi">{t.vi}</span>
      </div>
      {t.summary && <p className="gcard-sum muted sm" lang="vi">{t.summary}</p>}
      <MasteryBar value={t.mastery} />
      <div className="gcard-foot" id={'dcs-' + t.id}>
        <MasteryBadge value={t.mastery} />
        <span className="muted xs">{plural(t.items, 'item')}{t.attempts ? '' : ' · not practised yet'}</span>
        <Icon name="right" size="sm" className="gcard-go" />
      </div>
    </li>
  );
}

type GroupFilter = 'all' | DictationGroup;
const FILTER_KEY = 'wb.dictation.filter';
const FILTERS: { id: GroupFilter; title: string }[] = [{ id: 'all', title: 'All' }, ...GROUPS.map((g) => ({ id: g.id, title: g.title }))];
const isFilter = (v: unknown): v is GroupFilter => FILTERS.some((f) => f.id === v);

/** The Dictation page ("Nghe – chép"): today's dictation and from my words on top, then the sets with a group filter. */
export function DictationHub() {
  const { s, a } = useWB();
  const [data, setData] = useState<DictationList | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilterState] = useState<GroupFilter>(() => {
    try { const v = localStorage.getItem(FILTER_KEY); return isFilter(v) ? v : 'all'; } catch { return 'all'; }
  });
  const setFilter = (v: GroupFilter) => {
    setFilterState(v);
    try { localStorage.setItem(FILTER_KEY, v); } catch { /* storage blocked: just for this visit */ }
  };

  const load = () => {
    let on = true;
    setErr('');
    api.dictation()
      .then((r) => { if (on) setData(r); })
      .catch((e) => { if (on) setErr(errText(e, 'Couldn’t load the dictation sets.')); });
    return () => { on = false; };
  };
  useEffect(load, []);

  const exCount = s.words.filter((w) => (w.ex ?? '').trim()).length;
  const mineN = s.words.length ? wordItems(s.words).length : 0;
  const doneToday = !!data?.practisedToday;
  const sets = data ? data.sets.filter((x) => filter === 'all' || x.group === filter) : null;
  const filterTitle = FILTERS.find((f) => f.id === filter)!.title;

  return (
    <>
      <button className="back" onClick={() => a.go('practice')}><Icon name="left" size="sm" />Practice</button>
      <PageHead title="Dictation" sub="Listen to a sentence and type exactly what you hear." />

      <div className="dc-top">
        <section className={'card dc-tcard' + (doneToday ? ' is-done' : '')} aria-labelledby="dc-day-t">
          <span className={'stat-ic ' + (doneToday ? 't-green' : 't-indigo')} aria-hidden="true"><Icon name={doneToday ? 'checkc' : 'calendar'} size="lg" /></span>
          <div className="dc-tcard-b">
            <h2 id="dc-day-t" className="dc-tcard-t">
              Today’s dictation
              {doneToday && <span className="badge t-green"><Icon name="check" size="sm" />Done today ✓</span>}
            </h2>
            <p className="muted sm" id="dc-day-s">{plural(DICT_N, 'sentence')} picked for you.</p>
          </div>
          <button className={'btn ' + (doneToday ? 'btn-secondary' : 'btn-primary')} onClick={() => a.startDictation(DICT_DAILY)} aria-describedby="dc-day-s">
            {doneToday ? <><Icon name="refresh" size="sm" />Practise again</> : <>Start<Icon name="right" size="sm" /></>}
            <span className="c-sr"> today’s dictation</span>
          </button>
        </section>

        <section className="card dc-tcard" aria-labelledby="dc-mine-t">
          <span className="stat-ic t-blue" aria-hidden="true"><Icon name="headphones" size="lg" /></span>
          <div className="dc-tcard-b">
            <h2 id="dc-mine-t" className="dc-tcard-t">From my words</h2>
            <p className="muted sm" id="dc-mine-s">
              {!s.words.length
                ? 'Add words with example sentences first.'
                : exCount >= 3
                  ? 'Sentences from your word list · ' + plural(Math.min(DICT_N, exCount), 'sentence') + '.'
                  : 'Sentences from your word list; few examples, so some items are single words.'}
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => a.startDictation(DICT_MINE)} disabled={!mineN} aria-describedby="dc-mine-s">
            Start<span className="c-sr"> dictation from my words</span><Icon name="right" size="sm" />
          </button>
        </section>
      </div>

      <section className="dc-sets" aria-labelledby="dc-sets-h">
        <div className="dc-sets-h">
          <h2 id="dc-sets-h" className="h2">Practice sets</h2>
          {data && data.sets.length > 1 && (
            <button className="linkbtn" onClick={() => a.startDictation(DICT_MIX)}><Icon name="zap" size="sm" />Mixed dictation<span className="c-sr"> — your weakest sets come up most</span></button>
          )}
        </div>
        <div className="chips dc-filter" role="group" aria-label="Show sets">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={'chip' + (filter === f.id ? ' on' : '')} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.title}</button>
          ))}
        </div>

        {err ? (
          <div className="card dc-err" role="alert">
            <span className="errtxt"><Icon name="alert" size="sm" />{err}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => { setData(null); load(); }}><Icon name="refresh" size="sm" />Try again</button>
          </div>
        ) : !sets ? (
          <div className="ggrid dc-grid" aria-busy="true" aria-label="Loading dictation sets">
            {[0, 1, 2].map((k) => <div key={k} className="sk" style={{ height: 140, borderRadius: 'var(--r-lg)' }} />)}
          </div>
        ) : !sets.length ? (
          <p className="muted sm">No sets in {filterTitle} yet.</p>
        ) : (
          <ul className="ggrid dc-grid" aria-label={filterTitle + ' sets'}>
            {sets.map((t) => <SetCard key={t.id} t={t} />)}
          </ul>
        )}
      </section>
    </>
  );
}

/* ---------- feedback ---------- */

/** The aligned words, coloured; every word also says in words what happened (for screen readers). */
export function Tokens({ tokens }: { tokens: DictationToken[] }) {
  return (
    <p className="dc-toks">
      {tokens.map((t, k) => {
        let vis: ReactNode;
        let sr: string;
        switch (t.status) {
          case 'ok':
            vis = <span className="dt dt-ok">{t.expected}</span>;
            sr = t.expected ?? '';
            break;
          case 'near':
            vis = <span className="dt dt-near">{t.expected}<small className="dt-note">typo: {t.typed}</small></span>;
            sr = 'You typed “' + (t.typed ?? '') + '”, expected “' + (t.expected ?? '') + '” (a typo)';
            break;
          case 'wrong':
            vis = <span className="dt dt-wrong"><s>{t.typed}</s> <b>{t.expected}</b></span>;
            sr = 'You typed “' + (t.typed ?? '') + '”, expected “' + (t.expected ?? '') + '”';
            break;
          case 'missing':
            vis = <span className="dt dt-miss">{t.expected}</span>;
            sr = 'Missing word: ' + (t.expected ?? '');
            break;
          default:
            vis = <span className="dt dt-extra"><s>{t.typed}</s></span>;
            sr = 'Extra word: ' + (t.typed ?? '');
        }
        return (
          <Fragment key={k}>
            {k > 0 && ' '}
            <span aria-hidden="true">{vis}</span>
            <span className="c-sr">{sr}{t.status === 'ok' ? '' : '.'} </span>
          </Fragment>
        );
      })}
    </p>
  );
}

function issues(g: DictationGrade): number {
  return g.tokens.filter((t) => t.status !== 'ok').length;
}

/* ---------- practice screen ---------- */

interface Checked { passed: boolean; score: number; grades: DictationGrade[] }
interface Draft { typed: string[]; plays: number; hints: number; tries: number; checked: Checked | null }
type Phase = 'loading' | 'error' | 'taking' | 'summary';

const emptyDraft = (it: Item): Draft => ({ typed: it.parts.map(() => ''), plays: 0, hints: 0, tries: 0, checked: null });

/**
 * A dictation set in focus (full screen): one item at a time — play it (normal or slow), type it, use hints, check it.
 * Each Check is one request: stateless grading for "From my words", recorded practice for the sets. Then a summary.
 */
export function DictationPractice() {
  const { s, a } = useWB();
  const mode = s.dictation!.mode;
  const mine = mode === DICT_MINE;
  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [sets, setSets] = useState<DictationSetInfo[]>([]);
  const [detail, setDetail] = useState<DictationSetDetail | null>(null);
  /** Mastery of each set after the latest check (M only). */
  const [mastery, setMastery] = useState<Record<string, number>>({});
  const started = useRef(false);
  const inputs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const sumHead = useRef<HTMLHeadingElement>(null);
  const errHead = useRef<HTMLHeadingElement>(null);
  /** Bumped on every play / stop so a running "Play all" stops. */
  const chain = useRef(0);
  /** The sentence (passage) last focused, for Ctrl+Space. */
  const focused = useRef(0);

  const setName = (id: string) => sets.find((x) => x.id === id)?.name ?? id;
  const title = mine ? 'Dictation: from my words' : mode === DICT_DAILY ? 'Today’s dictation' : mode === DICT_MIX ? 'Mixed dictation'
    : (detail?.name ?? setName(mode)) + ' · dictation';
  const sub = mine ? 'Sentences from your word list' : detail ? detail.vi : 'Nghe – chép';
  const n = items.length;
  const it = items[i];
  const d = drafts[i];

  const load = async () => {
    setPhase('loading');
    setErr('');
    try {
      if (mine) {
        // Sentences from the sentence bank for my words (fresh ones first); my own examples when the server can't help.
        const r = await api.practiceSentences('dictation', DICT_N).catch(() => null);
        const fromBank: Item[] = (r?.items ?? []).map((x) => ({ id: 'w:' + x.wordId + ':' + x.key.slice(0, 24), kind: 'line', key: x.key, parts: [{ text: x.sentence, vi: '' }], note: x.word + (x.vi ? ' — ' + x.vi : '') }));
        const xs = fromBank.length >= 3 ? fromBank : wordItems(s.words);
        if (!xs.length) throw new Error('Add words with example sentences first.');
        setItems(xs);
        setDrafts(xs.map(emptyDraft));
      } else {
        const isSet = mode !== DICT_DAILY && mode !== DICT_MIX;
        const [p, list, det] = await Promise.all([
          api.dictationPractice(mode, DICT_N),
          api.dictation().catch(() => null),
          isSet ? api.dictationSet(mode).catch(() => null) : Promise.resolve(null)
        ]);
        if (!p.items.length) throw new Error('There’s nothing to practise here yet.');
        const xs = p.items.map(fromQuestion);
        if (list) setSets(list.sets);
        setDetail(det);
        setItems(xs);
        setDrafts(xs.map(emptyDraft));
      }
      setI(0);
      setPhase('taking');
    } catch (e) {
      setErr(errText(e, 'Couldn’t load the dictation.'));
      setPhase('error');
    }
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { chain.current++; stopSpeaking(); }, []);

  const update = (fn: (x: Draft) => Draft) => setDrafts((prev) => prev.map((x, k) => (k === i ? fn(x) : x)));
  const countPlay = () => update((x) => ({ ...x, plays: Math.min(50, x.plays + 1) }));

  const play = (text: string, factor = 1) => {
    chain.current++;
    speak(text, factor);
    countPlay();
  };
  /** Plays without counting (the summary). */
  const replayOnly = (text: string) => {
    chain.current++;
    speak(text);
  };
  const playAll = (parts: { text: string }[], factor = 1, count = true) => {
    const id = ++chain.current;
    const prefs = getVoicePrefs();
    let voice: SpeechSynthesisVoice | undefined;
    try { voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === prefs.voice); } catch { voice = undefined; }
    const step = (k: number) => {
      if (k >= parts.length || chain.current !== id) return;
      speakLine(parts[k].text, { voice, pitch: prefs.pitch }, factor, () => {
        if (chain.current === id) window.setTimeout(() => step(k + 1), 450);
      });
    };
    step(0);
    if (count) countPlay();
  };
  /** Ctrl+Space / auto-play: the line, or the passage sentence being typed. */
  const replay = () => {
    if (!it) return;
    if (it.kind === 'line') play(it.parts[0].text);
    else play(it.parts[Math.min(focused.current, it.parts.length - 1)].text);
  };

  // A new line plays once by itself (counted); a passage waits for the learner.
  const autoKey = useRef('');
  useEffect(() => {
    if (phase !== 'taking' || !it || it.kind !== 'line') return;
    const key = s.dictation!.run + ':' + i;
    if (autoKey.current === key) return;
    autoKey.current = key;
    const t = window.setTimeout(() => play(it.parts[0].text), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, i]);

  // Focus: the first text box on a new item; the summary / error heading when they appear.
  useEffect(() => {
    try { window.scrollTo(0, 0); } catch { /* ignore */ }
    if (phase === 'taking') { focused.current = 0; inputs.current[0]?.focus(); }
    else if (phase === 'summary') sumHead.current?.focus();
    else if (phase === 'error') errHead.current?.focus();
  }, [phase, i]);

  const check = async () => {
    if (!it || !d || d.checked || busy) return;
    setBusy(true);
    setLive('Checking…');
    try {
      let res: Checked;
      if (mine) {
        const r = await api.gradeDictation(it.parts.map((p, k) => ({ text: p.text, typed: (d.typed[k] ?? '').slice(0, 400) })));
        const grades = r.results;
        const score = grades.length ? Math.round(grades.reduce((t, g) => t + g.score, 0) / grades.length) : 0;
        res = { grades, score, passed: grades.every((g) => g.passed) && d.hints < 3 };
        if (it.key) void api.practiceSeen([{ key: it.key, ok: res.passed }]).catch(() => undefined);
        // The word's practice stats (Practice → Words to fix): items are 'w:<my word id>…'.
        if (it.id.startsWith('w:')) recordAnswer(it.id.split(':')[1], 'dictation', res.passed);
      } else {
        const typed = d.typed.map((t) => t.slice(0, 400));
        const r: DictationGraded = await api.submitDictation([{
          id: it.id, plays: d.plays, hints: d.hints,
          ...(it.kind === 'passage' ? { typedSentences: typed } : { typed: typed[0] })
        }]);
        const one = r.results[0];
        if (!one) throw new Error('Couldn’t check your answer.');
        const grades = one.kind === 'passage' ? (one.sentences ?? []).map((x) => x.grade) : one.grade ? [one.grade] : [];
        res = { grades, score: one.score, passed: one.passed };
        setMastery((m) => ({ ...m, ...r.mastery }));
      }
      update((x) => ({ ...x, checked: res, tries: x.tries + 1 }));
      const bad = res.grades.reduce((t, g) => t + issues(g), 0);
      setLive((res.passed ? 'Correct! ' : '') + 'Score ' + res.score + '%.' + (bad ? ' ' + plural(bad, 'word') + ' to fix.' : '') + (d.hints >= 3 ? ' The answer was shown, so this one doesn’t count as passed.' : ''));
      window.setTimeout(() => nextBtn.current?.focus(), 0);
    } catch (e) {
      setLive('');
      a.showToast(errText(e, 'Couldn’t check your answer.'), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const tryAgain = () => {
    update((x) => ({ ...x, typed: x.typed.map(() => ''), checked: null }));
    setLive('Try again — type it once more.');
    window.setTimeout(() => { focused.current = 0; inputs.current[0]?.focus(); }, 0);
  };
  const next = () => {
    chain.current++;
    stopSpeaking();
    if (i < n - 1) { setI(i + 1); setLive(''); }
    else { setPhase('summary'); setLive(''); }
  };
  const hint = () => {
    if (!d || d.checked || d.hints >= 3) return;
    const h = d.hints + 1;
    update((x) => ({ ...x, hints: h }));
    setLive(h === 1 ? 'Hint: the number of words is shown.' : h === 2 ? 'Hint: the first letter of each word is shown.' : 'The answer is shown. This item won’t count as passed.');
  };

  const close = () => a.exitDictation();
  const requestClose = () => {
    const typing = phase === 'taking' && d && !d.checked && d.typed.some((t) => t.trim());
    if (typing) setLeaving(true);
    else close();
  };

  // Esc leaves; Ctrl+Space replays; Enter goes on when the focus isn't on a control.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (leaving || document.querySelector('[role="dialog"]')) return;
      if (ev.key === 'Escape') { ev.preventDefault(); requestClose(); return; }
      if (phase !== 'taking' || !it || !d) return;
      if (ev.key === ' ' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); replay(); return; }
      const tag = (ev.target as HTMLElement).tagName;
      if (ev.ctrlKey || ev.metaKey || ev.altKey || /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(tag)) return;
      if (ev.key === 'Enter') { ev.preventDefault(); if (d.checked) next(); else void check(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- body ---------- */
  let body: ReactNode = null;
  if (phase === 'loading') {
    body = (
      <div aria-busy="true" aria-label="Loading the dictation" className="stack" style={{ gap: 14 }}>
        <div className="sk" style={{ height: 30, width: 220 }} />
        <div className="sk" style={{ height: 260, borderRadius: 'var(--r-2xl)' }} />
      </div>
    );
  } else if (phase === 'error') {
    body = (
      <div className="card empty">
        <div className="empty-ic t-red"><Icon name="alert" size="xl" /></div>
        <h2 ref={errHead} tabIndex={-1} className="gerr-h">Can’t start the dictation</h2>
        <p>{err}</p>
        <div className="tact" style={{ justifyContent: 'center' }}>
          {!mine && <button className="btn btn-primary" onClick={() => void load()}><Icon name="refresh" size="sm" />Try again</button>}
          {mine && <button className="btn btn-primary" onClick={() => { a.exitDictation(); a.goNew(); }}><Icon name="plus" size="sm" />Add a word</button>}
          <button className="btn btn-secondary" onClick={close}>Back to Practice</button>
        </div>
      </div>
    );
  } else if (phase === 'taking' && it && d) {
    const passage = it.kind === 'passage';
    const ck = d.checked;
    const hid = 'dq-' + i;
    body = (
      <>
        {detail && detail.tips.length > 0 && i === 0 && (
          <details className="gpl-ans dc-tips">
            <summary>Listening tips</summary>
            <ul lang="vi">{detail.tips.map((t, k) => <li key={k}>{t}</li>)}</ul>
          </details>
        )}
        <div key={i} className="hwq animA dc-q">
          <h2 className="qkicker gqk" id={hid}>
            {passage ? 'Passage' : 'Sentence'} {i + 1} of {n}{it.focus ? ' · listen for: ' + it.focus : ''}
          </h2>
          {passage && it.title && <p className="dc-title">{it.title}</p>}

          <div className="listen dc-play">
            <button className="playbig" onClick={() => (passage ? playAll(it.parts) : play(it.parts[0].text))} aria-label={passage ? 'Play all sentences' : 'Play the sentence'}>
              <Icon name="play" />
            </button>
            <div className="stack" style={{ gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => (passage ? playAll(it.parts, SLOW) : play(it.parts[0].text, SLOW))}>
                <span aria-hidden="true">🐢</span>Slow<span className="c-sr">{passage ? ': play all sentences slowly' : ': play the sentence slowly'}</span>
              </button>
              <span className="muted sm" aria-live="off">{d.plays ? 'Played ' + d.plays + '×' : 'Not played yet'}</span>
            </div>
          </div>
          {!canSpeak() && <div className="errtxt"><Icon name="alert" size="sm" />Your browser can’t play speech, so audio may not work here.</div>}

          <div className="dc-inputs">
            {it.parts.map((p, k) => {
              const g = ck?.grades[k];
              const lid = hid + '-l' + k;
              return (
                <div key={k} className="dc-part">
                  <div className="dc-part-h">
                    <label htmlFor={hid + '-in' + k} id={lid} className="label">{passage ? 'Sentence ' + (k + 1) : 'Type what you hear'}</label>
                    {passage && (
                      <span className="dc-part-btns">
                        <button className="iconbtn sm" onClick={() => play(p.text)} aria-label={'Play sentence ' + (k + 1)} title="Play"><Icon name="volume" size="sm" /></button>
                        <button className="iconbtn sm dc-slow" onClick={() => play(p.text, SLOW)} aria-label={'Play sentence ' + (k + 1) + ' slowly'} title="Slow"><span aria-hidden="true">🐢</span></button>
                      </span>
                    )}
                  </div>
                  {d.hints > 0 && !ck && (
                    <p className={'dc-hint' + (d.hints >= 3 ? ' shown' : '')}>
                      <span aria-hidden="true">{hintText(p.text, d.hints)}</span>
                      <span className="c-sr">{hintSr(p.text, d.hints)}</span>
                    </p>
                  )}
                  <textarea
                    ref={(el) => { inputs.current[k] = el; }}
                    id={hid + '-in' + k}
                    className={'input dc-in' + (g ? (g.passed ? ' ok' : ' err') : '')}
                    rows={passage ? 2 : 3}
                    value={d.typed[k] ?? ''}
                    readOnly={!!ck}
                    maxLength={400}
                    placeholder={passage ? 'Sentence ' + (k + 1) + '…' : 'Type the sentence…'}
                    spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off"
                    onFocus={() => { focused.current = k; }}
                    onChange={(e) => { const v = e.target.value; update((x) => ({ ...x, typed: x.typed.map((y, j) => (j === k ? v : y)) })); }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || e.shiftKey) return;
                      e.preventDefault();
                      if (ck) next();
                      else if (k < it.parts.length - 1) inputs.current[k + 1]?.focus();
                      else void check();
                    }}
                  />
                  {g && (
                    <div className={'dc-fb ' + (g.passed ? 'ok' : 'no')}>
                      <Tokens tokens={g.tokens} />
                      <div className="dc-full">
                        <span className="dc-en">{p.text}</span>
                        <button className="iconbtn sm" onClick={() => play(p.text)} aria-label={'Play again: ' + p.text}><Icon name="volume" size="sm" /></button>
                      </div>
                      {p.vi && <div className="dc-vi" lang="vi">{p.vi}</div>}
                      {passage && <span className="muted xs">Score {g.score}%</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {ck ? (
            <div className={'fb ' + (ck.passed ? 'ok' : 'no') + ' dc-res'}>
              <div className="fb-t"><Icon name={ck.passed ? 'checkc' : 'alert'} />{ck.passed ? 'Correct!' : d.hints >= 3 ? 'Answer shown' : 'Not quite'}<span className="dc-score">Score {ck.score}%</span></div>
              {it.note && <div className="muted sm">From your word: <b>{it.note}</b></div>}
              {d.tries > 1 && <div className="muted xs">Attempt {d.tries}</div>}
            </div>
          ) : (
            <span className="keyhint">
              <span className="kbd">Ctrl</span> + <span className="kbd">Space</span> to replay · <span className="kbd">Enter</span> to {passage ? 'go to the next sentence / check' : 'check'}
            </span>
          )}

          <div className="hwnav dc-nav">
            {ck ? (
              <>
                <button className="btn btn-secondary" onClick={tryAgain}><Icon name="refresh" size="sm" />Try again</button>
                <button ref={nextBtn} className="btn btn-primary" onClick={next}>{i < n - 1 ? <>Next<Icon name="right" size="sm" /></> : <><Icon name="check" size="sm" />See results</>}</button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={hint} disabled={d.hints >= 3 || busy}
                  aria-label={d.hints === 0 ? 'Hint: show the number of words' : d.hints === 1 ? 'Hint: show first letters' : d.hints === 2 ? 'Show the answer (won’t count as passed)' : 'No more hints'}>
                  <Icon name="sparkle" size="sm" />{d.hints === 0 ? 'Hint' : d.hints === 1 ? 'More hint' : d.hints === 2 ? 'Show answer' : 'Answer shown'}
                  {d.hints > 0 && <span className="badge t-amber dc-hints">{d.hints}/3</span>}
                </button>
                <button className="btn btn-primary" onClick={() => void check()} disabled={busy || !d.typed.some((t) => t.trim())}>
                  {busy ? 'Checking…' : <><Icon name="check" size="sm" />Check</>}
                </button>
              </>
            )}
          </div>
        </div>
      </>
    );
  } else if (phase === 'summary') {
    const done = drafts.map((x, k) => ({ x, it: items[k] })).filter((r) => r.x.checked);
    const passed = done.filter((r) => r.x.checked!.passed).length;
    const avg = done.length ? Math.round(done.reduce((t, r) => t + r.x.checked!.score, 0) / done.length) : 0;
    const changed = Object.entries(mastery);
    const before = new Map(sets.map((x) => [x.id, x.mastery]));
    body = (
      <div className="gres">
        <div className="hwresult">
          <h2 ref={sumHead} tabIndex={-1} className="qkicker gqk">Your result<span className="c-sr">: {passed} of {n} passed, average score {avg}%</span></h2>
          <div className="hwscore" aria-hidden="true"><b>{passed}</b><span className="muted">/ {n} passed</span></div>
          <span className="muted sm">Average score {avg}% · {passed === n ? 'Perfect — every item right.' : avg >= 70 ? 'Nice work. Replay the ones you missed below.' : 'Keep going — listen again to the ones you missed.'}</span>
        </div>

        {!mine && changed.length > 0 && (
          <section className="gmchg-w" aria-labelledby="dc-m">
            <h3 id="dc-m" className="label">Mastery</h3>
            <ul className="gmchg">
              {changed.map(([id, after]) => {
                const b = before.get(id);
                const dlt = b === undefined ? 0 : after - b;
                return (
                  <li key={id}>
                    <span className="gmchg-n">{setName(id)}</span>
                    <span className="gmchg-v">
                      {b !== undefined && <>{b}%<span aria-hidden="true"> → </span><span className="c-sr"> to </span></>}<b>{after}%</b>
                    </span>
                    {dlt !== 0 && <span className={'badge ' + (dlt > 0 ? 't-green' : 't-red')}>{dlt > 0 ? '+' : ''}{dlt}<span className="c-sr"> points</span></span>}
                    <MasteryBadge value={after} />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <ol className="hwrev" aria-label="Your items">
          {items.map((x, k) => {
            const c = drafts[k]?.checked;
            const ok = !!c?.passed;
            const text = x.parts.map((p) => p.text).join(' ');
            return (
              <li key={x.id + k} className="hwritem">
                <span className={'hwrnum ' + (ok ? 't-green' : 't-red')} aria-hidden="true"><Icon name={ok ? 'check' : 'x'} size="sm" /></span>
                <div className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
                  <span className="muted xs" style={{ fontWeight: 700 }}>
                    {k + 1}. {x.title ?? (mine ? 'From your words' : setName(setOf(x.id)))}
                    <span className="c-sr">: {c ? (ok ? 'passed' : 'not passed') : 'not checked'}</span>
                    {c && <> · {c.score}%</>}
                  </span>
                  <span className="dc-en">{text}</span>
                  {x.parts.some((p) => p.vi) && <span className="dc-vi" lang="vi">{x.parts.map((p) => p.vi).join(' ')}</span>}
                </div>
                <button className="iconbtn sm" onClick={() => (x.kind === 'passage' ? playAll(x.parts, 1, false) : replayOnly(x.parts[0].text))} aria-label={'Play: ' + (x.title ?? text)}>
                  <Icon name="volume" size="sm" />
                </button>
              </li>
            );
          })}
        </ol>

        <div className="stdone-act">
          <button className="btn btn-primary btn-lg" onClick={() => a.startDictation(mode)}><Icon name="refresh" size="sm" />Practise again</button>
          <button className="btn btn-secondary btn-lg" onClick={close}><Icon name="left" size="sm" />Back to Dictation</button>
        </div>
      </div>
    );
  }

  const checkedN = drafts.filter((x) => x.checked).length;
  return (
    <div className="session study gsession dc-session">
      <header className="stbar">
        <div className="stbar-top">
          <button className="iconbtn" onClick={requestClose} aria-label="Close dictation" title="Close (Esc)"><Icon name="x" /></button>
          <div className="stbar-t">
            <h1 className="stbar-c gtitle">{title}</h1>
            <span className="muted sm" lang={!mine && detail ? 'vi' : undefined}>{sub}</span>
          </div>
        </div>
        {n > 0 && (phase === 'taking' || phase === 'summary') && (
          <div className="gpbar">
            <span className="scount" aria-hidden="true">{phase === 'summary' ? 'Done' : (i + 1) + ' / ' + n}</span>
            <span className="prog" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={n}
              aria-valuenow={phase === 'summary' ? n : i + 1}
              aria-valuetext={phase === 'summary' ? 'All items done' : 'Item ' + (i + 1) + ' of ' + n + ', ' + checkedN + ' checked'}>
              <div style={{ width: (phase === 'summary' ? 100 : Math.round(((i + (d?.checked ? 1 : 0)) / n) * 100)) + '%' }} />
            </span>
          </div>
        )}
      </header>
      <main className="stmain">
        <div className="stbody">{body}</div>
      </main>
      <div className="c-sr" aria-live="polite" aria-atomic="true">{live}</div>
      {leaving && (
        <ConfirmDialog title="Leave this dictation?"
          text={mine ? 'What you’ve typed won’t be kept.' : 'What you’ve checked is saved; the item you’re typing won’t be.'}
          confirm="Leave" onConfirm={() => { setLeaving(false); close(); }} onClose={() => setLeaving(false)} />
      )}
    </div>
  );
}
