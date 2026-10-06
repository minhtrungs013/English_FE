import type { ReactNode } from 'react';
import type { CourseDetail, ListeningDialogue } from '../lib/api';
import { useWB, type StudyStep } from '../state/WordbookContext';
import { Icon } from '../components/ui';
import { fmtDate, vnToday } from './Courses';
import { lateDaysFor, penaltyFor } from './CourseHomework';
import { useListening } from './CourseListening';

/** done · active: the step to do now (today's steps open one after another) · open: can be done in any order (earlier days) · locked. */
export type StepState = 'done' | 'active' | 'open' | 'locked';

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

/** Short names, for the stepper and the step list. */
export const STEP_LABEL: Record<StudyStep, string> = { review: 'Review', learn: 'Learn', listen: 'Listening', homework: 'Homework' };

/**
 * What a course day asks of the learner. Today: review earlier days (from day 2), learn the words, listening (when the day
 * has a dialogue) and homework, one after another. An earlier day: learn, listening and homework (catch-up) in any order.
 * Not enrolled, or a day that isn't open yet: just the words to look at and practise (preview).
 */
export interface DayPlan {
  day: number;
  isToday: boolean;
  /** Enrolled and the day is open: progress is saved. */
  canDo: boolean;
  hasWords: boolean;
  steps: StudyStep[];
  finished: Record<StudyStep, boolean>;
  stateOf: (id: StudyStep) => StepState;
  /** The next unfinished step after `after` (then from the start); undefined when every step is done. */
  nextAfter: (after?: StudyStep, alsoDone?: StudyStep) => StudyStep | undefined;
}

