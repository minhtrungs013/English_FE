import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, type CourseDay, type CourseDetail, type Homework, type HomeworkQuestion, type HomeworkResult } from '../lib/api';
import { useWB } from '../state/WordbookContext';
import { Icon } from '../components/ui';
import { ConfirmDialog, errText } from './Courses';

const DAY_MS = 86_400_000;
const utc = (key: string) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };

/** Days after `day` opened for a learner who started on `startDay` (Vietnam time, like the server). */
export function lateDaysFor(startDay: string, day: number): number {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  return Math.max(0, Math.round((utc(today) - utc(startDay)) / DAY_MS) - (day - 1));
}

/** Percent of the score kept: on time 100%, then 80%, 60%, and 50% from 3 days late. */
export const penaltyFor = (late: number) => (late <= 0 ? 100 : late === 1 ? 80 : late === 2 ? 60 : 50);

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

const lateText = (late: number, done: boolean) =>
  (done ? 'Handed in ' : 'Handing in ') + plural(late, 'day') + ' late — you’ll keep ' + penaltyFor(late) + '% of the score.';

export const ASK: Record<HomeworkQuestion['type'], string> = {
  meaning: 'What does this word mean?',
  word: 'Which word has this meaning?',
  type: 'Type the word for this meaning',
  blank: 'Fill in the missing word',
  tense: 'Put the verb in the right tense',
  tenseChoice: 'Choose the right verb form'
};

/** Questions whose prompt is a sentence with a gap ("_____" for blank, "___" for tense ones). */
export const isSentence = (t: HomeworkQuestion['type']) => t === 'blank' || t === 'tense' || t === 'tenseChoice';

/** The prompt; for sentence questions the gap is shown as a line (filled with `fill`, when given). */
export function Prompt({ q, fill }: { q: Pick<HomeworkQuestion, 'type' | 'prompt'>; fill?: string }) {
  const m = isSentence(q.type) ? /_{3,}/.exec(q.prompt) : null;
  if (!m) return <>{q.prompt}</>;
  return <>{q.prompt.slice(0, m.index)}<span className="blank">{fill || ' '}</span>{q.prompt.slice(m.index + m[0].length)}</>;
}

/** The tense and its Vietnamese explanation, shown once the answer is known. */
export function TenseNote({ label, explain }: { label?: string; explain?: string }) {
  if (!label && !explain) return null;
  return (
    <div className="tensenote">
      {label && <span className="badge t-blue"><Icon name="clock" size="sm" />{label}</span>}
      {explain && <span className="sm" lang="vi">{explain}</span>}
    </div>
  );
}

function Kicker({ q, children }: { q: HomeworkQuestion; children: ReactNode }) {
  return (
    <div className="rowb" style={{ flexWrap: 'wrap' }}>
      <span className="qkicker">{children}</span>
      {q.review && <span className="badge t-amber"><Icon name="refresh" size="sm" />Review</span>}
    </div>
  );
}

