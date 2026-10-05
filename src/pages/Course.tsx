import { useEffect, useRef, useState } from 'react';
import { api, type CourseDay, type CourseDetail, type CourseWord } from '../lib/api';
import { speak } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { EmptyState, Icon, LevelBadge, PageHead, PosBadge } from '../components/ui';
import { ConfirmDialog, JoinCode, VisibilityBadge, errText } from './Courses';
import { HomeworkSection } from './CourseHomework';
import { CourseLearn, SaveWordButton } from './CourseLearn';
import { CourseLeaderboard } from './CourseLeaderboard';
import { TodayPlan } from './CourseToday';
import { WarmupSection } from './CourseWarmup';

type DayState = 'learned' | 'open' | 'locked' | 'empty';

function dayState(c: CourseDetail, d: CourseDay): DayState {
  if (c.enrollment?.learned.includes(d.day)) return 'learned';
  if (d.count === 0) return 'empty';
  if (d.words === null) return 'locked';
  return 'open';
}

export function BackToCourses() {
  const { a } = useWB();
  return <button className="back" onClick={() => a.go('courses')}><Icon name="left" size="sm" />All courses</button>;
}

export function CourseLoading() {
  return (
    <div aria-busy="true" aria-label="Loading course">
      <div className="sk" style={{ width: 300, height: 34, marginBottom: 14 }} />
      <div className="sk" style={{ width: 220, height: 16, marginBottom: 28 }} />
      <div className="sk" style={{ height: 300, borderRadius: 16 }} />
    </div>
  );
}

