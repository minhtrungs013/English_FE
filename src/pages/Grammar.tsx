import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  api, ApiError, TENSES, isTense,
  type GrammarForm, type GrammarGraded, type GrammarLesson, type GrammarQuestion, type GrammarTense, type Tense
} from '../lib/api';
import { speak } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { EmptyState, Icon, PageHead } from '../components/ui';
import { ConfirmDialog, errText } from './Courses';
import { Prompt, TenseNote } from './CourseHomework';

/** English names of the lessons, for links shown before (or without) loading them. */
export const TENSE_NAME: Record<Tense, string> = {
  'present-simple': 'Present simple',
  'present-continuous': 'Present continuous',
  'present-perfect': 'Present perfect',
  'past-simple': 'Past simple',
  'past-continuous': 'Past continuous',
  'future-simple': 'Future simple (will)',
  'going-to': 'Future (be going to)'
};
const nameOf = (t: string) => (isTense(t) ? TENSE_NAME[t] : t);

/** Questions in a practice set. */
const PRACTICE_N = 10;
const SORT_KEY = 'wordbook:grammarSort';

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

/* ---------- mastery ---------- */
type MasteryLevel = 'new' | 'learning' | 'good' | 'mastered';
/** New at 0, Learning 1–59, Good 60–84, Mastered 85+. */
export const masteryLevel = (m: number): MasteryLevel => (m <= 0 ? 'new' : m < 60 ? 'learning' : m < 85 ? 'good' : 'mastered');
const LEVEL_LABEL: Record<MasteryLevel, string> = { new: 'New', learning: 'Learning', good: 'Good', mastered: 'Mastered' };
const LEVEL_TINT: Record<MasteryLevel, string> = { new: 'pos', learning: 't-amber', good: 't-blue', mastered: 't-green' };

/** A ring filled to the mastery, with the % in the middle. Decorative: the badge next to it says the same in words. */
function MasteryRing({ value, size = 52 }: { value: number; size?: number }) {
  const r = (size - 6) / 2;
  const len = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <span className={'gring m-' + masteryLevel(value)} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox={'0 0 ' + size + ' ' + size} width={size} height={size}>
        <circle className="gring-bg" cx={mid} cy={mid} r={r} />
        <circle className="gring-fg" cx={mid} cy={mid} r={r} strokeDasharray={len} strokeDashoffset={len * (1 - Math.min(100, Math.max(0, value)) / 100)} transform={'rotate(-90 ' + mid + ' ' + mid + ')'} />
      </svg>
      <b>{value}%</b>
    </span>
  );
}

export function MasteryBadge({ value }: { value: number }) {
  const lv = masteryLevel(value);
  return <span className={'badge ' + LEVEL_TINT[lv]}><Icon name="award" size="sm" />{LEVEL_LABEL[lv]} · {value}%<span className="c-sr"> mastery</span></span>;
}

/* ---------- Grammar home ---------- */

