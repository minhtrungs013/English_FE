import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { api, type CourseDetail } from '../lib/api';
import { useWB } from '../state/WordbookContext';
import { Icon } from '../components/ui';
import { CourseWordRow } from './Course';
import { errText, fmtDate, vnToday } from './Courses';
import { HomeworkSection, lateDaysFor, penaltyFor } from './CourseHomework';
import { CourseLearn } from './CourseLearn';
import { ListeningPractice, parseDialogue, useListening } from './CourseListening';
import { WarmupSection } from './CourseWarmup';

type StepId = 'review' | 'learn' | 'listen' | 'homework' | 'done';
type StepState = 'done' | 'active' | 'locked';
/** Where focus goes next: a heading, or 'next' = the current step (resolved after the course reloads). */
type FocusTo = StepId | 'catchup' | 'empty' | 'next';

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

/** In place of today's plan while the course's start date is still ahead (enrollment.currentDay is 0). */
export function NotStarted({ c }: { c: CourseDetail }) {
  const utc = (d: string) => Date.parse(d + 'T00:00:00Z');
  const left = c.startDate ? Math.max(1, Math.round((utc(c.startDate) - utc(vnToday())) / 86400000)) : 0;
  return (
    <section className="card tsoon" aria-labelledby="tp-title">
      <span className="tsoon-ic" aria-hidden="true"><Icon name="calendar" /></span>
      <div className="stack" style={{ gap: 4, minWidth: 0 }}>
        <h2 className="h2 tplan-t" id="tp-title" tabIndex={-1}>
          This course starts on {c.startDate ? fmtDate(c.startDate) : 'its start date'} — come back then
        </h2>
        <span className="muted sm">
          {c.startDate && (left === 1 ? 'Day 1 opens tomorrow. ' : 'Day 1 opens in ' + plural(left, 'day') + '. ')}
          Everyone in “{c.title}” starts together, so nothing is open yet. Your plan for each day will appear here.
        </span>
      </div>
    </section>
  );
}

/**
 * An enrolled learner's guided day: catch up on late homework (a notice, doesn't block), review earlier days,
 * learn today's words, listening (when the day has a dialogue), homework, then "all done". Only the first unfinished
 * step is active; later ones are locked.
 */
