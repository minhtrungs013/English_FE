import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  api, ApiError, FOUNDATIONS, LESSON_IDS, TENSES, isLesson, isTense,
  type GrammarForm, type GrammarGraded, type GrammarGroup, type GrammarLesson, type GrammarPerson, type GrammarQuestion, type GrammarTable,
  type GrammarTense, type LessonId, type Tense
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
/** English names of every lesson (Foundations and tenses). */
export const LESSON_NAME: Record<LessonId, string> = {
  be: 'Be',
  do: 'Do',
  have: 'Have',
  agreement: 'Subject–verb agreement',
  'aux-cheatsheet': 'Cheat sheet',
  ...TENSE_NAME
};
const nameOf = (t: string) => (isLesson(t) ? LESSON_NAME[t] : t);

/** Questions in a practice set. */
const PRACTICE_N = 10;
const SORT_KEY = 'wordbook:grammarSort';
const MIX_KEY = 'wordbook:grammarMix';

/** Mixed practice over everything, or over one group. */
type MixMode = 'mix' | 'mix-tenses' | 'mix-foundations';
const MIX_MODES: { id: MixMode; label: string; sub: string }[] = [
  { id: 'mix', label: 'All', sub: 'Helping verbs and tenses' },
  { id: 'mix-tenses', label: 'Tenses', sub: 'The seven tenses' },
  { id: 'mix-foundations', label: 'Foundations', sub: 'Be, do, have and agreement' }
];
const isMixMode = (m: unknown): m is MixMode => MIX_MODES.some((x) => x.id === m);
const MIX_TITLE: Record<MixMode, string> = { mix: 'Mixed practice', 'mix-tenses': 'Mixed practice: tenses', 'mix-foundations': 'Mixed practice: foundations' };

const GROUPS: { id: GrammarGroup; title: string; emoji: string; ids: readonly LessonId[] }[] = [
  { id: 'foundations', title: 'Foundations: Helping verbs', emoji: '🧱', ids: FOUNDATIONS },
  { id: 'tenses', title: 'Tenses', emoji: '⏱️', ids: TENSES }
];

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

/** One lesson in the list: its mastery, or "Reference" for a page with nothing to practise (the cheat sheet). */
function LessonCard({ t }: { t: GrammarTense }) {
  const { a } = useWB();
  const ref = t.drills === 0;
  return (
    <li className={'card gcard' + (ref ? ' gcard-ref' : '')}>
      <div className="gcard-top">
        <div className="gcard-t">
          <h3 className="gcard-name">
            <button className="gcard-link" onClick={() => a.openGrammar(t.id)} aria-describedby={'gc-' + t.id}>{t.name}</button>
          </h3>
          <span className="gcard-vi" lang="vi">{t.vi}</span>
        </div>
        {ref ? <span className="gcard-ic" aria-hidden="true"><Icon name="book" /></span> : <MasteryRing value={t.mastery} />}
      </div>
      <p className="gcard-sum muted sm" lang="vi">{t.summary}</p>
      <div className="gcard-foot" id={'gc-' + t.id}>
        {ref ? (
          <>
            <span className="badge t-blue"><Icon name="book" size="sm" />Reference</span>
            <span className="muted xs">No practice — read and look up</span>
          </>
        ) : (
          <>
            <MasteryBadge value={t.mastery} />
            <span className="muted xs">{t.attempts ? plural(t.attempts, 'answer') : 'Not practised yet'}</span>
          </>
        )}
        <Icon name="right" size="sm" className="gcard-go" />
      </div>
    </li>
  );
}

