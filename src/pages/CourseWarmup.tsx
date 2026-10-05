import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, type CourseDetail, type Warmup, type WarmupQuestion } from '../lib/api';
import { speak } from '../lib/speech';
import { Icon } from '../components/ui';
import { errText } from './Courses';
import { ASK, Prompt, TenseNote, isSentence } from './CourseHomework';

/** Lower-case, trimmed, straight quotes, single spaces, no punctuation around it (like the server). */
export function normalizeAnswer(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}
const isRight = (q: WarmupQuestion, given: string) => {
  const g = normalizeAnswer(given);
  return !!g && [q.answer, ...q.accept].some((x) => normalizeAnswer(x) === g);
};

type Phase = 'intro' | 'quiz' | 'done';

/**
 * Optional, ungraded practice before a day's new words: the recap story, earlier words (missed ones first) and quick questions.
 * embedded: shown inside a step of today's plan, which has its own heading · onDone: the practice was finished (or, with nothing
 * to practise, the words were reviewed) · onClose: the learner is done with it (Done on the summary).
 */
export function WarmupSection({ c, day, embedded, onDone, onClose }: {
  c: CourseDetail; day: number; embedded?: boolean; onDone?: (correct: number, total: number) => void; onClose?: () => void;
}) {
  const [w, setW] = useState<Warmup | null>(null);
  const [failed, setFailed] = useState('');
  const [hidden, setHidden] = useState(false);
  const [showVi, setShowVi] = useState(false);
  const [phase, setPhase] = useState<Phase>('intro');
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState('');
  /** Result per question once checked. */
  const [marks, setMarks] = useState<boolean[]>([]);
  const qHead = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const startBtn = useRef<HTMLButtonElement>(null);
  const doneHead = useRef<HTMLHeadingElement>(null);

  const load = async () => {
    setFailed('');
    try {
      setW(await api.getWarmup(c.id, day));
    } catch (e) {
      // Not open / not joined: the warm-up just isn't shown.
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) setHidden(true);
      else setFailed(errText(e, 'Couldn’t load the warm-up.'));
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [c.id, day]);

  const qs = w?.questions ?? [];
  const q = qs[i];
  const n = qs.length;
  const checked = marks.length > i;
  const ok = checked && marks[i];

  const start = () => { setI(0); setAnswer(''); setMarks([]); setPhase('quiz'); };
  const check = (given = answer) => {
    if (!q || checked || !given.trim()) return;
    setAnswer(given);
    setMarks((m) => [...m, isRight(q, given)]);
  };
  const next = () => {
    if (i < n - 1) { setI(i + 1); setAnswer(''); return; }
    setPhase('done');
    onDone?.(marks.filter(Boolean).length, n);
  };
  const finish = () => {
    if (phase === 'done' && onClose) { onClose(); return; }
    setPhase('intro');
    window.setTimeout(() => startBtn.current?.focus(), 0);
  };

  // Focus: the input (or question) for a new question, Next once it's checked, the summary at the end.
  useEffect(() => {
    if (phase === 'done') { doneHead.current?.focus(); return; }
    if (phase !== 'quiz' || !q) return;
    if (checked) nextBtn.current?.focus();
    else if (q.choices.length) qHead.current?.focus();
    else input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, i, checked]);

  // 1–4 pick a choice; Enter goes on once checked (when the focus isn't on a control).
  useEffect(() => {
    if (phase !== 'quiz' || !q) return;
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement).tagName;
      if (ev.ctrlKey || ev.metaKey || ev.altKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tag)) return;
      const k = Number(ev.key);
      if (!checked && q.choices.length && k >= 1 && k <= q.choices.length) { ev.preventDefault(); check(q.choices[k - 1]); }
      else if (checked && ev.key === 'Enter') { ev.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // In today's plan there's always a way on, even when there's nothing to practise.
  const nothing = (
    <section className="wucard" aria-label="Warm-up">
      <p className="muted sm" style={{ margin: 0 }}>There’s nothing to review from earlier days yet.</p>
      <div className="dfoot">
        <button className="btn btn-primary" onClick={() => { onDone?.(0, 0); onClose?.(); }}>Continue<Icon name="right" size="sm" /></button>
      </div>
    </section>
  );
  if (hidden) return embedded ? nothing : null;
  if (failed) {
    return (
      <section className={(embedded ? '' : 'card ') + 'wucard'} aria-label="Warm-up">
        <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{failed} <button className="linkbtn" onClick={load}>Try again</button></span>
      </section>
    );
  }
  if (!w) return <div className="sk wucard" style={{ height: 120, borderRadius: 16 }} aria-busy="true" aria-label="Loading warm-up" />;
  if (!w.recap && !w.words.length) return embedded ? nothing : null;

  const hid = 'wu-' + day;
  const right = marks.filter(Boolean).length;
  const missedWords = Array.from(new Set(qs.filter((_, k) => marks[k] === false).map((x) => x.word).filter(Boolean)));

  let body: ReactNode;
  if (phase === 'quiz' && q) {
    const fill = checked ? (ok ? answer.trim() : q.answer) : q.type === 'tenseChoice' ? '' : answer.trim();
    body = (
      <>
        <div className="hwbar">
          <span className="scount" aria-hidden="true">{i + 1} / {n}</span>
          <span className="prog" role="progressbar" aria-label="Warm-up questions" aria-valuemin={1} aria-valuemax={n} aria-valuenow={i + 1} aria-valuetext={'Question ' + (i + 1) + ' of ' + n}>
            <div style={{ width: Math.round(((i + 1) / n) * 100) + '%' }} />
          </span>
        </div>
        <div key={i} className="hwq animA">
          <span className="qkicker">Question {i + 1} of {n} · {ASK[q.type]}</span>
          <h4 ref={qHead} tabIndex={-1} className={'qtext hwprompt' + (isSentence(q.type) ? ' sentence' : '')} id={hid + '-q'}>
            <Prompt q={q} fill={fill} />
          </h4>
          {q.hint && <div className="muted sm">Hint: {q.hint}</div>}
          {q.choices.length ? (
            <>
              <div className="opts hwopts" role="group" aria-labelledby={hid + '-q'}>
                {q.choices.map((t, k) => {
                  const isAns = isRight(q, t);
                  const cls = !checked ? '' : isAns ? ' correct' : t === answer ? ' wrong' : ' dim';
                  return (
                    <button key={k} className={'opt' + cls} onClick={() => check(t)} disabled={checked} aria-pressed={t === answer}>
                      <span className="letter">{k + 1}</span>
                      <span className="grow">{t}</span>
                      {checked && isAns && <Icon name="check" size="sm" />}
                    </button>
                  );
                })}
              </div>
              {!checked && <span className="keyhint">Press <span className="kbd">1</span>–<span className="kbd">{q.choices.length}</span> to answer</span>}
            </>
          ) : (
            <form className="wuform" onSubmit={(ev) => { ev.preventDefault(); check(); }}>
              <input ref={input} className={'input input-lg' + (checked ? (ok ? ' ok' : ' err') : '')} placeholder="Type your answer…" value={answer} aria-labelledby={hid + '-q'}
                autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={200} readOnly={checked}
                onChange={(ev) => setAnswer(ev.target.value)} />
              {!checked && <button type="submit" className="btn btn-primary" disabled={!answer.trim()}><Icon name="check" size="sm" />Check</button>}
            </form>
          )}
        </div>
        <div aria-live="polite" aria-atomic="true">
          {checked && (
            <div className={'wufb ' + (ok ? 'ok' : 'no')}>
              <b className="wufb-t"><Icon name={ok ? 'checkc' : 'alert'} size="sm" />{ok ? 'Correct!' : 'Not quite.'}</b>
              {!ok && <span>Answer: <b className="hw-ok">{q.answer}</b></span>}
              <TenseNote label={q.tenseLabel} explain={q.explain} />
            </div>
          )}
        </div>
        <div className="hwnav">
          <button className="btn btn-ghost" onClick={finish}>Stop</button>
          {checked && (
            <button ref={nextBtn} className="btn btn-primary" onClick={next}>
              {i < n - 1 ? <>Next<Icon name="right" size="sm" /></> : <>See summary<Icon name="right" size="sm" /></>}
            </button>
          )}
        </div>
      </>
    );
  } else if (phase === 'done') {
    body = (
      <>
        <div className="hwresult">
          <h4 ref={doneHead} tabIndex={-1} className="qkicker" style={{ margin: 0 }}>Warm-up done<span className="c-sr">: {right} of {n} correct</span></h4>
          <div className="hwscore" aria-hidden="true"><b>{right}</b><span className="muted">/ {n} correct</span></div>
          <span className="muted sm">{right === n ? 'All correct — you’re ready for today’s words.' : embedded ? 'Review done — it doesn’t count toward your score.' : 'Nothing is saved — it’s just practice.'}</span>
        </div>
        {missedWords.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Worth another look</span>
            <div className="badges">{missedWords.map((x) => <span key={x} className="badge t-red">{x}</span>)}</div>
          </div>
        )}
        <div className="dfoot">
          <button className="btn btn-secondary" onClick={start}><Icon name="refresh" size="sm" />Practice again</button>
          <button className="btn btn-primary" onClick={finish}>{embedded && onClose ? <>Continue<Icon name="right" size="sm" /></> : 'Done'}</button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        {w.recap && (
          <div className="wurecap">
            <span className="qkicker">Recap story</span>
            <p className="wustory">{w.recap.text}</p>
            {w.recap.vi && (
              <>
                <button className="linkbtn" onClick={() => setShowVi(!showVi)} aria-expanded={showVi} aria-controls={hid + '-vi'}>
                  <Icon name={showVi ? 'eyeOff' : 'eye'} size="sm" />{showVi ? 'Hide translation' : 'Show translation'}
                </button>
                <p id={hid + '-vi'} className="muted sm wustory" lang="vi" hidden={!showVi}>{w.recap.vi}</p>
              </>
            )}
          </div>
        )}
        {w.words.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">Words from earlier days</span>
            <ul className="wuwords">
              {w.words.map((x) => (
                <li key={x.word} className={'wuword' + (x.missed ? ' missed' : '')}>
                  <div className="cwhead">
                    <b>{x.word}</b>
                    <button className="iconbtn sm" onClick={() => speak(x.word)} aria-label={'Play pronunciation of ' + x.word} title="Play"><Icon name="volume" size="sm" /></button>
                    {x.missed > 0 && <span className="badge t-red" style={{ marginLeft: 'auto' }}>missed {x.missed}×</span>}
                  </div>
                  {x.ipa && <span className="ipa xs">{x.ipa}</span>}
                  <span className="vi sm">{x.vi || x.meaning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {n > 0 ? (
          <div className="dfoot">
            <span className="hint" style={{ marginRight: 'auto' }}>{n} quick {n === 1 ? 'question' : 'questions'} · instant feedback · nothing is saved</span>
            <button ref={startBtn} className={'btn ' + (embedded ? 'btn-primary' : 'btn-secondary')} onClick={start}><Icon name="zap" size="sm" />Start warm-up</button>
          </div>
        ) : embedded && (
          <div className="dfoot">
            <button className="btn btn-primary" onClick={() => { onDone?.(0, 0); onClose?.(); }}><Icon name="check" size="sm" />Done reviewing</button>
          </div>
        )}
      </>
    );
  }

  if (embedded) return <section className="wucard" aria-label="Warm-up">{body}</section>;
  return (
    <section className="card wucard" aria-labelledby={hid}>
      <div className="rowb" style={{ flexWrap: 'wrap' }}>
        <div>
          <h3 className="h2" id={hid}>Warm-up</h3>
          <span className="muted sm">Optional · not graded</span>
        </div>
        <span className="badge t-amber"><Icon name="flame" size="sm" />Before day {day}</span>
      </div>
      {body}
    </section>
  );
}