/** The seven tenses with my mastery of each, and a mixed practice that leans on the weakest ones. */
export function GrammarHome() {
  const { a } = useWB();
  const [list, setList] = useState<GrammarTense[] | null>(null);
  const [err, setErr] = useState('');
  const [sort, setSort] = useState<'order' | 'weak'>(() => {
    try { return localStorage.getItem(SORT_KEY) === 'weak' ? 'weak' : 'order'; } catch { return 'order'; }
  });

  const load = () => {
    let on = true;
    setErr('');
    api.grammar()
      .then((r) => { if (on) setList(r.tenses); })
      .catch((e) => { if (on) setErr(errText(e, 'Couldn’t load the lessons.')); });
    return () => { on = false; };
  };
  useEffect(load, []);

  const pickSort = (v: 'order' | 'weak') => {
    setSort(v);
    try { localStorage.setItem(SORT_KEY, v); } catch { /* storage blocked: just for this visit */ }
  };

  // Weakest first: lowest mastery, then the least practised; ties stay in lesson order (the sort is stable).
  const shown = list && (sort === 'weak' ? [...list].sort((x, y) => x.mastery - y.mastery || x.attempts - y.attempts) : list);
  const practised = list ? list.filter((t) => t.attempts > 0).length : 0;
  const avg = list && list.length ? Math.round(list.reduce((n, t) => n + t.mastery, 0) / list.length) : 0;

  return (
    <>
      <PageHead title="Grammar" sub="The seven tenses you need at work — short lessons in Vietnamese with English examples, then practice." />

      <section className="gmix" aria-labelledby="gmix-t">
        <span className="gmix-ic" aria-hidden="true"><Icon name="zap" size="lg" /></span>
        <div className="gmix-b">
          <h2 id="gmix-t" className="gmix-t">Mixed practice</h2>
          <p className="gmix-s">Focuses on your weakest tenses · {PRACTICE_N} questions</p>
        </div>
        <button className="btn btn-white btn-lg" onClick={() => a.startGrammarPractice('mix')} aria-label="Start mixed practice">
          Start<Icon name="right" size="sm" />
        </button>
      </section>

      <div className="ghead">
        <div>
          <h2 className="h2">Tenses</h2>
          {list && <span className="muted sm">{practised ? practised + ' of ' + list.length + ' practised · average mastery ' + avg + '%' : 'Start with a lesson, then practise it.'}</span>}
        </div>
        <div className="seg" role="group" aria-label="Order">
          <button className={sort === 'order' ? 'on' : ''} aria-pressed={sort === 'order'} onClick={() => pickSort('order')}>Lesson order</button>
          <button className={sort === 'weak' ? 'on' : ''} aria-pressed={sort === 'weak'} onClick={() => pickSort('weak')}>Weakest first</button>
        </div>
      </div>

      {err ? (
        <EmptyState icon="alert" tint="t-red" title="Can’t load the lessons" text={err}>
          <button className="btn btn-primary" onClick={() => { setList(null); load(); }}><Icon name="refresh" size="sm" />Try again</button>
        </EmptyState>
      ) : !shown ? (
        <div className="ggrid" aria-busy="true" aria-label="Loading lessons">
          {TENSES.map((t) => <div key={t} className="sk" style={{ height: 178, borderRadius: 16 }} />)}
        </div>
      ) : (
        <ul className="ggrid" aria-label="Tense lessons">
          {shown.map((t) => (
            <li key={t.id} className="card gcard">
              <div className="gcard-top">
                <div className="gcard-t">
                  <h3 className="gcard-name">
                    <button className="gcard-link" onClick={() => a.openGrammar(t.id)} aria-describedby={'gc-' + t.id}>{t.name}</button>
                  </h3>
                  <span className="gcard-vi" lang="vi">{t.vi}</span>
                </div>
                <MasteryRing value={t.mastery} />
              </div>
              <p className="gcard-sum muted sm" lang="vi">{t.summary}</p>
              <div className="gcard-foot" id={'gc-' + t.id}>
                <MasteryBadge value={t.mastery} />
                <span className="muted xs">{t.attempts ? plural(t.attempts, 'answer') : 'Not practised yet'}</span>
                <Icon name="right" size="sm" className="gcard-go" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ---------- lesson ---------- */

const FORMS: GrammarForm[] = ['affirmative', 'negative', 'question'];
const FORM_LABEL: Record<GrammarForm, string> = { affirmative: 'Affirmative', negative: 'Negative', question: 'Question' };

/** Part of a formula: the subject, the main verb (V, V2, V3, V-ing…), or a helper word. */
function partKind(p: string): 's' | 'v' | 'a' {
  const t = p.trim().replace(/^\(?Wh-\)?\s*/, '');
  if (/^S\b/.test(t)) return 's';
  if (/^V(?![a-z])/.test(t)) return 'v';
  return 'a';
}

/** "S + have/has + V3" with the subject, helpers and main verb coloured; " / " separates alternatives. */
function Pattern({ text }: { text: string }) {
  const alts = text.split(/\s+\/\s+/);
  return (
    <span className="gpat">
      {alts.map((alt, k) => (
        <span key={k} className="gpat-alt">
          {k > 0 && <span className="gpat-or">or</span>}
          {alt.split(/\s+\+\s+/).map((part, j) => (
            <span key={j} className="gpat-part">
              {j > 0 && <span className="gpat-plus" aria-hidden="true">+</span>}
              {j > 0 && <span className="c-sr"> plus </span>}
              <span className={'gp gp-' + partKind(part)}>{part}</span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

function SpeakBtn({ text }: { text: string }) {
  return (
    <button className="iconbtn sm" onClick={() => speak(text, 0.95)} aria-label={'Listen: ' + text} title="Listen">
      <Icon name="volume" size="sm" />
    </button>
  );
}

/** An English example (with 🔊) and its Vietnamese translation. */
function Example({ en, vi, tag }: { en: string; vi: string; tag?: ReactNode }) {
  return (
    <div className="glex">
      {tag && <div className="glex-tag">{tag}</div>}
      <div className="glex-en"><span>{en}</span><SpeakBtn text={en} /></div>
      <div className="glex-vi" lang="vi">{vi}</div>
    </div>
  );
}

function LessonLoading() {
  return (
    <div aria-busy="true" aria-label="Loading lesson">
      <div className="sk" style={{ width: 120, height: 20, marginBottom: 16 }} />
      <div className="sk" style={{ width: 300, height: 34, marginBottom: 12 }} />
      <div className="sk" style={{ width: '80%', height: 18, marginBottom: 28 }} />
      <div className="sk" style={{ height: 260, borderRadius: 16, marginBottom: 20 }} />
      <div className="sk" style={{ height: 320, borderRadius: 16 }} />
    </div>
  );
}

/** One tense: formula, uses, signal words, common mistakes and how it differs from its neighbour; then practise it. */
export function GrammarLessonPage() {
  const { s, a } = useWB();
  const id = s.grammarId;
  const [l, setL] = useState<GrammarLesson | null>(null);
  const [err, setErr] = useState<{ msg: string; missing: boolean } | null>(null);
  const [run, setRun] = useState(0);
  const head = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let on = true;
    setErr(null);
    api.grammarLesson(id)
      .then((r) => { if (on) setL(r); })
      .catch((e) => { if (on) setErr({ msg: errText(e, 'Couldn’t load the lesson.'), missing: e instanceof ApiError && e.status === 404 }); });
    return () => { on = false; };
  }, [id, run]);

  // A lesson opened (also from prev/next): say which one by moving focus to its title.
  useEffect(() => { if (l) head.current?.focus({ preventScroll: true }); }, [l?.id]);

  const back = (
    <button className="back" onClick={() => a.openGrammar()}><Icon name="left" size="sm" />Grammar</button>
  );
  if (err) {
    return (
      <>
        {back}
        <EmptyState icon="alert" tint="t-red" title={err.missing ? 'No such lesson' : 'Can’t load this lesson'} text={err.msg}>
          <div className="tact" style={{ justifyContent: 'center' }}>
            {!err.missing && <button className="btn btn-primary" onClick={() => setRun((r) => r + 1)}><Icon name="refresh" size="sm" />Try again</button>}
            <button className="btn btn-secondary" onClick={() => a.openGrammar()}>Back to Grammar</button>
          </div>
        </EmptyState>
      </>
    );
  }
  if (!l) return <>{back}<LessonLoading /></>;

  const idx = TENSES.indexOf(l.id);
  const prev = idx > 0 ? TENSES[idx - 1] : null;
  const next = idx >= 0 && idx < TENSES.length - 1 ? TENSES[idx + 1] : null;
  const tenseName = (t: Tense) => (t === l.id ? l.name : t === l.compare.with && l.compareName ? l.compareName : nameOf(t));

  return (
    <article className="glesson" aria-labelledby="gl-title">
      {back}
      <header className="glhead">
        {idx >= 0 && <span className="qkicker">Tense {idx + 1} of {TENSES.length}</span>}
        <h1 id="gl-title" ref={head} tabIndex={-1} className="h1 glh1">{l.name}</h1>
        <p className="glvi" lang="vi">{l.vi}</p>
        <p className="glsum" lang="vi">{l.summary}</p>
      </header>

      <section className="card glsec" aria-labelledby="gl-formula">
        <h2 id="gl-formula" className="glh2"><Icon name="layers" />Formula</h2>
        <p className="glkey" aria-hidden="true">
          <span className="gp gp-s">S</span>subject<span className="gp gp-a">helper</span>helper word<span className="gp gp-v">V</span>main verb
        </p>
        <table className="gltbl">
          <thead>
            <tr><th scope="col">Form</th><th scope="col">Pattern</th><th scope="col">Example</th></tr>
          </thead>
          <tbody>
            {FORMS.map((f) => {
              const row = l.formula[f];
              if (!row) return null;
              return (
                <tr key={f}>
                  <th scope="row"><span className={'badge ' + (f === 'affirmative' ? 't-green' : f === 'negative' ? 't-red' : 't-blue')}>{FORM_LABEL[f]}</span></th>
                  <td data-label="Pattern"><Pattern text={row.pattern} /></td>
                  <td data-label="Example"><Example en={row.example} vi={row.vi} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card glsec" aria-labelledby="gl-uses">
        <h2 id="gl-uses" className="glh2"><Icon name="listcheck" />How to use</h2>
        <ol className="gluses">
          {l.uses.map((u, k) => (
            <li key={k} className="gluse">
              <h3 className="gluse-t" lang="vi"><span className="gluse-n" aria-hidden="true">{k + 1}</span>{u.title}</h3>
              <p className="gluse-x" lang="vi">{u.explain}</p>
              <div className="glexs">{u.examples.map((ex, j) => <Example key={j} en={ex.en} vi={ex.vi} />)}</div>
            </li>
          ))}
        </ol>
      </section>

      {l.signals.length > 0 && (
        <section className="card glsec" aria-labelledby="gl-signals">
          <h2 id="gl-signals" className="glh2"><Icon name="hash" />Signal words</h2>
          <p className="muted sm glp">Words that often go with this tense.</p>
          <ul className="glsigs">{l.signals.map((x) => <li key={x} className="gsig">{x}</li>)}</ul>
        </section>
      )}

      {l.mistakes.length > 0 && (
        <section className="card glsec" aria-labelledby="gl-mistakes">
          <h2 id="gl-mistakes" className="glh2"><Icon name="alert" />Common mistakes</h2>
          <ul className="glmist">
            {l.mistakes.map((m, k) => (
              <li key={k} className="glmist-i">
                <div className="glwrong"><span className="glmark" aria-hidden="true">❌</span><span className="c-sr">Wrong: </span><s>{m.wrong}</s></div>
                <div className="glright">
                  <span className="glmark" aria-hidden="true">✅</span><span className="c-sr">Right: </span><span>{m.right}</span><SpeakBtn text={m.right} />
                </div>
                <p className="glmist-x" lang="vi">{m.explain}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {l.compare && (
        <section className="card glsec" aria-labelledby="gl-compare">
          <h2 id="gl-compare" className="glh2"><Icon name="refresh" />vs {l.compareName || nameOf(l.compare.with)}</h2>
          <p className="glp" lang="vi">{l.compare.explain}</p>
          <div className="glexs">
            {l.compare.examples.map((ex, k) => (
              <Example key={k} en={ex.en} vi={ex.vi}
                tag={<span className={'badge ' + (ex.tense === l.id ? 't-indigo' : 't-blue')}><Icon name="clock" size="sm" />{tenseName(ex.tense)}</span>} />
            ))}
          </div>
          {isTense(l.compare.with) && (
            <button className="linkbtn glmore" onClick={() => a.openGrammar(l.compare.with)}>
              Open the {l.compareName || nameOf(l.compare.with)} lesson<Icon name="right" size="sm" />
            </button>
          )}
        </section>
      )}

      <div className="glcta">
        <div className="glcta-m">
          <MasteryBadge value={l.mastery} />
          <span className="muted xs">{l.attempts ? plural(l.attempts, 'answer') + ' so far' : 'Not practised yet'}</span>
        </div>
        <button className="btn btn-primary" onClick={() => a.startGrammarPractice(l.id)}>
          <Icon name="zap" size="sm" />Practise this tense<span className="glcta-n">({PRACTICE_N} questions)</span>
        </button>
      </div>

      <nav className="glnav" aria-label="Other lessons">
        {prev ? (
          <button className="glnav-b" onClick={() => a.openGrammar(prev)}>
            <Icon name="left" size="sm" /><span><small>Previous</small>{TENSE_NAME[prev]}</span>
          </button>
        ) : <span />}
        {next && (
          <button className="glnav-b next" onClick={() => a.openGrammar(next)}>
            <span><small>Next</small>{TENSE_NAME[next]}</span><Icon name="right" size="sm" />
          </button>
        )}
      </nav>
    </article>
  );
}

/* ---------- practice session ---------- */

type Phase = 'loading' | 'error' | 'taking' | 'sending' | 'result';

/** The prompt with its "___" as a text box (typed questions). */
function TypedPrompt({ q, value, onChange, onEnter, inputRef, id }: {
  q: GrammarQuestion; value: string; onChange: (v: string) => void; onEnter: () => void;
  inputRef: RefObject<HTMLInputElement | null>; id: string;
}) {
  const m = /_{3,}/.exec(q.prompt);
  const before = m ? q.prompt.slice(0, m.index) : q.prompt + ' ';
  const after = m ? q.prompt.slice(m.index + m[0].length) : '';
  return (
    <>
      <p className="qtext gprompt">
        {before}
        <input ref={inputRef} className="gblank" value={value} aria-label="Your answer" aria-describedby={id + '-full'}
          style={{ width: Math.min(28, Math.max(9, value.length + 2)) + 'ch' }}
          autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={200}
          onChange={(ev) => onChange(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); onEnter(); } }} />
        {after}
      </p>
      <span id={id + '-full'} className="c-sr">{q.prompt.replace(/_{3,}/, 'blank')}. Put the verb in brackets in the right tense.</span>
    </>
  );
}

/**
 * A practice set in focus (full screen): one question at a time, typed or 4 choices; answers are graded on the server only
 * when the learner checks them all. Then the score, how each tense's mastery moved, and every answer explained.
 * Esc or ✕ leaves (asking first once something is answered).
 */
export function GrammarPractice() {
  const { s, a } = useWB();
  const mode = s.grammarPractice!.mode;
  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const [qs, setQs] = useState<GrammarQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [i, setI] = useState(0);
  /** Mastery of each tense before this set (for "40% → 55%"). */
  const [before, setBefore] = useState<Partial<Record<Tense, number>>>({});
  const [result, setResult] = useState<GrammarGraded | null>(null);
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [live, setLive] = useState('');
  const started = useRef(false);
  const qHead = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const resHead = useRef<HTMLHeadingElement>(null);
  const errHead = useRef<HTMLHeadingElement>(null);

  const title = mode === 'mix' ? 'Mixed practice' : nameOf(mode) + ' practice';
  const n = qs.length;
  const q = qs[i];
  const last = i === n - 1;
  const answered = answers.filter((x) => x.trim()).length;

  const load = async () => {
    setPhase('loading');
    setErr('');
    try {
      const [p, list] = await Promise.all([api.grammarPractice(mode, PRACTICE_N), api.grammar().catch(() => null)]);
      if (!p.questions.length) throw new Error('There are no questions to practise here yet.');
      if (list) setBefore(Object.fromEntries(list.tenses.map((t) => [t.id, t.mastery])));
      setQs(p.questions);
      setAnswers(p.questions.map(() => ''));
      setI(0);
      setPhase('taking');
    } catch (e) {
      setErr(errText(e, 'Couldn’t load the practice.'));
      setPhase('error');
    }
  };
  // Once (the ref keeps StrictMode's second effect run from loading twice).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    setAsking(false);
    setPhase('sending');
    setLive('Checking your answers…');
    try {
      const r = await api.submitGrammar(qs.map((x, k) => ({ id: x.id, answer: answers[k] ?? '' })));
      setResult(r);
      setPhase('result');
      setLive('Score: ' + r.correct + ' of ' + r.total + ' correct.');
    } catch (e) {
      a.showToast(errText(e, 'Couldn’t check your answers.'), 'bad');
      setLive('');
      setPhase('taking');
    }
  };

  const setAnswer = (v: string) => setAnswers((prev) => prev.map((x, k) => (k === i ? v : x)));
  const goTo = (k: number) => { if (k >= 0 && k < n) setI(k); };
  const next = () => {
    if (phase !== 'taking') return;
    if (!last) { goTo(i + 1); return; }
    if (answers.some((x) => !x.trim())) setAsking(true);
    else void send();
  };

  const close = () => a.exitGrammarPractice();
  const requestClose = () => {
    if ((phase === 'taking' || phase === 'sending') && answered > 0) setLeaving(true);
    else close();
  };

  // Focus: the text box for typed questions, else the question; the result / error heading when they appear.
  useEffect(() => {
    try { window.scrollTo(0, 0); } catch { /* ignore */ }
    if (phase === 'taking' && q) {
      if (q.kind === 'tense') input.current?.focus();
      else qHead.current?.focus();
    } else if (phase === 'result') resHead.current?.focus();
    else if (phase === 'error') errHead.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 'taking' ? 'taking:' + i : phase]);

  // Esc leaves (not while a dialog is open); 1–4 pick a choice; Enter goes on when the focus isn't on a control.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (asking || leaving || document.querySelector('[role="dialog"]')) return;
      if (ev.key === 'Escape') { ev.preventDefault(); requestClose(); return; }
      if (phase !== 'taking' || !q) return;
      const tag = (ev.target as HTMLElement).tagName;
      if (ev.ctrlKey || ev.metaKey || ev.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      const k = Number(ev.key);
      if (q.choices.length && k >= 1 && k <= q.choices.length) { ev.preventDefault(); setAnswer(q.choices[k - 1]); }
      else if (ev.key === 'Enter' && tag !== 'BUTTON') { ev.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- body ---------- */
  let body: ReactNode = null;
  if (phase === 'loading') {
    body = (
      <div aria-busy="true" aria-label="Loading questions" className="stack" style={{ gap: 14 }}>
        <div className="sk" style={{ height: 30, width: 220 }} />
        <div className="sk" style={{ height: 220, borderRadius: 20 }} />
      </div>
    );
  } else if (phase === 'error') {
    body = (
      <div className="card empty">
        <div className="empty-ic t-red"><Icon name="alert" size="xl" /></div>
        <h2 ref={errHead} tabIndex={-1} className="gerr-h">Can’t start the practice</h2>
        <p>{err}</p>
        <div className="tact" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => void load()}><Icon name="refresh" size="sm" />Try again</button>
          <button className="btn btn-secondary" onClick={() => a.openGrammar()}>Back to Grammar</button>
        </div>
      </div>
    );
  } else if ((phase === 'taking' || phase === 'sending') && q) {
    const answer = answers[i] ?? '';
    const hid = 'gq-' + i;
    body = (
      <>
        <ol className="gdots" aria-label="Questions">
          {qs.map((_, k) => {
            const done = !!answers[k]?.trim();
            return (
              <li key={k}>
                <button className={'gdot' + (k === i ? ' on' : '') + (done ? ' done' : '')} onClick={() => goTo(k)} disabled={phase === 'sending'}
                  aria-current={k === i ? 'step' : undefined} aria-label={'Question ' + (k + 1) + (done ? ', answered' : ', not answered')}>
                  {k + 1}
                </button>
              </li>
            );
          })}
        </ol>
        <div key={i} className="hwq animA">
          <h2 ref={qHead} tabIndex={-1} className="qkicker gqk" id={hid}>
            Question {i + 1} of {n} · {q.kind === 'tense' ? 'Put the verb in the right tense' : 'Choose the right verb form'}
          </h2>
          {q.kind === 'tense' || !q.choices.length ? (
            <TypedPrompt q={q} value={answer} onChange={setAnswer} onEnter={next} inputRef={input} id={hid} />
          ) : (
            <>
              <p className="qtext hwprompt sentence" id={hid + '-p'}><Prompt q={{ type: 'tenseChoice', prompt: q.prompt }} fill={answer} /></p>
              <div className="opts hwopts" role="group" aria-labelledby={hid + ' ' + hid + '-p'}>
                {q.choices.map((t, k) => (
                  <button key={k} className={'opt' + (answer === t ? ' picked' : '')} aria-pressed={answer === t} onClick={() => setAnswer(t)} disabled={phase === 'sending'}>
                    <span className="letter">{k + 1}</span>
                    <span className="grow">{t}</span>
                  </button>
                ))}
              </div>
              <span className="keyhint">Press <span className="kbd">1</span>–<span className="kbd">{q.choices.length}</span> to choose, <span className="kbd">Enter</span> for next</span>
            </>
          )}
        </div>
        <div className="hwnav">
          <button className="btn btn-secondary" onClick={() => goTo(i - 1)} disabled={i === 0 || phase === 'sending'}><Icon name="left" size="sm" />Back</button>
          <span className="muted sm hwcount">{answered}/{n} answered</span>
          <button className="btn btn-primary" onClick={next} disabled={phase === 'sending'}>
            {last ? (phase === 'sending' ? 'Checking…' : <><Icon name="check" size="sm" />Check answers</>) : <>Next<Icon name="right" size="sm" /></>}
          </button>
        </div>
      </>
    );
  } else if (phase === 'result' && result) {
    const lessons = (Object.entries(result.mastery) as [Tense, number][]).sort((x, y) => TENSES.indexOf(x[0]) - TENSES.indexOf(y[0]));
    const pct = result.total ? Math.round((100 * result.correct) / result.total) : 0;
    body = (
      <div className="gres">
        <div className="hwresult">
          <h2 ref={resHead} tabIndex={-1} className="qkicker gqk">Your score<span className="c-sr">: {result.correct} of {result.total} correct</span></h2>
          <div className="hwscore" aria-hidden="true"><b>{result.correct}</b><span className="muted">/ {result.total} correct</span></div>
          <span className="muted sm">
            {pct === 100 ? 'Perfect — every answer right.' : pct >= 70 ? 'Nice work. Look over the ones you missed below.' : 'Keep going — read the explanations, then try again.'}
          </span>
        </div>

        {lessons.length > 0 && (
          <section className="gmchg-w" aria-labelledby="gres-m">
            <h3 id="gres-m" className="label">Mastery</h3>
            <ul className="gmchg">
              {lessons.map(([t, after]) => {
                const b = before[t];
                const d = b === undefined ? 0 : after - b;
                return (
                  <li key={t}>
                    <span className="gmchg-n">{nameOf(t)}</span>
                    <span className="gmchg-v">
                      {b !== undefined && <>{b}%<span aria-hidden="true"> → </span><span className="c-sr"> to </span></>}<b>{after}%</b>
                    </span>
                    {d !== 0 && <span className={'badge ' + (d > 0 ? 't-green' : 't-red')}>{d > 0 ? '+' : ''}{d}<span className="c-sr"> points</span></span>}
                    <MasteryBadge value={after} />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <ol className="hwrev" aria-label="Your answers">
          {result.results.map((r, k) => (
            <li key={r.id + k} className="hwritem">
              <span className={'hwrnum ' + (r.correct ? 't-green' : 't-red')} aria-hidden="true">{r.correct ? <Icon name="check" size="sm" /> : <Icon name="x" size="sm" />}</span>
              <div className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
                <span className="muted xs" style={{ fontWeight: 700 }}>{k + 1}. {nameOf(r.lesson)}</span>
                <div className="hwrprompt"><Prompt q={{ type: 'tense', prompt: r.prompt }} fill={r.answer} /></div>
                <div className="hwans">
                  <span className="c-sr">{r.correct ? 'Correct.' : 'Wrong.'}</span>
                  <span>Your answer: <b className={r.correct ? 'hw-ok' : 'hw-no'}>{r.yourAnswer.trim() || '(no answer)'}</b></span>
                  {!r.correct && <span>Answer: <b className="hw-ok">{r.answer}</b></span>}
                </div>
                <TenseNote label={r.tenseLabel} explain={r.explain} />
                {/* The tense of the right answer: on contrast drills that's the one the learner mixed up. */}
                {!r.correct && isTense(r.tense) && (
                  <button className="linkbtn glink" onClick={() => a.openGrammar(r.tense)}>
                    <span aria-hidden="true">📖</span>Review the lesson<span className="c-sr">: {nameOf(r.tense)}</span>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className="stdone-act">
          <button className="btn btn-primary btn-lg" onClick={() => a.startGrammarPractice(mode)}><Icon name="refresh" size="sm" />Practise again</button>
          <button className="btn btn-secondary btn-lg" onClick={() => a.openGrammar()}><Icon name="left" size="sm" />Back to Grammar</button>
        </div>
      </div>
    );
  }

  const shownN = phase === 'result' && result ? result.total : n;
  return (
    <div className="session study gsession">
      <header className="stbar">
        <div className="stbar-top">
          <button className="iconbtn" onClick={requestClose} aria-label="Close practice" title="Close (Esc)"><Icon name="x" /></button>
          <div className="stbar-t">
            <h1 className="stbar-c gtitle">{title}</h1>
            <span className="muted sm">{mode === 'mix' ? 'Your weakest tenses come up most' : 'Grammar'}</span>
          </div>
        </div>
        {shownN > 0 && (
          <div className="gpbar">
            <span className="scount" aria-hidden="true">{phase === 'result' ? 'Done' : (i + 1) + ' / ' + n}</span>
            <span className="prog" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={shownN}
              aria-valuenow={phase === 'result' ? shownN : i + 1}
              aria-valuetext={phase === 'result' ? 'All questions checked' : 'Question ' + (i + 1) + ' of ' + n + ', ' + answered + ' answered'}>
              <div style={{ width: (phase === 'result' ? 100 : Math.round(((i + 1) / n) * 100)) + '%' }} />
            </span>
          </div>
        )}
      </header>
      <main className="stmain">
        <div className="stbody">{body}</div>
      </main>
      <div className="c-sr" aria-live="polite" aria-atomic="true">{live}</div>
      {asking && (
        <ConfirmDialog title="Check answers now?"
          text={'You haven’t answered ' + plural(n - answered, 'question') + '. Unanswered questions count as wrong.'}
          confirm="Check answers" onConfirm={() => void send()} onClose={() => setAsking(false)} />
      )}
      {leaving && (
        <ConfirmDialog title="Leave this practice?" text="Your answers so far won’t be kept or checked."
          confirm="Leave" onConfirm={() => { setLeaving(false); close(); }} onClose={() => setLeaving(false)} />
      )}
    </div>
  );
}