/** Loads one course; `null` while loading. */
export function useCourse(id: string) {
  const [c, setC] = useState<CourseDetail | null>(null);
  const [failed, setFailed] = useState('');
  const load = async () => {
    setFailed('');
    try { setC(await api.getCourse(id)); } catch (e) { setFailed(errText(e, 'Couldn’t load this course.')); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [id]);
  return { c, setC, failed, reload: load };
}

/** save: the course day the word belongs to, for its "Save to My Vocabulary" button (enrolled learners, open days). */
export function CourseWordRow({ w, save }: { w: CourseWord; save?: { courseId: string; day: number } }) {
  return (
    <div className="cwrow">
      <div className="cwhead">
        <b className="cwword">{w.word}</b>
        <span className="ipa sm">{w.ipa}</span>
        <button className="iconbtn sm" onClick={() => speak(w.word)} aria-label={'Play pronunciation of ' + w.word} title="Play"><Icon name="volume" size="sm" /></button>
        <span className="badges" style={{ marginLeft: 'auto' }}>{w.pos && <PosBadge>{w.pos}</PosBadge>}<LevelBadge level={w.level} /></span>
        {save && <SaveWordButton courseId={save.courseId} day={save.day} word={w.word} />}
      </div>
      {w.vi && <div className="vi">{w.vi}</div>}
      {w.meaning && <div className="muted sm">{w.meaning}</div>}
      {w.ex && <p className="quote cwex">“{w.ex}”</p>}
    </div>
  );
}

export function CoursePage() {
  const { s, a } = useWB();
  const { c, setC, failed, reload } = useCourse(s.courseId);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** Enrolled learners get today's plan; the full list of days is folded away under it. */
  const [allOpen, setAllOpen] = useState(false);
  /** The selected day is open in the meet → practise flow instead of the word list. */
  const [practising, setPractising] = useState(false);
  /** Bumped after homework is handed in so the leaderboard reloads. */
  const [boardVersion, setBoardVersion] = useState(0);
  const panel = useRef<HTMLDivElement>(null);

  if (failed) {
    return (
      <>
        <BackToCourses />
        <EmptyState icon="alert" tint="t-red" title="Can’t open this course" text={failed}>
          <button className="btn btn-primary" onClick={reload}><Icon name="refresh" size="sm" />Try again</button>
        </EmptyState>
      </>
    );
  }
  if (!c) return <><BackToCourses /><CourseLoading /></>;

  const e = c.enrollment;
  const current = e ? Math.min(e.currentDay, c.totalDays) : 0;
  const pick = (day: number) => {
    // Today is done in the plan, not twice.
    if (e && day === current) {
      const h = document.getElementById('tp-title');
      h?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      h?.focus();
      return;
    }
    setAllOpen(true);
    setSel(day);
    setPractising(false);
    window.setTimeout(() => panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  const showBoard = () => {
    const h = document.getElementById('lb-title');
    h?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    h?.focus();
  };

  const join = async () => {
    setBusy(true);
    try {
      const res = await api.joinCourse(c.id);
      setC(res);
      setSel(null);
      a.showToast('Joined “' + c.title + '”. Day 1 starts today.');
    } catch (err) {
      a.showToast(errText(err, 'Couldn’t join this course.'), 'bad');
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    setBusy(true);
    try {
      await api.leaveCourse(c.id);
      a.showToast('You left “' + c.title + '”. Saved words stay in your vocabulary.');
      a.go('courses');
    } catch (err) {
      a.showToast(errText(err, 'Couldn’t leave this course.'), 'bad');
      setBusy(false);
      setLeaving(false);
    }
  };
  /** Marks a day learned without saving its words (they're saved one by one). */
  const learn = async (day: number): Promise<boolean> => {
    setBusy(true);
    const res = await a.learnCourseDay(c.id, day, []);
    if (res) setC(res);
    setBusy(false);
    return !!res;
  };
  const closePractice = () => { setPractising(false); window.setTimeout(() => document.getElementById('cl-practise')?.focus(), 0); };

  const selDay = sel !== null ? c.days.find((d) => d.day === sel) : undefined;
  const selState = selDay ? dayState(c, selDay) : undefined;
  const learned = e?.learned.length ?? 0;
  const homeworkOpen = !!e && !!selDay?.words?.length && selDay.day <= current;
  // Day 1 has nothing earlier to warm up with.
  const warmupOpen = homeworkOpen && selDay!.day >= 2;
  /** Enrolled learners can save the words of open days (today and earlier). */
  const canSave = !!e && !!selDay && selDay.day <= current;
  const submitted = () => { void reload(); setBoardVersion((v) => v + 1); };

  const days = (
    <>
      <div className="daygrid" role="list" aria-label="Course days">
        {c.days.map((d) => {
          const st = dayState(c, d);
          const isToday = !!e && d.day === current;
          const pending = st === 'open' && !!e && d.day <= current;
          const label = st === 'learned' ? 'Learned' : st === 'empty' ? 'Coming soon' : st === 'locked' ? d.count + (d.count === 1 ? ' word' : ' words') : isToday ? 'Today' : pending ? 'Ready to learn' : d.count + (d.count === 1 ? ' word' : ' words');
          const can = st === 'open' || (st === 'learned' && !!d.words);
          return (
            <div key={d.day} role="listitem" style={{ display: 'contents' }}>
              <button
                className={'dayt ' + st + (pending ? ' pending' : '') + (isToday ? ' today' : '') + (sel === d.day ? ' sel' : '')}
                disabled={!can} onClick={() => pick(d.day)} aria-pressed={sel === d.day}
                aria-label={'Day ' + d.day + ': ' + label + (d.myScore !== null ? ', homework score ' + d.myScore : '')}>
                <span className="dayt-n">Day {d.day}</span>
                {d.myScore !== null && <span className="dayt-score" title="Homework score">{d.myScore}</span>}
                <span className="dayt-s">
                  {st === 'learned' && <Icon name="check" size="sm" />}
                  {st === 'locked' && <Icon name="lock" size="sm" />}
                  {label}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div ref={panel} style={{ scrollMarginTop: 84 }}>
        {warmupOpen && <WarmupSection key={'wu' + selDay!.day} c={c} day={selDay!.day} />}
        {selDay && selDay.words ? (
          <div className="card dpanel" aria-live={practising ? undefined : 'polite'}>
            <div className="rowb" style={{ flexWrap: 'wrap' }}>
              <div>
                <h2 className="h2">Day {selDay.day}</h2>
                <span className="muted sm">{selDay.words.length} {selDay.words.length === 1 ? 'word' : 'words'}{e && selDay.day === current ? ' · today' : ''}</span>
              </div>
              {selState === 'learned' && <span className="badge t-green"><Icon name="check" size="sm" />Learned</span>}
            </div>
            {practising ? (
              <CourseLearn key={'cl' + selDay.day} c={c} day={selDay.day} words={selDay.words} learned={selState === 'learned'}
                onLearn={canSave ? async () => { if (await learn(selDay.day)) closePractice(); } : undefined}
                onClose={closePractice} />
            ) : (
            <>
            <div className="cwlist">
              {selDay.words.map((w, i) => <CourseWordRow key={w.word + i} w={w} save={canSave ? { courseId: c.id, day: selDay.day } : undefined} />)}
            </div>
            <div className="dfoot">
              {selDay.words.length > 0 && (
                <button id="cl-practise" className="btn btn-secondary" style={{ marginRight: 'auto' }} onClick={() => setPractising(true)}>
                  <Icon name="zap" size="sm" />Practise these words
                </button>
              )}
              {!e ? (
                <span className="hint">{c.isOwner ? 'This is a preview. Start learning the course to save words day by day.' : 'Join the course to save these words to My Vocabulary.'}</span>
              ) : selState === 'learned' ? (
                <span className="hint">Learned. Words you save go to My Vocabulary with the tag #{c.tag}.</span>
              ) : selDay.day > current ? (
                <span className="hint">This day opens on day {selDay.day}.</span>
              ) : (
                <button className="btn btn-primary btn-lg" onClick={() => learn(selDay.day)} disabled={busy}>
                  <Icon name="check" size="sm" />{busy ? 'Marking…' : 'Mark day ' + selDay.day + ' as learned'}
                </button>
              )}
            </div>
            </>
            )}
          </div>
        ) : (
          <p className="muted sm" style={{ marginTop: 16 }}>
            {c.readyDays === 0 ? 'The owner hasn’t added any words yet. Check back soon.' : 'Choose an open day above to see its words.'}
          </p>
        )}
        {homeworkOpen && <HomeworkSection key={selDay!.day} c={c} day={selDay!} onSubmitted={submitted} />}
      </div>
    </>
  );

  return (
    <>
      <BackToCourses />
      <PageHead title={c.title} sub={c.description || undefined}>
        {c.isOwner && <button className="btn btn-secondary" onClick={() => a.openCourse(c.id, true)}><Icon name="edit" size="sm" />Edit course</button>}
        {!e && <button className="btn btn-primary" onClick={join} disabled={busy}><Icon name="plus" size="sm" />{c.isOwner ? 'Learn this course' : 'Join course'}</button>}
      </PageHead>

      <div className="cmeta" style={{ marginTop: -14, marginBottom: 20 }}>
        <span>by <b>{c.isOwner ? 'You' : c.ownerName}</b></span>
        <span><Icon name="layers" size="sm" />{c.wordsPerDay} words a day · {c.readyDays}/{c.totalDays} days ready</span>
        <span><Icon name="users" size="sm" />{c.members} {c.members === 1 ? 'learner' : 'learners'}</span>
        <span>#{c.tag}</span>
        {c.isOwner && <VisibilityBadge v={c.visibility} />}
      </div>

      {(e || (c.isOwner && c.joinCode)) && (
        <div className="card cprog">
          {e ? (
            <div className="stack" style={{ gap: 8, flex: 1, minWidth: 220 }}>
              <div className="rowb">
                <b>Day {current} of {c.totalDays}</b>
                <span className="muted sm">{learned} {learned === 1 ? 'day' : 'days'} learned</span>
              </div>
              <span className="mini indigo" role="progressbar" aria-label="Days learned" aria-valuemin={0} aria-valuemax={c.totalDays} aria-valuenow={learned}>
                <div style={{ width: Math.round((learned / c.totalDays) * 100) + '%' }} />
              </span>
            </div>
          ) : (
            <span className="muted sm" style={{ flex: 1 }}>You own this course. Share the join code so others can learn it.</span>
          )}
          {c.isOwner && c.joinCode && <JoinCode code={c.joinCode} />}
        </div>
      )}

      {e && <TodayPlan c={c} setC={setC} reload={reload} onSubmitted={submitted} onOpenDay={pick} onShowBoard={showBoard} />}

      {e ? (
        <section className="csec tdays" aria-labelledby="tp-days">
          <h2 className="h2" id="tp-days">
            <button className="tdisc" aria-expanded={allOpen} aria-controls="tp-days-body" onClick={() => setAllOpen(!allOpen)}>
              <Icon name="down" />All days
              <span className="muted sm tdisc-n">{learned}/{c.totalDays} learned</span>
            </button>
          </h2>
          <div id="tp-days-body" hidden={!allOpen}>{days}</div>
        </section>
      ) : days}

      {(c.isOwner || e) && <CourseLeaderboard c={c} version={boardVersion} />}

      {e && (
        <div style={{ marginTop: 28 }}>
          <button className="btn btn-danger-soft btn-sm" onClick={() => setLeaving(true)}><Icon name="logout" size="sm" />Leave course</button>
        </div>
      )}

      {leaving && (
        <ConfirmDialog title={'Leave “' + c.title + '”?'} text="Your progress in this course will be lost. Words you already saved stay in My Vocabulary."
          confirm="Leave course" danger busy={busy} onConfirm={leave} onClose={() => setLeaving(false)} />
      )}
    </>
  );
}