/** dialogue: the day's listening (undefined while loading counts as none). */
export function dayPlan(c: CourseDetail, day: number, dialogue: ListeningDialogue | null | undefined): DayPlan {
  const e = c.enrollment;
  const current = e ? Math.min(e.currentDay, c.totalDays) : 0;
  const d = c.days.find((x) => x.day === day);
  const hasWords = !!d?.words?.length;
  const canDo = !!e && day >= 1 && day <= current && hasWords;
  const isToday = canDo && day === current;
  // Day 1 has nothing earlier to review; earlier days skip the review.
  const reviewable = isToday && day >= 2 && c.days.some((x) => x.day < day && x.count > 0);
  const steps: StudyStep[] = !hasWords ? [] : !canDo ? ['learn'] : [
    ...(reviewable ? ['review' as const] : []), 'learn', ...(dialogue ? ['listen' as const] : []), 'homework'
  ];
  const finished: Record<StudyStep, boolean> = {
    review: canDo && (e?.warmedUp ?? []).includes(day),
    learn: canDo && !!e?.learned.includes(day),
    listen: canDo && (e?.listened ?? []).includes(day),
    homework: canDo && d?.myScore != null
  };
  const active = steps.find((id) => !finished[id]);
  const stateOf = (id: StudyStep): StepState =>
    finished[id] ? 'done' : !canDo || !isToday ? 'open' : id === active ? 'active' : 'locked';
  const nextAfter = (after?: StudyStep, alsoDone?: StudyStep) => {
    const todo = (id: StudyStep) => id !== alsoDone && !finished[id];
    const at = after ? steps.indexOf(after) : -1;
    return [...steps.slice(at + 1), ...steps.slice(0, at + 1)].find(todo);
  };
  return { day, isToday, canDo, hasWords, steps, finished, stateOf, nextAfter };
}

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
 * An enrolled learner's day at a glance: one button into the study session (start / continue / look back), the steps'
 * status, and a notice about late homework (it doesn't block the day).
 */
export function TodayCard({ c }: { c: CourseDetail }) {
  const { a } = useWB();
  const e = c.enrollment!;
  const today = Math.min(e.currentDay, c.totalDays);
  const day = c.days.find((d) => d.day === today);
  const hasWords = !!day?.words?.length;
  const dialogue = useListening(c.id, hasWords ? today : null);
  const plan = dayPlan(c, today, dialogue);
  const loading = hasWords && dialogue === undefined;
  /** Earlier open days without handed-in homework, oldest first. */
  const behind = c.days.filter((d) => d.day < today && !!d.words?.length && d.myScore === null);
  const last = today === c.totalDays;
  const score = day?.myScore ?? null;

  const next = plan.nextAfter();
  const doneCount = plan.steps.filter((id) => plan.finished[id]).length;
  const allDone = hasWords && !next;
  const open = (step: StudyStep | null = null) => a.openStudy(c.id, today, step);

  let main: ReactNode;
  if (!hasWords) {
    main = (
      <div className="csec-empty">
        <h3 className="h2 tstep-t" style={{ fontSize: 15 }}>No new words yet</h3>
        <p className="muted sm" style={{ margin: '4px 0 0' }}>The course owner hasn’t added words for day {today} yet. Check back later.</p>
      </div>
    );
  } else if (allDone) {
    main = (
      <div className="tcard-main done">
        <div className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
          <b className="tcard-t"><Icon name="checkc" size="sm" />{last ? 'Course complete — well done!' : 'Day ' + today + ' complete'}</b>
          <span className="muted sm">
            {score !== null && <>Homework score <b className="tcard-score">{score}</b> / 100. </>}
            {last ? 'You’ve finished all ' + c.totalDays + ' days of “' + c.title + '”.' : 'Come back tomorrow for day ' + (today + 1) + '.'}
          </span>
        </div>
        <button className="btn btn-secondary btn-lg" onClick={() => open('homework')}>
          <Icon name="eye" size="sm" />Day {today} complete ✓ — review answers
        </button>
      </div>
    );
  } else {
    const k = next ? plan.steps.indexOf(next) + 1 : 1;
    main = (
      <div className="tcard-main">
        <div className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
          <b className="tcard-t">{doneCount ? 'Keep going' : plural(day!.words!.length, 'new word') + ' today'}</b>
          <span className="muted sm">
            {doneCount ? doneCount + ' of ' + plural(plan.steps.length, 'step') + ' done. Pick up where you left off.'
              : 'Study in focus mode: one step at a time, full screen.'}
          </span>
        </div>
        <button className="btn btn-primary btn-lg tcard-go" onClick={() => open(null)} disabled={loading}>
          {loading ? 'Loading today’s plan…' : doneCount
            ? <><Icon name="right" size="sm" />Continue: {STEP_LABEL[next!]} (step {k} of {plan.steps.length})</>
            : <><Icon name="book" size="sm" />Start day {today}</>}
        </button>
      </div>
    );
  }

  const cd = behind[0];
  return (
    <section className="tplan" aria-labelledby="tp-title">
      {cd && (
        <section className="card tcatch" aria-labelledby="tp-catchup">
          <div className="tcatch-head">
            <span className="tcatch-ic" aria-hidden="true"><Icon name="alert" /></span>
            <div className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
              <h3 className="h2 tstep-t" id="tp-catchup">You have unfinished homework from day {cd.day}</h3>
              <span className="sm">
                {plural(lateDaysFor(e.startDay, cd.day), 'day')} late — handing it in now keeps <b>{penaltyFor(lateDaysFor(e.startDay, cd.day))}%</b> of the score.
              </span>
            </div>
            {behind.length > 1 && <span className="badge t-amber">+{behind.length - 1} more</span>}
          </div>
          <div className="tact">
            <button className="btn btn-primary" onClick={() => a.openStudy(c.id, cd.day, 'homework')}>
              <Icon name="listcheck" size="sm" />Do day {cd.day} homework
            </button>
            <button className="btn btn-ghost" onClick={() => a.openStudy(c.id, cd.day, 'learn')}>See day {cd.day}’s words</button>
          </div>
        </section>
      )}

      <div className="card tcard">
        <div className="rowb" style={{ flexWrap: 'wrap' }}>
          <h2 className="h2 tplan-t" id="tp-title" tabIndex={-1}>Today</h2>
          <span className="muted sm">Day {today} of {c.totalDays}</span>
        </div>
        {main}
        {plan.steps.length > 0 && (
          <ol className="tmini" aria-label={'Day ' + today + ' steps'}>
            {plan.steps.map((id, k) => {
              const st = loading && id === 'homework' && !plan.finished.homework ? 'locked' : plan.stateOf(id);
              const status = st === 'done' ? (id === 'homework' && score !== null ? 'Score ' + score : 'Done') : st === 'active' ? 'Up next' : 'Locked';
              const inner = (
                <>
                  <span className="tmark" aria-hidden="true">
                    {st === 'done' ? <Icon name="check" size="sm" /> : st === 'locked' ? <Icon name="lock" size="sm" /> : k + 1}
                  </span>
                  <span className="tmini-txt">
                    <span className="tmini-l">{STEP_LABEL[id]}</span>
                    <span className="tmini-s">{status}</span>
                  </span>
                </>
              );
              return (
                <li key={id} className={'tmini-i is-' + st} aria-current={st === 'active' ? 'step' : undefined}>
                  {st === 'locked' ? (
                    <span className="tmini-row"><span className="c-sr">Step {k + 1}, locked: </span>{inner}</span>
                  ) : (
                    <button className="tmini-row" onClick={() => open(id)}
                      aria-label={'Step ' + (k + 1) + ', ' + STEP_LABEL[id] + ': ' + status + (st === 'done' ? '. Open to practise again' : '. Open')}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
