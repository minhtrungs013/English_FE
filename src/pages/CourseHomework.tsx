import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, isLesson, isTense, type CourseDay, type CourseDetail, type Homework, type HomeworkQuestion, type HomeworkResult } from '../lib/api';
import { canSpeak, speak, stopSpeaking } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { Icon } from '../components/ui';
import { ConfirmDialog, errText } from './Courses';
import { SLOW, Tokens } from './Dictation';
import { SentenceGrammar } from '../components/SentenceGrammar';

/** A dictation question's sentence: base64 of its UTF-8 text (plain `atob` if TextDecoder isn't there; the sentences are ASCII). */
export function decodeAudio(b64?: string): string {
  if (!b64) return '';
  try {
    const bin = atob(b64);
    try { return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))); } catch { return bin; }
  } catch {
    return '';
  }
}

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
  tenseChoice: 'Choose the right verb form',
  dictation: 'Listen and type the sentence',
  wordform: 'Use the right form of the word',
  sentence: 'Write your own sentence with the word',
  wordFill: 'Fill in the missing word',
  wordFillChoice: 'Choose the missing word'
};

/** Questions whose prompt is a sentence with a gap ("_____" for blank, "___" for tense and word-form ones). */
export const isSentence = (t: HomeworkQuestion['type']) =>
  t === 'blank' || t === 'tense' || t === 'tenseChoice' || t === 'wordform' || t === 'wordFill' || t === 'wordFillChoice';

/** A word-form question's part of speech after its label: "(noun)". */
export const PosHint = ({ q }: { q: Pick<HomeworkQuestion, 'type' | 'hint'> }) =>
  q.type === 'wordform' && q.hint ? <> <span className="badge pos"><span className="c-sr">Part of speech: </span>({q.hint})</span></> : null;

/** The prompt; for sentence questions the gap is shown as a line (filled with `fill`, when given). */
export function Prompt({ q, fill }: { q: Pick<HomeworkQuestion, 'type' | 'prompt'>; fill?: string }) {
  const m = isSentence(q.type) ? /_{3,}/.exec(q.prompt) : null;
  if (!m) return <>{q.prompt}</>;
  return <>{q.prompt.slice(0, m.index)}<span className="blank">{fill || ' '}</span>{q.prompt.slice(m.index + m[0].length)}</>;
}

/**
 * The tense (or topic) and its Vietnamese explanation, shown once the answer is known. With a lesson id (a tense or a
 * Foundations lesson), a link opens that grammar lesson (leaving a study session is fine: it's for reviewing).
 */
