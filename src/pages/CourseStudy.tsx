import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { stopSpeaking } from '../lib/speech';
import { useWB, type StudyStep } from '../state/WordbookContext';
import { EmptyState, Icon } from '../components/ui';
import { CourseLoading, CourseWordRow, useCourse } from './Course';
import { ConfirmDialog, errText } from './Courses';
import { HomeworkSection } from './CourseHomework';
import { CourseLearn } from './CourseLearn';
import { ListeningPractice, useListening } from './CourseListening';
import { STEP_LABEL, dayPlan } from './CourseToday';
import { WarmupSection } from './CourseWarmup';

type View = StudyStep | 'complete';

/** How long the "Step done — next: …" screen stays before moving on. */
const MOVE_MS = 1600;

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

/**
 * A course day in focus: full screen, no sidebar. A stepper of the day's steps on top, the current step's practice in a
 * centred column, and on to the next unfinished step when one is done; a "Day N complete" screen after the last.
 * Esc or ✕ goes back to the course page (asking first when a step is under way).
 */
export function CourseStudy() {
  const { s, a } = useWB();
  const { c, setC, failed, reload } = useCourse(s.courseId);
  const day = s.study!.day;
  const dialogue = useListening(s.courseId, day);
  const [view, setView] = useState<View | null>(null);
  /** Bumped to start a step over (a fresh component). */
  const [run, setRun] = useState(0);
  /** A step was just finished: the short "done — next" screen. */
  const [moving, setMoving] = useState<{ done: StudyStep; next: View } | null>(null);
  const [leaving, setLeaving] = useState<null | { then: () => void }>(null);
  const [skipping, setSkipping] = useState(false);
  const [learnList, setLearnList] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);
  const [live, setLive] = useState('');
  /** The learner has done something in the open step (so leaving it asks first). */
  const dirty = useRef(false);
  const head = useRef<HTMLHeadingElement>(null);
  /** The warm-up result being saved, so Continue waits for it. */
  const reviewSave = useRef<Promise<boolean> | null>(null);
  /** Moves on from the "done — next" screen (set once the course has loaded). */
  const advanceRef = useRef<() => void>(() => undefined);

  const ready = !!c && dialogue !== undefined;
  const plan = c ? dayPlan(c, day, dialogue) : null;
  const requested = s.study!.step;
  let initial: View | null = null;
  if (plan && ready) {
    const ok = requested && plan.steps.includes(requested) && plan.stateOf(requested) !== 'locked';
    initial = ok ? requested : plan.nextAfter() ?? (plan.canDo ? 'complete' : plan.steps[0] ?? null);
  }
  const shown: View | null = view ?? initial;
  const shownKey = (shown ?? '') + ':' + run + ':' + (moving ? 'm' : '');

  // A new step (or screen): back to the top, focus its heading, say where we are.
  useEffect(() => {
    if (!plan || !shown) return;
    dirty.current = false;
    try { window.scrollTo(0, 0); } catch { /* ignore */ }
    head.current?.focus({ preventScroll: true });
    if (moving) return;
    if (shown === 'complete') setLive('Day ' + day + ' complete.');
    else setLive('Step ' + (plan.steps.indexOf(shown) + 1) + ' of ' + plan.steps.length + ': ' + stepTitle(shown) + '.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, ready]);

  // The streak, for the "Day complete" screen.
  useEffect(() => {
    if (shown !== 'complete' || !c) return;
    let on = true;
    api.getLeaderboard(c.id).then((lb) => { if (on) setStreak(lb.streak.me?.streak ?? 0); }).catch(() => { if (on) setStreak(null); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, c?.id]);

  // Moves on by itself after a moment (Continue does it straight away).
  useEffect(() => {
    if (!moving) return;
    const t = window.setTimeout(() => advanceRef.current(), MOVE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving]);

  const close = () => { stopSpeaking(); a.go('course', { study: null }); };
  /** Asks first when the learner is in the middle of a step. */
  const guard = (then: () => void) => {
    if (dirty.current && shown !== 'complete' && !moving) setLeaving({ then });
    else then();
  };
  const requestClose = () => guard(close);

  // Esc closes (not while a dialog is open: Esc closes that).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || leaving || document.querySelector('[role="dialog"]')) return;
      ev.preventDefault();
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (failed) {
    return (
      <div className="session study">
        <div className="stmain">
          <EmptyState icon="alert" tint="t-red" title="Can’t open this course" text={failed}>
            <div className="tact" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={reload}><Icon name="refresh" size="sm" />Try again</button>
              <button className="btn btn-ghost" onClick={close}>Back to course</button>
            </div>
          </EmptyState>
        </div>
      </div>
    );
  }
  if (!c || !plan || !ready) {
    return (
      <div className="session study">
        <div className="stmain"><CourseLoading /></div>
      </div>
    );
  }

  const e = c.enrollment;
  const dayObj = c.days.find((d) => d.day === day)!;
  const words = dayObj?.words ?? [];
  const score = dayObj?.myScore ?? null;
  const last = day === c.totalDays;

  function stepTitle(id: StudyStep) {
    if (id === 'review') return 'Review old lessons';
    if (id === 'learn') return plan!.isToday ? 'Learn today’s words' : 'Learn day ' + day + '’s words';
    if (id === 'listen') return 'Listening';
    return plan!.isToday || !plan!.canDo ? 'Homework' : 'Day ' + day + ' homework (catch-up)';
  }

  const go = (to: View) => { setMoving(null); setView(to); setRun((r) => r + 1); setLearnList(false); };
  /** After a step is done: the next unfinished one, or the "complete" screen. */
  const nextFrom = (id: StudyStep): View => plan.nextAfter(id, id) ?? 'complete';
  const finishStep = (id: StudyStep) => {
    dirty.current = false;
    setMoving({ done: id, next: nextFrom(id) });
    setLive(STEP_LABEL[id] + ' done.');
  };
  const advance = () => { if (moving) go(moving.next); };
  advanceRef.current = advance;
  /** Done looking at a step that was already finished: on to what's left. */
  const leaveStep = () => { const n = plan.nextAfter(); go(n ?? (plan.canDo ? 'complete' : 'learn')); };

  /* ---------- step actions (same API calls as before) ---------- */
  const setEnrollment = (patch: Partial<NonNullable<typeof e>>) =>
    setC((prev) => (prev?.enrollment ? { ...prev, enrollment: { ...prev.enrollment, ...patch } } : prev));

  const reviewed = (correct: number, total: number) => {
    reviewSave.current = api.warmupDone(c.id, day, correct, total)
      .then((r) => { setEnrollment({ warmedUp: r.warmedUp }); void reload(); return true; })
      .catch((err) => { a.showToast(errText(err, 'Couldn’t save your review.'), 'bad'); return false; });
  };
  const reviewClosed = async () => {
    const ok = reviewSave.current ? await reviewSave.current : plan.finished.review;
    reviewSave.current = null;
    if (ok) finishStep('review'); else leaveStep();
  };
  const skipReview = async () => {
    setSkipping(true);
    try {
      setEnrollment({ warmedUp: (await api.warmupDone(c.id, day)).warmedUp });
      void reload();
      finishStep('review');
    } catch (err) {
      a.showToast(errText(err, 'Couldn’t skip the review.'), 'bad');
    } finally {
      setSkipping(false);
    }
  };
  const learn = async () => {
    // Finishing doesn't save words: the learner saves the ones they want, word by word.
    const res = await a.learnCourseDay(c.id, day, []);
    if (!res) return;
    setC(res);
    finishStep('learn');
  };
  const listened = async (correct: number, total: number) => {
    try {
      setEnrollment({ listened: (await api.listeningDone(c.id, day, correct, total)).listened });
      finishStep('listen');
      return true;
    } catch (err) {
      a.showToast(errText(err, 'Couldn’t save your listening.'), 'bad');
      return false;
    }
  };
  const skipListening = async () => {
    setSkipping(true);
    try {
      setEnrollment({ listened: (await api.listeningDone(c.id, day)).listened });
      finishStep('listen');
    } catch (err) {
      a.showToast(errText(err, 'Couldn’t skip the listening.'), 'bad');
    } finally {
      setSkipping(false);
    }
  };
  const handedIn = async () => {
    await reload();
    finishStep('homework');
  };
  /** "Stop" / "Done" inside a step: a finished step moves on; an unfinished one means stop studying. */
  const stepClosed = (id: StudyStep) => () => (plan.finished[id] ? leaveStep() : plan.canDo ? requestClose() : close());

  /* ---------- the stepper ---------- */
  const stepper = plan.steps.length > 1 && (
    <ol className="ststeps" aria-label={'Day ' + day + ' steps'}>
      {plan.steps.map((id, k) => {
        const st = plan.stateOf(id);
        const on = shown === id && !moving;
        const status = st === 'done' ? 'done' : st === 'locked' ? 'locked' : on ? 'current' : 'to do';
        return (
          <li key={id}>
            <button className={'ststep is-' + st + (on ? ' on' : '')} disabled={st === 'locked' || on}
              onClick={() => guard(() => go(id))} aria-current={on ? 'step' : undefined}
              aria-label={'Step ' + (k + 1) + ', ' + STEP_LABEL[id] + ': ' + status + (st === 'done' && !on ? '. Practise again' : '')}>
              <span className="ststep-n" aria-hidden="true">
                {st === 'done' ? <Icon name="check" size="sm" /> : st === 'locked' ? <Icon name="lock" size="sm" /> : k + 1}
              </span>
              <span className="ststep-l">{STEP_LABEL[id]}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  /* ---------- body ---------- */
  let title: ReactNode = null;
  let sub: ReactNode = null;
  let tools: ReactNode = null;
  let body: ReactNode = null;

  if (!plan.hasWords) {
    title = 'No words for day ' + day + ' yet';
    body = (
      <div className="tact">
        <p className="muted" style={{ margin: 0 }}>The course owner hasn’t added words for this day. Check back later.</p>
        <button className="btn btn-primary" onClick={close}>Back to course</button>
      </div>
    );
  } else if (moving) {
    const n = moving.next;
    title = <><Icon name="checkc" />{STEP_LABEL[moving.done]} done</>;
    body = (
      <div className="stmove">
        <p className="stmove-t">
          {n === 'complete' ? 'That was the last step — let’s see how day ' + day + ' went.' : <>Next: <b>{stepTitle(n)}</b></>}
        </p>
        <span className="stmove-bar" aria-hidden="true"><span style={{ animationDuration: MOVE_MS + 'ms' }} /></span>
        <button className="btn btn-primary btn-lg" onClick={advance} autoFocus>
          {n === 'complete' ? 'See results' : 'Continue'}<Icon name="right" size="sm" />
        </button>
      </div>
    );
  } else if (shown === 'complete') {
    const learnedN = e?.learned.length ?? 0;
    title = plan.isToday ? (last ? 'Course complete 🎉' : 'Day ' + day + ' complete 🎉') : 'Day ' + day + ' caught up 🎉';
    sub = plan.isToday
      ? (last ? 'You’ve finished all ' + c.totalDays + ' days of “' + c.title + '”. Well done!' : 'Great work. Come back tomorrow for day ' + (day + 1) + '.')
      : 'Every step of day ' + day + ' is done.';
    body = (
      <div className="stdone">
        <div className="donestats">
          <div className="dstat"><b style={{ color: 'var(--success)' }}>{score ?? '—'}</b><span>homework score</span></div>
          <div className="dstat"><b style={{ color: 'var(--orange)' }}>{streak === null ? '—' : streak}</b><span>day streak 🔥</span></div>
          <div className="dstat"><b>{learnedN}/{c.totalDays}</b><span>days learned</span></div>
        </div>
        <div className="stdone-act">
          <button className="btn btn-primary btn-lg" onClick={close}><Icon name="left" size="sm" />Back to course</button>
          <button className="btn btn-secondary btn-lg" onClick={() => { stopSpeaking(); a.openCourse(c.id, false, 'board'); }}>
            <Icon name="trophy" size="sm" />Leaderboard
          </button>
          {plan.steps.includes('homework') && (
            <button className="btn btn-ghost" onClick={() => go('homework')}><Icon name="eye" size="sm" />Review answers</button>
          )}
        </div>
      </div>
    );
  } else if (shown === 'review') {
    title = stepTitle('review');
    sub = plan.finished.review ? 'Done — practise again any time. It doesn’t count toward your score.' : 'The recap story and earlier words (missed ones first), then quick questions. Not graded.';
    if (!plan.finished.review) tools = <button className="btn btn-ghost" onClick={skipReview} disabled={skipping}>{skipping ? 'Skipping…' : 'Skip review'}</button>;
    body = <WarmupSection key={'wu' + run} c={c} day={day} embedded onDone={reviewed} onClose={reviewClosed} />;
  } else if (shown === 'learn') {
    const done = plan.finished.learn;
    title = stepTitle('learn');
    sub = !plan.canDo
      ? (e ? 'This day isn’t open for you yet — a preview. Nothing is saved.' : c.isOwner ? 'A preview. Start learning the course to save words day by day.' : 'A preview. Join the course to save these words.')
      : done ? 'Done. Practise again, or look over the words and save the ones you want (tag #' + c.tag + ').'
        : plural(words.length, 'new word') + ' — meet them one by one, then practise until each one sticks.';
    tools = (
      <div className="seg" role="group" aria-label="Show">
        <button className={learnList ? '' : 'on'} aria-pressed={!learnList} onClick={() => setLearnList(false)}><Icon name="zap" size="sm" />Practise</button>
        <button className={learnList ? 'on' : ''} aria-pressed={learnList} onClick={() => setLearnList(true)}><Icon name="eye" size="sm" />Word list</button>
      </div>
    );
    body = learnList ? (
      <div className="cwlist stlist">
        {words.map((w, i) => <CourseWordRow key={w.word + i} w={w} save={plan.canDo ? { courseId: c.id, day } : undefined} />)}
      </div>
    ) : (
      <CourseLearn key={'cl' + run} c={c} day={day} words={words} learned={done}
        start={done ? 'practice' : 'meet'} onLearn={plan.canDo ? learn : undefined} onClose={stepClosed('learn')} />
    );
  } else if (shown === 'listen' && dialogue) {
    title = stepTitle('listen');
    sub = plan.finished.listen ? 'Done — practise it again any time.' : 'Hear a short conversation with this day’s words, fill the blanks and answer the questions. Practice only.';
    if (!plan.finished.listen) tools = <button className="btn btn-ghost" onClick={skipListening} disabled={skipping}>{skipping ? 'Skipping…' : 'Skip listening'}</button>;
    body = <ListeningPractice key={'ls' + run} d={dialogue} day={day} onFinish={listened} onClose={stepClosed('listen')} />;
  } else if (shown === 'homework' && dayObj) {
    title = stepTitle('homework');
    // The homework explains itself (and shows any late penalty).
    if (score !== null) tools = <span className="badge t-green"><Icon name="award" size="sm" />Score {score}</span>;
    body = <HomeworkSection key={'hw' + run} c={c} day={dayObj} bare onSubmitted={() => void handedIn()} onClose={stepClosed('homework')} />;
  }

  return (
    <div className="session study">
      <header className="stbar">
        <div className="stbar-top">
          <button className="iconbtn" onClick={requestClose} aria-label="Close and go back to the course" title="Close (Esc)"><Icon name="x" /></button>
          <div className="stbar-t">
            <b className="stbar-c">{c.title}</b>
            <span className="muted sm">Day {day} / {c.totalDays}{plan.isToday ? ' · today' : ''}</span>
          </div>
        </div>
        {stepper}
      </header>
      <main className="stmain">
        <div className="sthead">
          <div className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
            <h1 ref={head} tabIndex={-1} className="sth1">{title}</h1>
            {sub && <p className="muted sthsub">{sub}</p>}
          </div>
          {tools && <div className="sttools">{tools}</div>}
        </div>
        <div key={shownKey} className="stbody animA" onPointerDownCapture={() => { dirty.current = true; }} onKeyDownCapture={(ev) => { if (ev.key !== 'Escape' && ev.key !== 'Tab') dirty.current = true; }}>
          {body}
        </div>
      </main>
      <div className="c-sr" aria-live="polite" aria-atomic="true">{live}</div>
      {leaving && (
        <ConfirmDialog title="Leave this step?"
          text={shown === 'homework' && score === null ? 'Your answers so far won’t be kept. You can come back and do the homework later.' : 'Your progress in this step won’t be kept. Finished steps stay done.'}
          confirm="Leave" onConfirm={() => { const t = leaving.then; setLeaving(null); t(); }} onClose={() => setLeaving(null)} />
      )}
    </div>
  );
}