export function TodayPlan({ c, setC, reload, onSubmitted, onOpenDay, onShowBoard }: {
  c: CourseDetail;
  setC: Dispatch<SetStateAction<CourseDetail | null>>;
  reload: () => Promise<void>;
  /** Homework handed in: reload the course and the leaderboard. */
  onSubmitted: () => void;
  onOpenDay: (day: number) => void;
  onShowBoard: () => void;
}) {
  const { a } = useWB();
  /** Steps whose content is shown (several can be open, so a homework in progress isn't lost). */
  const [open, setOpen] = useState<StepId[]>([]);
  const [catchOpen, setCatchOpen] = useState(false);
  /** The late day being done, kept while it's open (the list changes once it's handed in). */
  const [catchDay, setCatchDay] = useState<number | null>(null);
  /** How the learn step is open: the meet → practise flow, practising again, or just the word list. */
  const [learnView, setLearnView] = useState<'flow' | 'practice' | 'list'>('flow');
  const [skipping, setSkipping] = useState(false);
  const [skippingListen, setSkippingListen] = useState(false);
  const [live, setLive] = useState('');
  const [focusReq, setFocusReq] = useState<{ to: FocusTo; n: number } | null>(null);
  const heads = useRef<Partial<Record<FocusTo, HTMLHeadingElement | null>>>({});

  const e = c.enrollment!;
  const today = Math.min(e.currentDay, c.totalDays);
  const day = c.days.find((d) => d.day === today);
  const words = day?.words ?? [];
  const hasWords = words.length > 0;
  const warmed = (e.warmedUp ?? []).includes(today);
  const learned = e.learned.includes(today);
  const listened = (e.listened ?? []).includes(today);
  /** Today's dialogue: undefined while loading, null when there's none (then there's no listening step). */
  const dialogue = useListening(c.id, hasWords ? today : null);
  const score = day?.myScore ?? null;
  // Day 1 has nothing earlier to review.
  const reviewable = today >= 2 && c.days.some((d) => d.day < today && d.count > 0);
  /** Earlier open days without handed-in homework, oldest first. */
  const behind = c.days.filter((d) => d.day < today && !!d.words?.length && d.myScore === null);
  const last = today === c.totalDays;

  const steps: StepId[] = [
    ...(reviewable ? ['review' as const] : []),
    ...(hasWords ? ['learn' as const, ...(dialogue ? ['listen' as const] : []), 'homework' as const, 'done' as const] : [])
  ];
  const finished: Record<StepId, boolean> = { review: warmed, learn: learned, listen: listened, homework: score !== null, done: false };
  const activeId = steps.find((id) => !finished[id]);
  /** Homework waits until we know whether there's a listening step before it. */
  const listenPending = hasWords && dialogue === undefined;
  const stateOf = (id: StepId): StepState => (finished[id] ? 'done' : id === activeId && !(id === 'homework' && listenPending) ? 'active' : 'locked');
  const TITLE: Record<StepId, string> = {
    review: 'Review old lessons',
    learn: 'Learn today’s words',
    listen: 'Listening',
    homework: 'Homework',
    done: last && activeId === 'done' ? 'Course complete' : 'Day ' + today + ' complete'
  };

  const focus = (to: FocusTo) => setFocusReq((r) => ({ to, n: (r?.n ?? 0) + 1 }));
  // Runs after the render that has the new course, so 'next' is the step that's current now.
  useEffect(() => {
    if (!focusReq) return;
    let to = focusReq.to;
    if (to === 'catchup' && !behind.length) to = 'next';
    if (to === 'next') to = activeId ?? 'empty';
    heads.current[to]?.focus();
    if (focusReq.to === 'next' || focusReq.to === 'catchup') {
      setLive(to === 'catchup' ? 'Next: unfinished homework from day ' + behind[0].day + '.'
        : to === 'done' ? TITLE.done + '.' : to === 'empty' ? '' : 'Next step: ' + TITLE[to as StepId] + '.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReq]);

  const expand = (id: StepId) => { setOpen((o) => (o.includes(id) ? o : [...o, id])); focus(id); };
  const collapse = (id: StepId) => { setOpen((o) => o.filter((x) => x !== id)); focus('next'); };

  const setWarmed = (warmedUp: number[]) =>
    setC((prev) => (prev?.enrollment ? { ...prev, enrollment: { ...prev.enrollment, warmedUp } } : prev));
  /** The practice was finished: record it (the summary stays open until Continue). */
  const reviewed = async (correct: number, total: number) => {
    try {
      setWarmed((await api.warmupDone(c.id, today, correct, total)).warmedUp);
      setLive('Review done.');
      void reload();
    } catch (err) {
      a.showToast(errText(err, 'Couldn’t save your review.'), 'bad');
    }
  };
  const skip = async () => {
    setSkipping(true);
    try {
      setWarmed((await api.warmupDone(c.id, today)).warmedUp);
      setOpen((o) => o.filter((x) => x !== 'review'));
      focus('next');
      void reload();
    } catch (err) {
      a.showToast(errText(err, 'Couldn’t skip the review.'), 'bad');
    } finally {
      setSkipping(false);
    }
  };
  const setListened = (listened: number[]) =>
    setC((prev) => (prev?.enrollment ? { ...prev, enrollment: { ...prev.enrollment, listened } } : prev));
  /** Finish on the listening summary: record the result and move on. */
  const listenedDone = async (correct: number, total: number) => {
    try {
      setListened((await api.listeningDone(c.id, today, correct, total)).listened);
      setOpen((o) => o.filter((x) => x !== 'listen'));
      focus('next');
      return true;
    } catch (err) {
      a.showToast(errText(err, 'Couldn’t save your listening.'), 'bad');
      return false;
    }
  };
  const skipListening = async () => {
    setSkippingListen(true);
    try {
      setListened((await api.listeningDone(c.id, today)).listened);
      setOpen((o) => o.filter((x) => x !== 'listen'));
      focus('next');
    } catch (err) {
      a.showToast(errText(err, 'Couldn’t skip the listening.'), 'bad');
    } finally {
      setSkippingListen(false);
    }
  };
  const learn = async () => {
    // Finishing doesn't save words: the learner saves the ones they want, word by word.
    const res = await a.learnCourseDay(c.id, today, []);
    if (!res) return;
    setC(res);
    setOpen((o) => o.filter((x) => x !== 'learn'));
    focus('next');
  };

  /* ---------- catch up ---------- */
  const cd = (catchDay !== null && catchOpen ? c.days.find((d) => d.day === catchDay) : undefined) ?? behind[0];
  let catchup: ReactNode = null;
  if (cd) {
    const late = lateDaysFor(e.startDay, cd.day);
    const more = behind.filter((d) => d.day !== cd.day).length;
    const closeCatch = () => { setCatchOpen(false); setCatchDay(null); focus('catchup'); };
    catchup = (
      <section className="card tcatch" aria-labelledby="tp-catchup">
        <div className="tcatch-head">
          <span className="tcatch-ic" aria-hidden="true"><Icon name="alert" /></span>
          <div className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
            <h3 ref={(el) => { heads.current.catchup = el; }} tabIndex={-1} className="h2 tstep-t" id="tp-catchup">
              {cd.myScore !== null ? 'Day ' + cd.day + ' homework handed in' : 'You have unfinished homework from day ' + cd.day}
            </h3>
            {cd.myScore === null && (
              <span className="sm">{plural(late, 'day')} late — handing it in now keeps <b>{penaltyFor(late)}%</b> of the score.</span>
            )}
          </div>
          {more > 0 && <span className="badge t-amber">+{more} more</span>}
        </div>
        {catchOpen ? (
          <div className="tcatch-body">
            <HomeworkSection key={'cu' + cd.day} c={c} day={cd} embedded onSubmitted={onSubmitted} onClose={closeCatch} />
          </div>
        ) : (
          <div className="tact">
            <button className="btn btn-primary" onClick={() => { setCatchDay(cd.day); setCatchOpen(true); }}>
              <Icon name="listcheck" size="sm" />Do day {cd.day} homework
            </button>
            <button className="btn btn-ghost" onClick={() => onOpenDay(cd.day)}>See day {cd.day}’s words</button>
          </div>
        )}
      </section>
    );
  }

  /* ---------- steps ---------- */
  const lockText = (id: StepId) => {
    if (id === 'learn') return 'Unlocks after the review — or skip it';
    if (id === 'done') return 'Unlocks after homework';
    if (id === 'homework' && listenPending && activeId === 'homework') return 'Checking for today’s listening…';
    const review = reviewable && !warmed;
    if (id === 'listen') return review && !learned ? 'Unlocks after the review and today’s words' : review ? 'Unlocks after the review' : 'Unlocks after you learn today’s words';
    const todo = [review && 'the review', !learned && 'today’s words', !!dialogue && !listened && 'the listening'].filter(Boolean) as string[];
    if (!todo.length) return 'Unlocks after the steps above';
    const list = todo.length === 1 ? todo[0] : todo.slice(0, -1).join(', ') + ' and ' + todo[todo.length - 1];
    return 'Unlocks after ' + list + (todo.length === 1 && todo[0] === 'the listening' ? ' — or skip it' : '');
  };

  const renderStep = (id: StepId, k: number) => {
    const st = stateOf(id);
    const isOpen = open.includes(id);
    let sub: ReactNode = null;
    let badge: ReactNode = null;
    let body: ReactNode = null;
    let actions: ReactNode = null;

    if (id === 'review') {
      sub = st === 'done' ? 'Done — you’re warmed up for today.' : 'Review before today’s new words: the recap story and the words you missed.';
      badge = <span className="badge t-amber" lang="vi">Ôn bài cũ</span>;
      if (isOpen) {
        body = <WarmupSection key={'wu' + today} c={c} day={today} embedded onDone={reviewed} onClose={() => collapse('review')} />;
        if (!warmed) actions = <button className="btn btn-ghost" onClick={skip} disabled={skipping}>{skipping ? 'Skipping…' : 'Skip review'}</button>;
      } else if (st === 'active') {
        actions = (
          <>
            <button className="btn btn-primary btn-lg" onClick={() => expand('review')}><Icon name="refresh" size="sm" />Start review</button>
            <button className="btn btn-ghost" onClick={skip} disabled={skipping}>{skipping ? 'Skipping…' : 'Skip review'}</button>
          </>
        );
      } else if (st === 'done') {
        actions = <button className="btn btn-ghost btn-sm" onClick={() => expand('review')}><Icon name="zap" size="sm" />Practise again</button>;
      }
    } else if (id === 'learn') {
      sub = st === 'done'
        ? 'Done — ' + plural(words.length, 'word') + ' learned. Words you save go to My Vocabulary with the tag #' + c.tag + '.'
        : plural(words.length, 'new word') + ' today — meet them one by one, then practise until each one sticks. Save the ones you want to keep.';
      if (isOpen) {
        body = learnView === 'list' ? (
          <>
            <div className="cwlist tlist">{words.map((w, i) => <CourseWordRow key={w.word + i} w={w} save={{ courseId: c.id, day: today }} />)}</div>
            <div className="dfoot">
              <button className="btn btn-ghost" onClick={() => collapse('learn')}>Hide words</button>
              <button className="btn btn-secondary" onClick={() => setLearnView('practice')}><Icon name="zap" size="sm" />Practise again</button>
            </div>
          </>
        ) : (
          <CourseLearn key={'cl' + today + learnView} c={c} day={today} words={words} learned={learned}
            start={learnView === 'practice' ? 'practice' : 'meet'} onLearn={learn} onClose={() => collapse('learn')} />
        );
      } else if (st === 'active') {
        actions = <button className="btn btn-primary btn-lg" onClick={() => { setLearnView('flow'); expand('learn'); }}><Icon name="book" size="sm" />Start learning</button>;
      } else if (st === 'done') {
        actions = (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => { setLearnView('practice'); expand('learn'); }}><Icon name="zap" size="sm" />Practise again</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setLearnView('list'); expand('learn'); }}><Icon name="eye" size="sm" />See words</button>
          </>
        );
      }
    } else if (id === 'listen' && dialogue) {
      const nb = parseDialogue(dialogue.lines).blanks.length;
      const nq = dialogue.questions.length;
      sub = st === 'done'
        ? 'Done — “' + dialogue.title + '”. Practise it again any time.'
        : 'Hear a short conversation with today’s words (“' + dialogue.title + '”), fill ' + plural(nb, 'blank') + (nq ? ' and answer ' + plural(nq, 'question') : '') + '.';
      badge = <span className="badge t-blue" lang="vi">Luyện nghe</span>;
      if (isOpen) {
        body = <ListeningPractice key={'ls' + today} d={dialogue} day={today} onFinish={listenedDone} onClose={() => collapse('listen')} />;
        if (!listened) actions = <button className="btn btn-ghost" onClick={skipListening} disabled={skippingListen}>{skippingListen ? 'Skipping…' : 'Skip listening'}</button>;
      } else if (st === 'active') {
        actions = (
          <>
            <button className="btn btn-primary btn-lg" onClick={() => expand('listen')}><Icon name="headphones" size="sm" />Start listening</button>
            <button className="btn btn-ghost" onClick={skipListening} disabled={skippingListen}>{skippingListen ? 'Skipping…' : 'Skip listening'}</button>
          </>
        );
      } else if (st === 'done') {
        actions = <button className="btn btn-ghost btn-sm" onClick={() => expand('listen')}><Icon name="headphones" size="sm" />Practise again</button>;
      }
    } else if (id === 'homework') {
      sub = score !== null
        ? 'Handed in — score ' + score + ' / 100.'
        : 'Questions on today’s words plus a few from earlier days. The timer starts when you begin, and you can hand it in once.';
      if (score !== null) badge = <span className="badge t-green"><Icon name="award" size="sm" />Score {score}</span>;
      if (isOpen && day) {
        body = <HomeworkSection key={'hw' + today} c={c} day={day} embedded onSubmitted={onSubmitted} onClose={() => collapse('homework')} />;
      } else if (st === 'active') {
        actions = <button className="btn btn-primary btn-lg" onClick={() => expand('homework')}><Icon name="listcheck" size="sm" />Start homework</button>;
      } else if (st === 'done') {
        actions = <button className="btn btn-ghost btn-sm" onClick={() => expand('homework')}><Icon name="eye" size="sm" />See answers</button>;
      }
    } else if (st === 'active') {
      sub = last ? 'You’ve finished all ' + c.totalDays + ' days of “' + c.title + '”. Well done!' : 'Come back tomorrow for day ' + (today + 1) + '.';
      body = score !== null && (
        <div className="tscore">
          <b>{score}</b><span className="muted">/ 100 homework score</span>
        </div>
      );
      actions = <button className="btn btn-primary" onClick={onShowBoard}><Icon name="trophy" size="sm" />See streak & leaderboard</button>;
    } else {
      sub = 'Finish the steps above to complete the day.';
    }

    return (
      <li key={id} className={'card tstep is-' + st + (id === 'done' ? ' final' : '')} aria-current={st === 'active' ? 'step' : undefined}>
        <span className="tmark" aria-hidden="true">
          {st === 'done' || (id === 'done' && st === 'active') ? <Icon name="check" size="sm" /> : st === 'locked' ? <Icon name="lock" size="sm" /> : k + 1}
        </span>
        <div className="tbody">
          <div className="rowb" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
              <h3 ref={(el) => { heads.current[id] = el; }} tabIndex={-1} className="h2 tstep-t" id={'tp-' + id}>
                <span className="c-sr">Step {k + 1} of {steps.length}, {st === 'done' ? 'done' : st === 'active' ? 'current' : 'locked'}: </span>
                {id === 'listen' && <span aria-hidden="true">🎧 </span>}{TITLE[id]}
              </h3>
              <span className="muted sm">{sub}</span>
            </div>
            {badge}
          </div>
          {st === 'locked' ? (
            <span className="tlock"><Icon name="lock" size="sm" />{lockText(id)}</span>
          ) : (
            <>
              {body}
              {actions && <div className="tact">{actions}</div>}
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <section className="tplan" aria-labelledby="tp-title">
      <div className="rowb" style={{ flexWrap: 'wrap' }}>
        <h2 className="h2 tplan-t" id="tp-title" tabIndex={-1}>Today’s plan</h2>
        <span className="muted sm">Day {today} of {c.totalDays}</span>
      </div>
      {catchup}
      {steps.length > 0 && <ol className="tsteps" aria-label={'Day ' + today + ' steps'}>{steps.map(renderStep)}</ol>}
      {!hasWords && (
        <div className="csec-empty">
          <h3 ref={(el) => { heads.current.empty = el; }} tabIndex={-1} className="h2 tstep-t" style={{ fontSize: 15 }}>No new words yet</h3>
          <p className="muted sm" style={{ margin: '4px 0 0' }}>The course owner hasn’t added words for day {today} yet. Check back later.</p>
        </div>
      )}
      <div className="c-sr" aria-live="polite" aria-atomic="true">{live}</div>
    </section>
  );
}
