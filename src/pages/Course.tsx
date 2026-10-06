import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api, type CourseDay, type CourseDetail, type CourseWord } from '../lib/api';
import { speak } from '../lib/speech';
import { useWB, type CourseTab } from '../state/WordbookContext';
import { EmptyState, Icon, LevelBadge, PageHead, PosBadge } from '../components/ui';
import { ConfirmDialog, JoinCode, VisibilityBadge, errText, fmtDate, joinedText, startText } from './Courses';
import { SaveWordButton } from './CourseLearn';
import { CourseLeaderboard } from './CourseLeaderboard';
import { CourseMembers } from './CourseMembers';
import { NotStarted, TodayCard } from './CourseToday';

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
      </div>
      {w.vi && <div className="vi">{w.vi}</div>}
      {w.meaning && <div className="muted sm">{w.meaning}</div>}
      {w.ex && <p className="quote cwex">“{w.ex}”</p>}
      {save && <div className="cwfoot"><SaveWordButton courseId={save.courseId} day={save.day} word={w.word} /></div>}
    </div>
  );
}

/**
 * The 30 days at a glance: learned ✓, listened 🎧 and the homework score. Enrolled learners open a day in the study
 * session; everyone else (a preview) sees its words below the grid.
 */
function CourseMap({ c }: { c: CourseDetail }) {
  const { a } = useWB();
  const [sel, setSel] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const e = c.enrollment;
  const current = e ? Math.min(e.currentDay, c.totalDays) : 0;
  const learned = e?.learned.length ?? 0;

  const pick = (d: CourseDay) => {
    if (e) { a.openStudy(c.id, d.day, d.day <= current ? null : 'learn'); return; }
    setSel(d.day);
    window.setTimeout(() => panel.current?.focus({ preventScroll: true }), 0);
    window.setTimeout(() => panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  const selDay = sel !== null ? c.days.find((d) => d.day === sel) : undefined;

  return (
    <>
      <div className="rowb" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <span className="muted sm">
          {e ? learned + '/' + c.totalDays + ' days learned · choose an open day to study it' : 'Choose a day to see its words.'}
        </span>
        {e && <span className="cmap-key muted xs" aria-hidden="true">
          <span><Icon name="check" size="sm" />learned</span><span>🎧 listened</span><span className="dayt-score">87</span><span>homework</span>
        </span>}
      </div>
      <div className="daygrid" role="list" aria-label="Course days">
        {c.days.map((d) => {
          const st = dayState(c, d);
          const isToday = !!e && d.day === current;
          const pending = st === 'open' && !!e && d.day <= current;
          const heard = !!e?.listened?.includes(d.day);
          const label = st === 'learned' ? 'Learned' : st === 'empty' ? 'Coming soon' : st === 'locked' ? d.count + (d.count === 1 ? ' word' : ' words') : isToday ? 'Today' : pending ? 'Ready to learn' : d.count + (d.count === 1 ? ' word' : ' words');
          const can = !!d.words?.length;
          return (
            <div key={d.day} role="listitem" style={{ display: 'contents' }}>
              <button
                className={'dayt ' + st + (pending ? ' pending' : '') + (isToday ? ' today' : '') + (sel === d.day ? ' sel' : '')}
                disabled={!can} onClick={() => pick(d)} aria-pressed={e ? undefined : sel === d.day}
                aria-label={'Day ' + d.day + ': ' + label + (heard ? ', listening done' : '') + (d.myScore !== null ? ', homework score ' + d.myScore : '') + (e && can ? '. Open in study mode' : '')}>
                <span className="dayt-n">Day {d.day}</span>
                {d.myScore !== null && <span className="dayt-score" title="Homework score">{d.myScore}</span>}
                <span className="dayt-s">
                  {st === 'learned' && <Icon name="check" size="sm" />}
                  {st === 'locked' && <Icon name="lock" size="sm" />}
                  {label}
                  {heard && <span className="dayt-ls" title="Listening done" aria-hidden="true">🎧</span>}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {!e && (
        <div ref={panel} tabIndex={-1} style={{ scrollMarginTop: 84, outline: 'none' }} aria-live="polite">
          {selDay?.words ? (
            <div className="card dpanel">
              <div className="rowb" style={{ flexWrap: 'wrap' }}>
                <div>
                  <h2 className="h2">Day {selDay.day}</h2>
                  <span className="muted sm">{selDay.words.length} {selDay.words.length === 1 ? 'word' : 'words'}</span>
                </div>
              </div>
              <div className="cwlist">
                {selDay.words.map((w, i) => <CourseWordRow key={w.word + i} w={w} />)}
              </div>
              <div className="dfoot">
                {selDay.words.length > 0 && (
                  <button className="btn btn-secondary" style={{ marginRight: 'auto' }} onClick={() => a.openStudy(c.id, selDay.day, 'learn')}>
                    <Icon name="zap" size="sm" />Practise these words
                  </button>
                )}
                <span className="hint">{c.isOwner ? 'This is a preview. Start learning the course to save words day by day.' : 'Join the course to save these words to My Vocabulary.'}</span>
              </div>
            </div>
          ) : (
            <p className="muted sm" style={{ marginTop: 16 }}>
              {c.readyDays === 0 ? 'The owner hasn’t added any words yet. Check back soon.' : 'Choose a day above to see its words.'}
            </p>
          )}
        </div>
      )}
    </>
  );
}

const TAB_LABEL: Record<CourseTab, string> = { today: 'Today', map: 'Course map', board: 'Leaderboard', members: 'Members' };

export function CoursePage() {
  const { s, a } = useWB();
  const { c, setC, failed, reload } = useCourse(s.courseId);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

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
  /** Enrolled, but the course's start date hasn't come yet: nothing is open (the owner can still preview the days). */
  const notStarted = !!e && e.currentDay < 1;
  const learned = e?.learned.length ?? 0;

  const tabs: CourseTab[] = [
    ...(e ? ['today' as const] : []),
    ...(notStarted && !c.isOwner ? [] : ['map' as const]),
    ...(c.isOwner || (e && !notStarted) ? ['board' as const] : []),
    ...(c.isOwner ? ['members' as const] : [])
  ];
  const tab: CourseTab = s.courseTab && tabs.includes(s.courseTab) ? s.courseTab : tabs[0];
  const setTab = (t: CourseTab) => a.set({ courseTab: t });
  // ← → Home End move between tabs (and select them).
  const onTabKey = (ev: KeyboardEvent) => {
    const k = tabs.indexOf(tab);
    const to = ev.key === 'ArrowRight' ? (k + 1) % tabs.length : ev.key === 'ArrowLeft' ? (k - 1 + tabs.length) % tabs.length
      : ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : -1;
    if (to < 0) return;
    ev.preventDefault();
    setTab(tabs[to]);
    window.setTimeout(() => tabsRef.current?.querySelector<HTMLButtonElement>('#ct-' + tabs[to])?.focus(), 0);
  };

  const join = async () => {
    setBusy(true);
    try {
      const res = await api.joinCourse(c.id);
      setC(res);
      a.set({ courseTab: 'today' });
      a.showToast(joinedText(res));
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
        {c.startDate && <span><Icon name="calendar" size="sm" />{startText(c.startDate)}</span>}
        <span>#{c.tag}</span>
        {c.isOwner && <VisibilityBadge v={c.visibility} />}
      </div>

      {(e || (c.isOwner && c.joinCode)) && (
        <div className="card cprog">
          {notStarted ? (
            <span className="muted sm" style={{ flex: 1, minWidth: 220 }}>You’re in. Day 1 opens on <b>{fmtDate(c.startDate)}</b>.</span>
          ) : e ? (
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

      {tabs.length > 1 && (
        <div ref={tabsRef} className="ctabs" role="tablist" aria-label="Course sections">
          {tabs.map((t) => (
            <button key={t} id={'ct-' + t} role="tab" className={'ctab' + (tab === t ? ' on' : '')} aria-selected={tab === t}
              aria-controls={'cp-' + t} tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)} onKeyDown={onTabKey}>
              {t === 'today' && <Icon name="calendar" size="sm" />}
              {t === 'map' && <Icon name="grid" size="sm" />}
              {t === 'board' && <Icon name="trophy" size="sm" />}
              {t === 'members' && <Icon name="users" size="sm" />}
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {tab && (
        <div id={'cp-' + tab} role={tabs.length > 1 ? 'tabpanel' : undefined} aria-labelledby={tabs.length > 1 ? 'ct-' + tab : undefined} className="cpanel">
          {tab === 'today' && (notStarted ? <NotStarted c={c} /> : <TodayCard key={c.id} c={c} />)}
          {tab === 'map' && <CourseMap c={c} />}
          {tab === 'board' && <CourseLeaderboard c={c} version={0} />}
          {tab === 'members' && <CourseMembers c={c} />}
        </div>
      )}

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
