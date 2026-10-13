import { useEffect, useState } from 'react';
import { dayKey, fmtAgo } from '../lib/data';
import { api, type CourseSummary, type DictationList, type GrammarList } from '../lib/api';
import { seasonalOn } from '../lib/appStyle';
import { bannerFor, seasonFor, type Season } from '../lib/season';
import { useWB } from '../state/WordbookContext';
import { currentStreak, getStats, reviewedToday } from '../state/selectors';
import { EmptyState, Icon, LevelBadge, PosBadge } from '../components/ui';
import { PLACEMENT, MasteryBadge, placementSkipped, weakestTense } from './Grammar';

/**
 * Grammar at a glance: my weakest practised tense (review it or practise it), or — before any tense is practised — a way
 * in through the placement test (hidden once it's skipped). Loaded once per visit; nothing shows if it fails.
 */
function WeakestTenseCard({ g }: { g: GrammarList | null }) {
  const { s, a } = useWB();
  if (!g) return null;
  const w = weakestTense(g.tenses);
  if (w) {
    return (
      <section className="card gweak" aria-labelledby="gweak-t">
        <span className="gweak-ic" aria-hidden="true"><Icon name="clock" size="lg" /></span>
        <div className="gweak-b">
          <span className="qkicker">Grammar</span>
          <h2 id="gweak-t" className="gweak-t">Weakest tense: {w.name} · {w.mastery}%</h2>
          <MasteryBadge value={w.mastery} />
        </div>
        <div className="gweak-act">
          <button className="btn btn-secondary" onClick={() => a.openGrammar(w.id)}><Icon name="book" size="sm" />Review lesson<span className="c-sr">: {w.name}</span></button>
          <button className="btn btn-primary" onClick={() => a.startGrammarPractice(w.id)}><Icon name="zap" size="sm" />Practise<span className="c-sr"> {w.name}</span></button>
        </div>
      </section>
    );
  }
  // Nothing practised yet: offer the placement test, unless it was skipped (or an older API doesn't have it).
  if (g.placement !== null || placementSkipped(s.userId)) return null;
  return (
    <section className="card gweak" aria-labelledby="gweak-t">
      <span className="gweak-ic" aria-hidden="true"><Icon name="trophy" size="lg" /></span>
      <div className="gweak-b">
        <span className="qkicker">Grammar</span>
        <h2 id="gweak-t" className="gweak-t">Find your level in grammar</h2>
        <span className="muted sm">A 5-minute placement test (≈19 questions) suggests where to start.</span>
      </div>
      <div className="gweak-act">
        <button className="btn btn-primary" onClick={() => a.startGrammarPractice(PLACEMENT)}>Take the test<Icon name="right" size="sm" /></button>
      </div>
    </section>
  );
}