/** The lessons in two groups (Foundations, then the tenses) with my mastery of each, and a mixed practice that leans on the weakest ones. */
export function GrammarHome() {
  const { a } = useWB();
  const [list, setList] = useState<GrammarTense[] | null>(null);
  const [err, setErr] = useState('');
  const [sort, setSort] = useState<'order' | 'weak'>(() => {
    try { return localStorage.getItem(SORT_KEY) === 'weak' ? 'weak' : 'order'; } catch { return 'order'; }
  });
  const [mix, setMix] = useState<MixMode>(() => {
    try { const v = localStorage.getItem(MIX_KEY); return isMixMode(v) ? v : 'mix'; } catch { return 'mix'; }
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
  const pickMix = (v: MixMode) => {
    setMix(v);
    try { localStorage.setItem(MIX_KEY, v); } catch { /* storage blocked: just for this visit */ }
  };

  // Weakest first: lowest mastery, then the least practised; ties stay in lesson order (the sort is stable).
  // Reference pages (nothing to practise) stay at the end of their group.
  const sorted = (xs: GrammarTense[]) => (sort === 'weak'
    ? [...xs].sort((x, y) => Number(x.drills === 0) - Number(y.drills === 0) || x.mastery - y.mastery || x.attempts - y.attempts)
    : xs);
  // A lesson without a group (older API) counts as a tense.
  const groupOf = (t: GrammarTense): GrammarGroup => (t.group === 'foundations' ? 'foundations' : 'tenses');
  const practisable = list ? list.filter((t) => t.drills > 0) : [];
  const practised = practisable.filter((t) => t.attempts > 0).length;
  const avg = practisable.length ? Math.round(practisable.reduce((n, t) => n + t.mastery, 0) / practisable.length) : 0;
  const mixInfo = MIX_MODES.find((m) => m.id === mix)!;

  return (
    <>
      <PageHead title="Grammar" sub="Helping verbs first, then the seven tenses you need at work — short lessons in Vietnamese with English examples, then practice." />

      <section className="gmix" aria-labelledby="gmix-t">
        <span className="gmix-ic" aria-hidden="true"><Icon name="zap" size="lg" /></span>
        <div className="gmix-b">
          <h2 id="gmix-t" className="gmix-t">Mixed practice</h2>
          <p className="gmix-s" id="gmix-s">{mixInfo.sub} · your weakest first · {PRACTICE_N} questions</p>
        </div>
        <div className="seg gmix-seg" role="group" aria-label="What to practise">
          {MIX_MODES.map((m) => (
            <button key={m.id} className={mix === m.id ? 'on' : ''} aria-pressed={mix === m.id} onClick={() => pickMix(m.id)}>{m.label}</button>
          ))}
        </div>
        <button className="btn btn-white btn-lg" onClick={() => a.startGrammarPractice(mix)} aria-label={'Start mixed practice: ' + mixInfo.label} aria-describedby="gmix-s">
          Start<Icon name="right" size="sm" />
        </button>
      </section>

      <div className="ghead">
        <span className="muted sm">
          {list ? (practised ? practised + ' of ' + practisable.length + ' lessons practised · average mastery ' + avg + '%' : 'Start with a lesson, then practise it.') : ''}
        </span>
        <div className="seg" role="group" aria-label="Order">
          <button className={sort === 'order' ? 'on' : ''} aria-pressed={sort === 'order'} onClick={() => pickSort('order')}>Lesson order</button>
          <button className={sort === 'weak' ? 'on' : ''} aria-pressed={sort === 'weak'} onClick={() => pickSort('weak')}>Weakest first</button>
        </div>
      </div>

      {err ? (
        <EmptyState icon="alert" tint="t-red" title="Can’t load the lessons" text={err}>
          <button className="btn btn-primary" onClick={() => { setList(null); load(); }}><Icon name="refresh" size="sm" />Try again</button>
        </EmptyState>
      ) : (
        GROUPS.map((g) => {
          const items = list ? list.filter((t) => groupOf(t) === g.id) : null;
          if (items && !items.length) return null;
          const done = items ? items.filter((t) => t.drills > 0 && t.attempts > 0).length : 0;
          const total = items ? items.filter((t) => t.drills > 0).length : 0;
          return (
            <section key={g.id} className="gsect" aria-labelledby={'gs-' + g.id}>
              <div className="gsect-h">
                <h2 id={'gs-' + g.id} className="h2"><span aria-hidden="true">{g.emoji} </span>{g.title}</h2>
                {items && <span className="muted xs">{done} of {total} practised</span>}
              </div>
              {!items ? (
                <div className="ggrid" aria-busy="true" aria-label="Loading lessons">
                  {g.ids.map((t) => <div key={t} className="sk" style={{ height: 178, borderRadius: 16 }} />)}
                </div>
              ) : (
                <ul className="ggrid" aria-labelledby={'gs-' + g.id}>
                  {sorted(items).map((t) => <LessonCard key={t.id} t={t} />)}
                </ul>
              )}
            </section>
          );
        })
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

/** "Not sure about …?" for the helping verb of a tense, pointing to its Foundations lesson. */
function foundationHint(lesson: LessonId, f: 'be' | 'do' | 'have'): string {
  if (f === 'be') return lesson.startsWith('past') ? 'was / were' : 'am / is / are';
  return f === 'do' ? 'do / does / did' : 'have / has';
}

/**
 * A reference table: the title as its caption, a header row, and one row per subject / case (its first cell is the row
 * header; a label that says more than the first cell is shown above it). A row with a link opens that lesson (its button
 * is the keyboard / screen reader way in; the whole row is clickable too). Phones get stacked cards.
 */
function LessonTable({ t, id, level = 2 }: { t: GrammarTable; id: string; level?: 2 | 3 }) {
  const { a } = useWB();
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <table className="gtbl">
      <caption className="gtcap"><H id={id} className={level === 2 ? 'glh2' : 'glh3'}>{level === 2 && <Icon name="grid" />}{t.title}</H></caption>
      <thead>
        <tr>{t.columns.map((c, k) => <th key={k} scope="col">{c}</th>)}</tr>
      </thead>
      <tbody>
        {t.rows.map((r, k) => {
          const link = isLesson(r.link) ? r.link : null;
          const first = r.cells[0] ?? r.label;
          const to = link ? LESSON_NAME[link] : '';
          // Say where the link goes unless the row already names it ("Present simple" → Present simple).
          const showTo = !!link && !to.toLowerCase().startsWith(first.toLowerCase());
          return (
            <tr key={k} className={link ? 'gtrow-link' : undefined} onClick={link ? () => a.openGrammar(link) : undefined}>
              <th scope="row">
                {r.label && r.label !== first && <span className="gt-lbl">{r.label}</span>}
                {link ? (
                  <button className="gt-go" onClick={(ev) => { ev.stopPropagation(); a.openGrammar(link); }}>
                    <span>{first}</span>
                    {showTo ? <small className="gt-to">Lesson: {to}</small> : <span className="c-sr"> — open the lesson</span>}
                    <Icon name="right" size="sm" />
                  </button>
                ) : <span className="gt-first">{first}</span>}
              </th>
              {t.columns.slice(1).map((c, j) => <td key={j} data-label={c}>{r.cells[j + 1] ?? ''}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The helping verb by subject in a tense (from formula.persons). */
function PersonsTable({ persons, id }: { persons: GrammarPerson[]; id: string }) {
  const t: GrammarTable = {
    title: 'By subject',
    columns: ['Subject', 'Affirmative', 'Negative', 'Question'],
    rows: persons.map((p) => ({ label: p.subject, cells: [p.subject, p.affirmative, p.negative, p.question] }))
  };
  return <LessonTable t={t} id={id} level={3} />;
}

/**
 * One lesson. A tense: formula (with the helping verb by subject), uses, signal words, common mistakes and how it differs
 * from its neighbour. A Foundations lesson: its tables, uses and mistakes. Then practise it (the cheat sheet has nothing to
 * practise: it's a reference page).
 */
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

  // Lesson order (prev / next) runs across both groups, Foundations first, like the API's list.
  const idx = LESSON_IDS.indexOf(l.id);
  const prev = idx > 0 ? LESSON_IDS[idx - 1] : null;
  const next = idx >= 0 && idx < LESSON_IDS.length - 1 ? LESSON_IDS[idx + 1] : null;
  const isFoundation = l.group === 'foundations' || (FOUNDATIONS as readonly string[]).includes(l.id);
  const groupIds: readonly LessonId[] = isFoundation ? FOUNDATIONS : TENSES;
  const gIdx = groupIds.indexOf(l.id);
  const tenseName = (t: Tense) => (t === l.id ? l.name : t === l.compare?.with && l.compareName ? l.compareName : nameOf(t));
  const f = l.formula;
  const found = f?.foundation && isLesson(f.foundation) ? f.foundation : null;
  const canPractise = l.drillCount > 0;

  return (
    <article className="glesson" aria-labelledby="gl-title">
      {back}
      <header className="glhead">
        {gIdx >= 0 && <span className="qkicker">{isFoundation ? 'Foundations' : 'Tense'} {gIdx + 1} of {groupIds.length}</span>}
        <h1 id="gl-title" ref={head} tabIndex={-1} className="h1 glh1">{l.name}</h1>
        <p className="glvi" lang="vi">{l.vi}</p>
        <p className="glsum" lang="vi">{l.summary}</p>
      </header>

      {f && (
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
              {FORMS.map((fm) => {
                const row = f[fm];
                if (!row) return null;
                return (
                  <tr key={fm}>
                    <th scope="row"><span className={'badge ' + (fm === 'affirmative' ? 't-green' : fm === 'negative' ? 't-red' : 't-blue')}>{FORM_LABEL[fm]}</span></th>
                    <td data-label="Pattern"><Pattern text={row.pattern} /></td>
                    <td data-label="Example"><Example en={row.example} vi={row.vi} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!!f.persons?.length && <PersonsTable persons={f.persons} id="gl-persons" />}
          {found && (
            <p className="gfound">
              <span aria-hidden="true">💡</span>
              <span>Not sure about {foundationHint(l.id, found)}?</span>
              <button className="linkbtn" onClick={() => a.openGrammar(found)}>
                Lesson: {LESSON_NAME[found]}<Icon name="right" size="sm" />
              </button>
            </p>
          )}
        </section>
      )}

      {l.tables?.map((t, k) => (
        <section key={k} className="card glsec" aria-labelledby={'gl-t' + k}>
          <LessonTable t={t} id={'gl-t' + k} />
          {t.note && <p className="gtnote" lang="vi"><span aria-hidden="true">💡</span><span>{t.note}</span></p>}
        </section>
      ))}

      {l.uses.length > 0 && (
        <section className="card glsec" aria-labelledby="gl-uses">
          <h2 id="gl-uses" className="glh2"><Icon name="listcheck" />How to use</h2>
          <ol className="gluses">
            {l.uses.map((u, k) => (
              <li key={k} className="gluse">
                <h3 className="gluse-t" lang="vi"><span className="gluse-n" aria-hidden="true">{k + 1}</span>{u.title}</h3>
                <p className="gluse-x" lang="vi">{u.explain}</p>
                {u.examples.length > 0 && <div className="glexs">{u.examples.map((ex, j) => <Example key={j} en={ex.en} vi={ex.vi} />)}</div>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {!!l.signals?.length && (
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
          {isLesson(l.compare.with) && (
            <button className="linkbtn glmore" onClick={() => a.openGrammar(l.compare!.with)}>
              Open the {l.compareName || nameOf(l.compare.with)} lesson<Icon name="right" size="sm" />
            </button>
          )}
        </section>
      )}

      {canPractise ? (
        <div className="glcta">
          <div className="glcta-m">
            <MasteryBadge value={l.mastery} />
            <span className="muted xs">{l.attempts ? plural(l.attempts, 'answer') + ' so far' : 'Not practised yet'}</span>
          </div>
          <button className="btn btn-primary" onClick={() => a.startGrammarPractice(l.id)}>
            <Icon name="zap" size="sm" />{isFoundation ? 'Practise this lesson' : 'Practise this tense'}<span className="glcta-n">({PRACTICE_N} questions)</span>
          </button>
        </div>
      ) : (
        <div className="glcta glcta-ref">
          <span className="muted sm">A reference page — nothing to practise here.</span>
          <button className="btn btn-secondary" onClick={() => a.openGrammar()}><Icon name="left" size="sm" />Back to Grammar</button>
        </div>
      )}

      <nav className="glnav" aria-label="Other lessons">
        {prev ? (
          <button className="glnav-b" onClick={() => a.openGrammar(prev)}>
            <Icon name="left" size="sm" /><span><small>Previous</small>{LESSON_NAME[prev]}</span>
          </button>
        ) : <span />}
        {next && (
          <button className="glnav-b next" onClick={() => a.openGrammar(next)}>
            <span><small>Next</small>{LESSON_NAME[next]}</span><Icon name="right" size="sm" />
          </button>
        )}
      </nav>
    </article>
  );
}

/* ---------- practice session ---------- */

type Phase = 'loading' | 'error' | 'taking' | 'sending' | 'result';

/** Whether a question belongs to a tense lesson (its id is "<lesson>:<n>"); Foundations questions ask for the right form. */
const inTense = (q: GrammarQuestion) => isTense(q.id.slice(0, q.id.lastIndexOf(':')));

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
      <span id={id + '-full'} className="c-sr">{q.prompt.replace(/_{3,}/, 'blank')}. Put the verb in brackets in the right {inTense(q) ? 'tense' : 'form'}.</span>
    </>
  );
}

/**
 * A practice set in focus (full screen): one question at a time, typed or 4 choices; answers are graded on the server only
 * when the learner checks them all. Then the score, how each lesson's mastery moved, and every answer explained.
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
  /** Mastery of each lesson before this set (for "40% → 55%"). */
  const [before, setBefore] = useState<Partial<Record<LessonId, number>>>({});
  const [result, setResult] = useState<GrammarGraded | null>(null);
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [live, setLive] = useState('');
  const started = useRef(false);
  const qHead = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const resHead = useRef<HTMLHeadingElement>(null);
  const errHead = useRef<HTMLHeadingElement>(null);

  const title = isMixMode(mode) ? MIX_TITLE[mode] : nameOf(mode) + ' practice';
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
            Question {i + 1} of {n} · {q.kind === 'tense' ? 'Put the verb in the right ' + (inTense(q) ? 'tense' : 'form') : 'Choose the right verb form'}
          </h2>
          {q.kind === 'tense' || !q.choices.length ? (
            <>
              <TypedPrompt q={q} value={answer} onChange={setAnswer} onEnter={next} inputRef={input} id={hid} />
              <span className="keyhint">Type only the missing words — e.g. “has finished”, not “She has finished”.</span>
            </>
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
    const lessons = (Object.entries(result.mastery) as [LessonId, number][]).sort((x, y) => LESSON_IDS.indexOf(x[0]) - LESSON_IDS.indexOf(y[0]));
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
                {/* The lesson to review: the tense of the right answer (on contrast drills, the one the learner mixed up) or the Foundations lesson. */}
                {!r.correct && isLesson(r.tense) && (
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
            <span className="muted sm">{isMixMode(mode) ? 'Your weakest lessons come up most' : 'Grammar'}</span>
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