function HomeworkReviewList({ r }: { r: HomeworkResult }) {
  return (
    <ol className="hwrev" aria-label="Your answers">
      {r.review.map((q, i) => (
        <li key={i} className="hwritem">
          <span className={'hwrnum ' + (q.correct ? 't-green' : 't-red')} aria-hidden="true">{q.correct ? <Icon name="check" size="sm" /> : <Icon name="x" size="sm" />}</span>
          <div className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
            <div className="badges">
              <span className="muted xs" style={{ fontWeight: 700 }}>{i + 1}. {ASK[q.type]}</span>
              {q.review && <span className="badge t-amber">Review</span>}
            </div>
            <div className="hwrprompt"><Prompt q={q} fill={isSentence(q.type) ? q.answer : undefined} /></div>
            <div className="hwans">
              <span className="c-sr">{q.correct ? 'Correct.' : 'Wrong.'}</span>
              <span>Your answer: <b className={q.correct ? 'hw-ok' : 'hw-no'}>{q.yourAnswer || '(no answer)'}</b></span>
              {!q.correct && <span>Answer: <b className="hw-ok">{q.answer}</b></span>}
            </div>
            <TenseNote label={q.tenseLabel} explain={q.explain} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function HomeworkResultView({ r, onClose }: { r: HomeworkResult; onClose: () => void }) {
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus(); }, []);
  return (
    <>
      <div className="hwresult">
        <h4 ref={head} tabIndex={-1} className="qkicker" style={{ margin: 0 }}>Your score<span className="c-sr">: {r.score} out of 100</span></h4>
        <div className="hwscore" aria-hidden="true"><b>{r.score}</b><span className="muted">/ 100</span></div>
        <span className="sm" style={{ fontWeight: 600 }}>
          raw {r.raw}% · {r.correct}/{r.total} correct · {r.penalty < 100 ? 'late penalty ' + r.penalty + '%' : 'on time'}
        </span>
        <span className="muted sm hwtime"><Icon name="clock" size="sm" />Time taken {fmtDuration(r.durationMs)}</span>
      </div>
      {r.lateDays > 0 && <p className="note sm">{lateText(r.lateDays, true)}</p>}
      <HomeworkReviewList r={r} />
      <div className="dfoot">
        <button className="btn btn-secondary" onClick={onClose}>Hide answers</button>
      </div>
    </>
  );
}

type Phase = 'idle' | 'loading' | 'taking' | 'sending' | 'result';

/** A day's homework for an enrolled learner: start → one question at a time → hand in → score and answers. */
export function HomeworkSection({ c, day, onSubmitted }: { c: CourseDetail; day: CourseDay; onSubmitted: () => void }) {
  const { a } = useWB();
  const [phase, setPhase] = useState<Phase>('idle');
  const [hw, setHw] = useState<Homework | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [result, setResult] = useState<HomeworkResult | null>(null);
  const [err, setErr] = useState('');
  const [asking, setAsking] = useState(false);
  const qHead = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const startBtn = useRef<HTMLButtonElement>(null);

  const e = c.enrollment!;
  const late = lateDaysFor(e.startDay, day.day);
  const q = hw?.questions[i];
  const n = hw?.questions.length ?? 0;
  const last = i === n - 1;

  /** Opens the homework (this starts the timer); shows the result straight away if it's already handed in. */
  const open = async () => {
    setPhase('loading');
    setErr('');
    try {
      const h = await api.getHomework(c.id, day.day);
      setHw(h);
      if (h.submission) {
        setResult(h.submission);
        setPhase('result');
      } else {
        setAnswers(h.questions.map(() => ''));
        setI(0);
        setPhase('taking');
      }
    } catch (ex) {
      setErr(errText(ex, 'Couldn’t open the homework.'));
      setPhase('idle');
    }
  };

  const send = async () => {
    if (!hw) return;
    setAsking(false);
    setPhase('sending');
    try {
      const r = await api.submitHomework(c.id, day.day, answers);
      setResult(r);
      setPhase('result');
      a.showToast('Day ' + day.day + ' homework handed in — score ' + r.score + '.');
      onSubmitted();
    } catch (ex) {
      if (ex instanceof ApiError && ex.status === 409) {
        // Already handed in (e.g. in another tab) or the questions changed: load it again.
        const already = /already/i.test(ex.message);
        a.showToast(already ? 'You’ve already handed in day ' + day.day + '.' : 'This homework changed, so it was reloaded. Please answer again.', 'bad');
        await open();
        if (already) onSubmitted();
      } else {
        a.showToast(errText(ex, 'Couldn’t hand in the homework.'), 'bad');
        setPhase('taking');
      }
    }
  };

  const setAnswer = (v: string) => setAnswers((prev) => prev.map((x, k) => (k === i ? v : x)));
  const next = () => {
    if (!last) { setI(i + 1); return; }
    if (answers.some((x) => !x.trim())) setAsking(true);
    else void send();
  };

  // Move focus to the new question: the input for typed answers, else the question itself.
  useEffect(() => {
    if (phase !== 'taking' || !q) return;
    if (q.choices.length) qHead.current?.focus();
    else input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, i]);

  // 1–4 pick a choice; Enter goes on when the focus isn't on a control.
  useEffect(() => {
    if (phase !== 'taking' || !q || asking) return;
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement).tagName;
      if (ev.ctrlKey || ev.metaKey || ev.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      const k = Number(ev.key);
      if (q.choices.length && k >= 1 && k <= q.choices.length) { ev.preventDefault(); setAnswer(q.choices[k - 1]); }
      else if (ev.key === 'Enter' && tag !== 'BUTTON') { ev.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const close = () => {
    setPhase('idle');
    window.setTimeout(() => startBtn.current?.focus(), 0);
  };

  const head = (
    <div className="rowb" style={{ flexWrap: 'wrap' }}>
      <div>
        <h3 className="h2" id={'hw-' + day.day}>Homework</h3>
        <span className="muted sm">{hw ? plural(hw.total, 'question') + ' · ' : ''}new words + review</span>
      </div>
      {day.myScore !== null && <span className="badge t-green"><Icon name="award" size="sm" />Score {day.myScore}</span>}
    </div>
  );

  let body: ReactNode;
  if ((phase === 'taking' || phase === 'sending') && hw && q) {
    const answer = answers[i] ?? '';
    const done = answers.filter((x) => x.trim()).length;
    body = (
      <>
        {hw.lateDays > 0 && <p className="note sm">{lateText(hw.lateDays, true)}</p>}
        <div className="hwbar">
          <span className="scount" aria-hidden="true">{i + 1} / {n}</span>
          <span className="prog" role="progressbar" aria-label="Questions" aria-valuemin={1} aria-valuemax={n} aria-valuenow={i + 1} aria-valuetext={'Question ' + (i + 1) + ' of ' + n + ', ' + done + ' answered'}>
            <div style={{ width: Math.round(((i + 1) / n) * 100) + '%' }} />
          </span>
        </div>
        <div key={i} className="hwq animA">
          <Kicker q={q}>Question {i + 1} of {n} · {ASK[q.type]}</Kicker>
          <h4 ref={qHead} tabIndex={-1} className={'qtext hwprompt' + (isSentence(q.type) ? ' sentence' : '')} id={'hwq-' + day.day}>
            <Prompt q={q} fill={answer.trim()} />
          </h4>
          {q.hint && <div className="muted sm">Hint: {q.hint}</div>}
          {q.choices.length ? (
            <>
              <div className="opts hwopts" role="group" aria-labelledby={'hwq-' + day.day}>
                {q.choices.map((t, k) => (
                  <button key={k} className={'opt' + (answer === t ? ' picked' : '')} aria-pressed={answer === t} onClick={() => setAnswer(t)}>
                    <span className="letter">{k + 1}</span>
                    <span className="grow">{t}</span>
                  </button>
                ))}
              </div>
              <span className="keyhint">Press <span className="kbd">1</span>–<span className="kbd">{q.choices.length}</span> to choose, <span className="kbd">Enter</span> for next</span>
            </>
          ) : (
            <input ref={input} className="input input-lg" placeholder="Type your answer…" value={answer} aria-labelledby={'hwq-' + day.day}
              autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={200}
              onChange={(ev) => setAnswer(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); next(); } }} />
          )}
        </div>
        <div className="hwnav">
          <button className="btn btn-secondary" onClick={() => setI(i - 1)} disabled={i === 0 || phase === 'sending'}><Icon name="left" size="sm" />Back</button>
          <span className="muted sm hwcount">{done}/{n} answered</span>
          <button className="btn btn-primary" onClick={next} disabled={phase === 'sending'}>
            {last ? (phase === 'sending' ? 'Handing in…' : <><Icon name="check" size="sm" />Hand in</>) : <>Next<Icon name="right" size="sm" /></>}
          </button>
        </div>
      </>
    );
  } else if (phase === 'result' && result) {
    body = <HomeworkResultView r={result} onClose={close} />;
  } else {
    body = (
      <>
        {day.myScore !== null ? (
          <p className="muted sm" style={{ margin: 0 }}>You’ve handed in this day’s homework. Look back at your answers any time.</p>
        ) : (
          <>
            <p className="muted sm" style={{ margin: 0 }}>
              Questions on this day’s words plus a few from earlier days. The timer starts when you begin — time breaks ties on the leaderboard. You can hand it in once.
            </p>
            {late > 0 && <p className="note sm">{lateText(late, false)}</p>}
          </>
        )}
        {err && <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{err}</span>}
        <div className="dfoot">
          {day.myScore !== null ? (
            <button ref={startBtn} className="btn btn-secondary" onClick={open} disabled={phase === 'loading'}>
              <Icon name="eye" size="sm" />{phase === 'loading' ? 'Loading…' : 'See answers'}
            </button>
          ) : (
            <button ref={startBtn} className="btn btn-primary btn-lg" onClick={open} disabled={phase === 'loading'}>
              <Icon name="listcheck" size="sm" />{phase === 'loading' ? 'Opening…' : 'Start homework'}
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <section className="card hwcard" aria-labelledby={'hw-' + day.day}>
      {head}
      {body}
      <div className="c-sr" aria-live="polite">{phase === 'result' && result ? 'Homework score ' + result.score + ' out of 100, ' + result.correct + ' of ' + result.total + ' correct.' : phase === 'sending' ? 'Handing in…' : ''}</div>
      {asking && (
        <ConfirmDialog title="Hand in now?"
          text={'You haven’t answered ' + plural(answers.filter((x) => !x.trim()).length, 'question') + '. Unanswered questions count as wrong, and you can only hand in once.'}
          confirm="Hand in" onConfirm={send} onClose={() => setAsking(false)} />
      )}
    </section>
  );
}