function ProgressChart() {
  const { s, a } = useWB();
  const n = s.chart === '7' ? 7 : 30;
  const counts = new Map<string, number>();
  s.words.forEach((w) => { const k = dayKey(w.addedAt); counts.set(k, (counts.get(k) ?? 0) + 1); });
  const days = Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return d; });
  const series = days.map((d) => counts.get(dayKey(d)) ?? 0);
  const max = Math.max(1, ...series);
  const sum = series.reduce((x, y) => x + y, 0);
  return (
    <div className="card pad">
      <div className="rowb" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 className="h2">Learning progress</h2>
          <p className="sub sm">{sum} words added in the last {n} days</p>
        </div>
        <div className="seg" role="group" aria-label="Chart range">
          <button className={s.chart === '7' ? 'on' : ''} onClick={() => a.set({ chart: '7' })}>7 days</button>
          <button className={s.chart === '30' ? 'on' : ''} onClick={() => a.set({ chart: '30' })}>30 days</button>
        </div>
      </div>
      <div className={'chart' + (n === 30 ? ' c30' : '')}>
        {series.map((v, i) => {
          const d = days[i];
          const isToday = i === n - 1;
          const back = n - 1 - i;
          const label = n === 7
            ? (isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }))
            : (back % 7 === 0 ? (isToday ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : '');
          return (
            <div key={i} className={'bar' + (isToday ? ' today' : '')} title={d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ': ' + v + ' words'}>
              <span className="barval">{v}</span>
              <div className="barfill" style={{ height: Math.max(3, Math.round((v / max) * 136)) }} />
              <span className="barlbl">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Motivating lines for the greeting banner: one per day, the same all day. */
const LINES = [
  'A few words a day add up to a whole language.',
  'Small steps every day beat one big push.',
  'Today’s practice is tomorrow’s confidence.',
  'Say it out loud — your ears learn too.',
  'Mistakes are just practice in disguise.',
  'Five focused minutes still count.',
  'Every review makes a word stick a little longer.',
  'Keep the streak warm — one session is enough.'
];

/** Where "Continue learning" goes: today's course day (if not done), else due review, else today's grammar practice. */
function nextCourseDay(courses: CourseSummary[] | null) {
  for (const c of courses ?? []) {
    const e = c.enrollment;
    if (e && e.currentDay >= 1 && e.currentDay <= c.totalDays && !e.learned.includes(e.currentDay)) return { id: c.id, day: e.currentDay, title: c.title };
  }
  return null;
}

function Greeting({ courses, streak, due, season }: { courses: CourseSummary[] | null; streak: number; due: number; season: Season | null }) {
  const { s, a } = useWB();
  const now = new Date();
  const hour = now.getHours();
  const first = (s.settings.name || '').trim().split(/\s+/)[0] || 'there';
  const hello = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ', ' + first;
  const doy = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const line = LINES[doy % LINES.length];
  const next = nextCourseDay(courses);
  const banner = bannerFor(s.settings.style || 'classic', season);
  const go = next ? () => a.openStudy(next.id, next.day) : due ? a.startDue : () => a.startGrammarPractice('daily');
  const hint = next ? 'Day ' + next.day + ' of ' + next.title : due ? 'Review ' + due + (due === 1 ? ' word' : ' words') : 'Today’s grammar practice';
  return (
    <section className="greet" aria-labelledby="greet-t">
      <img className="greet-img" src={'/banners/' + banner + '.webp'} srcSet={'/banners/' + banner + '-sm.webp 800w, /banners/' + banner + '.webp 1600w'}
        sizes="(max-width: 900px) 100vw, 1100px" alt="" aria-hidden="true" loading="eager" decoding="async" />
      <div className="greet-b">
        <div className="greet-top">
          {season === 'tet' ? <p className="greet-hi" lang="vi">Chúc mừng năm mới! 🧧</p> : <p className="greet-hi">{hello} 👋</p>}
          <span className="greet-stat">{streak ? <>🔥 {streak} {streak === 1 ? 'day' : 'days'} streak</> : <>{due} {due === 1 ? 'word' : 'words'} due</>}</span>
        </div>
        <h1 id="greet-t" className="greet-t">{line}</h1>
        <p className="greet-line">{hint}</p>
        <div className="greet-act">
          <button className="greet-go" onClick={go}>Continue learning<Icon name="right" size="sm" /></button>
          <button className="greet-add" onClick={a.goNew} aria-label="Add vocabulary"><Icon name="plus" size="sm" /><span className="greet-add-t" aria-hidden="true">Add Vocabulary</span></button>
        </div>
      </div>
    </section>
  );
}

function Shortcuts({ total, due, g, dict }: { total: number; due: number; g: GrammarList | null; dict: DictationList | null }) {
  const { a } = useWB();
  const avg = g && g.tenses.length ? Math.round(g.tenses.reduce((x, t) => x + t.mastery, 0) / g.tenses.length) : null;
  const tiles = [
    { n: 1, icon: 'layers' as const, title: 'Vocabulary', sub: total + (total === 1 ? ' word' : ' words') + ' saved', go: () => a.go('vocab') },
    { n: 2, icon: 'book' as const, title: 'Grammar', sub: g ? g.tenses.length + ' lessons' + (avg !== null ? ' · ' + avg + '% mastery' : '') : 'Tenses and practice', go: () => a.openGrammar() },
    { n: 3, icon: 'headphones' as const, title: 'Dictation', sub: dict ? (dict.practisedToday ? 'Practised today ✓' : dict.sets.length + ' sets to listen and type') : 'Listen and type', go: () => a.go('dictation') },
    { n: 4, icon: 'refresh' as const, title: 'Review', sub: due ? due + (due === 1 ? ' word' : ' words') + ' due today' : 'All caught up', go: a.startDue }
  ];
  return (
    <nav className="tiles" aria-label="Shortcuts">
      {tiles.map((t) => (
        <button key={t.n} className={'tile tile' + t.n} onClick={t.go}>
          <span className="tile-ic" aria-hidden="true"><Icon name={t.icon} /></span>
          <span className="tile-t">{t.title}</span>
          <span className="tile-s">{t.sub}</span>
        </button>
      ))}
    </nav>
  );
}

export function Dashboard() {
  const { s, a } = useWB();
  const stats = getStats(s.words);
  const streak = currentStreak(s.progress);
  const done = reviewedToday(s.progress);
  const dayTotal = done + stats.due;
  const pct = dayTotal ? Math.round((done / dayTotal) * 100) : 100;
  const recent = s.words.slice().sort((x, y) => y.addedAt - x.addedAt).slice(0, 5);
  const [g, setG] = useState<GrammarList | null>(null);
  const [dict, setDict] = useState<DictationList | null>(null);
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [season] = useState<Season | null>(() => (seasonalOn() ? seasonFor(new Date()) : null));
  useEffect(() => {
    let on = true;
    // Optional extras: each stays hidden / generic if it fails.
    api.grammar().then((r) => { if (on) setG(r); }).catch(() => {});
    api.dictation().then((r) => { if (on) setDict(r); }).catch(() => {});
    api.listCourses('joined').then((r) => { if (on) setCourses(r); }).catch(() => {});
    return () => { on = false; };
  }, []);

  return (
    <>
      <Greeting courses={courses} streak={streak} due={stats.due} season={season} />
      <Shortcuts total={stats.total} due={stats.due} g={g} dict={dict} />

      <div className="grid4">
        <div className="card stat">
          <span className="stat-ic t-indigo"><Icon name="layers" /></span>
          <span className="stat-num">{stats.total}</span>
          <span className="stat-label">Total words</span>
          <span className="stat-foot good">+{stats.week} this week</span>
        </div>
        <div className="card stat">
          <span className="stat-ic t-amber"><Icon name="clock" /></span>
          <span className="stat-num">{stats.due}</span>
          <span className="stat-label">Words to review</span>
          <span className="stat-foot"><button className="linkbtn" onClick={a.startDue}>Review now<Icon name="right" size="sm" /></button></span>
        </div>
        <div className="card stat">
          <span className="stat-ic t-green"><Icon name="award" /></span>
          <span className="stat-num">{stats.mastered}</span>
          <span className="stat-label">Mastered words</span>
          <span className="stat-foot"><span className="mini"><div style={{ width: stats.masteredPct + '%' }} /></span>{stats.masteredPct}% of all</span>
        </div>
        <div className="card stat">
          <span className="stat-ic t-orange"><Icon name="flame" /></span>
          <span className="stat-num">{streak}</span>
          <span className="stat-label">Day streak</span>
          <span className="stat-foot">{streak ? 'Keep it going!' : 'Finish a review to start one'}</span>
        </div>
      </div>

      <div className="dash2">
        <div className="hero">
          <span className="hero-kicker">Today's Review</span>
          <h2 className="hero-title">
            {stats.due ? 'You have ' + stats.due + (stats.due === 1 ? ' word' : ' words') + ' waiting for review.' : 'You’re all caught up for today.'}
          </h2>
          <div className="hero-prog"><div style={{ width: pct + '%' }} /></div>
          <div className="hero-meta"><span>{done} / {dayTotal} completed</span><span>{pct}%</span></div>
          {stats.due > 0
            ? <button className="btn btn-white btn-lg" onClick={a.startDue}>Start Review<Icon name="right" size="sm" /></button>
            : <button className="btn btn-white btn-lg" onClick={() => a.go('practice')}>Practice More</button>}
        </div>
        <ProgressChart />
      </div>

      <WeakestTenseCard g={g} />

      <div className="card">
        <div className="cardhead">
          <h2 className="h2">Recent vocabulary</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => a.go('vocab')}>View all<Icon name="right" size="sm" /></button>
        </div>
        {recent.length > 0 ? recent.map((w) => (
          <button key={w.id} className="recent" onClick={() => a.go('detail', { sel: w.id })}>
            <span className="rw">{w.word}</span>
            <span className="rmean">{w.vi}</span>
            <span className="r-pos"><PosBadge>{w.pos}</PosBadge></span>
            <span><LevelBadge level={w.level} /></span>
            <span className="rtime">{fmtAgo(w.addedAt)}</span>
            <Icon name="right" size="sm" className="rchev muted" />
          </button>
        )) : (
          <EmptyState card={false} icon="book" title="No vocabulary yet." text="Pick words to learn from the shared library — 500 words for IT work, interviews and meetings.">
            <div className="actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => a.go('library')}><Icon name="globe" size="sm" />Browse the Library</button>
              <button className="btn btn-secondary" onClick={a.goNew}><Icon name="plus" size="sm" />Add Your Own Word</button>
            </div>
          </EmptyState>
        )}
      </div>
    </>
  );
}