export function TenseNote({ label, explain, tense }: { label?: string; explain?: string; tense?: string }) {
  const { a } = useWB();
  if (!label && !explain) return null;
  return (
    <div className="tensenote">
      {label && <span className="badge t-blue"><Icon name="clock" size="sm" />{label}</span>}
      {explain && <span className="sm" lang="vi">{explain}</span>}
      {isLesson(tense) && (
        <button className="linkbtn glink" onClick={() => a.openGrammar(tense)}>
          <span aria-hidden="true">📖</span>{isTense(tense) ? 'Learn this tense' : 'Learn this'}{label && <span className="c-sr">: {label}</span>}
        </button>
      )}
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

/** A graded "Write a sentence": my sentence, the AI's score, mistakes, corrected version and an example. */
function SentenceReview({ q }: { q: HomeworkResult['review'][number] }) {
  const f = q.ai;
  return (
    <>
      <div className="hwrprompt">{q.prompt}</div>
      <div className="hwans">
        <span className="c-sr">{q.correct ? 'Passed.' : 'Not passed.'}</span>
        <span>Your sentence: <b className={q.correct ? 'hw-ok' : 'hw-no'}>{q.yourAnswer || '(no answer)'}</b></span>
        {f && f.score !== null && <span className={'mk-score ' + (f.score >= 9 ? 'good' : f.score >= 6 ? 'ok' : 'bad')} style={{ marginLeft: 0 }}>{f.score}/10</span>}
      </div>
      {f?.feedbackVi && <div className="ws-fb sm" lang="vi">{f.feedbackVi}</div>}
      {!!f?.mistakes.length && (
        <ul className="ws-mistakes">
          {f.mistakes.map((m, k) => <li key={k}><span className="badge t-red">{m.type}</span><span><s>{m.wrong}</s> → <b>{m.fix}</b>{m.explainVi ? <span className="muted"> · {m.explainVi}</span> : null}</span></li>)}
        </ul>
      )}
      {f?.corrected && f.corrected !== q.yourAnswer.trim() && <div className="sm"><span className="muted">Corrected: </span><b>{f.corrected}</b></div>}
      <div className="sm"><span className="muted">Example: </span>{f?.better || q.answer}</div>
    </>
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
              <PosHint q={q} />
              {q.review && <span className="badge t-amber">Review</span>}
            </div>
            {q.type === 'sentence' ? (
              <SentenceReview q={q} />
            ) : q.type === 'dictation' ? (
              <>
                <div className="hwans">
                  <span className="c-sr">{q.correct ? 'Correct.' : 'Wrong.'}</span>
                  <span>Your answer: <b className={q.correct ? 'hw-ok' : 'hw-no'}>{q.yourAnswer || '(no answer)'}</b></span>
                  {q.grade && <span className="muted xs">Score {q.grade.score}%</span>}
                </div>
                <div className={'dc-fb ' + (q.correct ? 'ok' : 'no')}>
                  {q.grade && <Tokens tokens={q.grade.tokens} />}
                  <div className="dc-full">
                    <span className="dc-en"><span className="c-sr">The sentence: </span>{q.answer}</span>
                    <button className="iconbtn sm" onClick={() => speak(q.answer)} aria-label={'Play again: ' + q.answer} title="Play again"><Icon name="volume" size="sm" /></button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="hwrprompt"><Prompt q={q} fill={isSentence(q.type) ? q.answer : undefined} /></div>
                <div className="hwans">
                  <span className="c-sr">{q.correct ? 'Correct.' : 'Wrong.'}</span>
                  <span>Your answer: <b className={q.correct ? 'hw-ok' : 'hw-no'}>{q.yourAnswer || '(no answer)'}</b></span>
                  {!q.correct && <span>Answer: <b className="hw-ok">{q.answer}</b></span>}
                </div>
              </>
            )}
            <TenseNote label={q.tenseLabel} explain={q.explain} tense={q.tense} />
            <SentenceGrammar g={q.grammar} />
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

/**
 * A day's homework for an enrolled learner: start → one question at a time → hand in → score and answers.
 * embedded: shown inside a step of today's plan, which has its own heading; it opens straight away (the step's button was the
 * "start") and onClose is called instead of going back to the start screen.
 * bare: in the study session, which has its own heading: no card or heading, but it starts from the start screen (the timer
 * starts only when the learner chooses to begin).
 */
export function HomeworkSection({ c, day, onSubmitted, embedded, bare, onClose }: {
  c: CourseDetail; day: CourseDay; onSubmitted: () => void; embedded?: boolean; bare?: boolean; onClose?: () => void;
}) {
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
  const area = useRef<HTMLTextAreaElement>(null);
  const startBtn = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  /** Times each dictation question was played, and the ones that already auto-played once. */
  const [plays, setPlays] = useState<number[]>([]);
  const autoPlayed = useRef(new Set<number>());

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
        setPlays(h.questions.map(() => 0));
        autoPlayed.current = new Set();
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

  /** Speaks the current dictation sentence (factor: the learner's speed × this) and counts the play. */
  const playQ = (factor = 1) => {
    if (!q || q.type !== 'dictation') return;
    speak(decodeAudio(q.audio), factor);
    const k = i;
    setPlays((prev) => prev.map((x, j) => (j === k ? x + 1 : x)));
  };

  // Move focus to the new question: the input for typed answers, else the question itself.
  useEffect(() => {
    if (phase !== 'taking' || !q) return;
    if (q.choices.length) qHead.current?.focus();
    else if (q.type === 'dictation' || q.type === 'sentence') area.current?.focus();
    else input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, i]);

  // A dictation question plays once by itself the first time it appears (marked when it plays, so StrictMode's re-run still plays it).
  useEffect(() => {
    if (phase !== 'taking' || q?.type !== 'dictation' || autoPlayed.current.has(i)) return;
    const k = i;
    const t = window.setTimeout(() => { autoPlayed.current.add(k); playQ(); }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, i]);

  // Stop any sentence still being spoken when the homework is handed in or closed.
  useEffect(() => {
    if (phase !== 'taking') stopSpeaking();
  }, [phase]);
  useEffect(() => () => stopSpeaking(), []);

  // 1–4 pick a choice; Enter goes on when the focus isn't on a control; Ctrl+Space replays a dictation sentence.
  useEffect(() => {
    if (phase !== 'taking' || !q || asking) return;
    const onKey = (ev: KeyboardEvent) => {
      if (q.type === 'dictation' && ev.key === ' ' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); playQ(); return; }
      const tag = (ev.target as HTMLElement).tagName;
      if (ev.ctrlKey || ev.metaKey || ev.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      const k = Number(ev.key);
      if (q.choices.length && k >= 1 && k <= q.choices.length) { ev.preventDefault(); setAnswer(q.choices[k - 1]); }
      else if (ev.key === 'Enter' && tag !== 'BUTTON') { ev.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Embedded: open once (the ref keeps StrictMode's second effect run from opening it twice).
  useEffect(() => {
    if (!embedded || opened.current) return;
    opened.current = true;
    void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (onClose) { onClose(); return; }
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
          <Kicker q={q}>Question {i + 1} of {n} · {ASK[q.type]}<PosHint q={q} /></Kicker>
          {q.type === 'dictation' ? (
            <>
              <div className="listen dc-play">
                <button className="playbig" onClick={() => playQ()} aria-label="Play the sentence"><Icon name="play" /></button>
                <div className="stack" style={{ gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => playQ(SLOW)}>
                    <span aria-hidden="true">🐢</span>Slow<span className="c-sr">: play the sentence slowly</span>
                  </button>
                  <span className="muted sm">{plays[i] ? 'Played ' + plays[i] + '×' : 'Not played yet'}</span>
                </div>
              </div>
              {!canSpeak() && <div className="errtxt"><Icon name="alert" size="sm" />Your browser can’t play speech, so audio may not work here.</div>}
              <label className="label" htmlFor={'hwq-in-' + day.day} id={'hwq-' + day.day}>
                Type what you hear{q.hint && <span className="muted sm" style={{ fontWeight: 400 }}> · {q.hint}</span>}
              </label>
              <textarea ref={area} id={'hwq-in-' + day.day} className="input dc-in" rows={3} placeholder="Type the sentence…" value={answer}
                maxLength={400} spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off"
                onChange={(ev) => setAnswer(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); next(); } }} />
              <span className="keyhint"><span className="kbd">Ctrl</span> + <span className="kbd">Space</span> to replay · <span className="kbd">Enter</span> for next</span>
            </>
          ) : (
            <>
              <h4 ref={qHead} tabIndex={-1} className={'qtext hwprompt' + (isSentence(q.type) ? ' sentence' : '')} id={'hwq-' + day.day}>
                <Prompt q={q} fill={answer.trim()} />
              </h4>
              {q.hint && q.type !== 'wordform' && <div className="muted sm">Hint: {q.hint}</div>}
            </>
          )}
          {q.type === 'dictation' ? null : q.choices.length ? (
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
          ) : q.type === 'sentence' ? (
            <>
              <textarea ref={area} className="input dc-in" rows={3} placeholder={'Write a sentence with this word…'} value={answer} aria-labelledby={'hwq-' + day.day}
                maxLength={300} onChange={(ev) => setAnswer(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); next(); } }} />
              <span className="keyhint">AI scores your sentence when you hand in (7/10 or more counts as correct). <span className="kbd">Enter</span> for next</span>
            </>
          ) : (
            <input ref={input} className="input input-lg" placeholder="Type your answer…" value={answer} aria-labelledby={'hwq-' + day.day}
              autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={200}
              onChange={(ev) => setAnswer(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); next(); } }} />
          )}
          {q.type === 'wordform' && <span className="keyhint">Type only the missing word in its right form — e.g. “decision” for “(decide)”.</span>}
          {q.type === 'tense' && <span className="keyhint">Type only the missing words — e.g. “has finished”, not “She has finished”.</span>}
          {q.type === 'wordFill' && <span className="keyhint">Type only the missing word, in the form the sentence needs — e.g. “legs”.</span>}
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
    <section className={(embedded || bare ? '' : 'card ') + 'hwcard'} aria-labelledby={embedded || bare ? undefined : 'hw-' + day.day} aria-label={embedded || bare ? 'Day ' + day.day + ' homework' : undefined}>
      {!embedded && !bare && head}
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
