import { dayKey, fmtAgo } from '../lib/data';
import { useWB } from '../state/WordbookContext';
import { currentStreak, getStats, reviewedToday } from '../state/selectors';
import { EmptyState, Icon, LevelBadge, PageHead, PosBadge } from '../components/ui';

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

export function Dashboard() {
  const { s, a } = useWB();
  const stats = getStats(s.words);
  const streak = currentStreak(s.progress);
  const done = reviewedToday(s.progress);
  const dayTotal = done + stats.due;
  const pct = dayTotal ? Math.round((done / dayTotal) * 100) : 100;
  const hour = new Date().getHours();
  const greeting = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ', ' + (s.settings.name || 'there');
  const recent = s.words.slice().sort((x, y) => y.addedAt - x.addedAt).slice(0, 5);

  return (
    <>
      <PageHead title={greeting} sub="Keep learning a few words today.">
        <button className="btn btn-secondary" onClick={a.startDue}><Icon name="refresh" size="sm" />Start Review</button>
        <button className="btn btn-primary" onClick={a.goNew}><Icon name="plus" size="sm" />Add Vocabulary</button>
      </PageHead>

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
