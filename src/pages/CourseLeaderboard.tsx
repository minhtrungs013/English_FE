import { useEffect, useState, type ReactNode } from 'react';
import { api, type Board, type BoardRow, type CourseDetail, type Leaderboard } from '../lib/api';
import { Icon } from '../components/ui';
import { errText } from './Courses';
import { fmtDuration } from './CourseHomework';

type Tab = 'day' | 'overall' | 'streak';
const TABS: { id: Tab; label: string }[] = [{ id: 'day', label: 'Day' }, { id: 'overall', label: 'Overall' }, { id: 'streak', label: 'Streak' }];

function Rank({ n }: { n: number }) {
  return <span className={'lbrank' + (n <= 3 ? ' r' + n : '')}><span className="c-sr">Rank </span>{n}</span>;
}

/** One board: the top rows, then my row pinned at the bottom when it's further down. */
function BoardList<T>({ board, label, value, empty }: {
  board: Board<T>; label: string; value: (r: BoardRow<T>) => ReactNode; empty: string;
}) {
  if (!board.rows.length) return <p className="muted sm csec-empty">{empty}</p>;
  const row = (r: BoardRow<T>) => (
    <li key={r.rank + ':' + r.name} className={'lbrow' + (r.me ? ' me' : '')} aria-current={r.me ? 'true' : undefined}>
      <Rank n={r.rank} />
      <span className="lbname">{r.name}{r.me && <span className="muted"> (you)</span>}</span>
      <span className="lbval">{value(r)}</span>
    </li>
  );
  const pinned = board.me && !board.rows.some((r) => r.me) ? board.me : null;
  return (
    <ol className="lblist" aria-label={label}>
      {board.rows.map(row)}
      {pinned && <li className="lbgap" aria-hidden="true">···</li>}
      {pinned && row(pinned)}
    </ol>
  );
}

/** Day / Overall / Streak leaderboards for a course (owner and learners). `version` changes reload it. */
export function CourseLeaderboard({ c, version }: { c: CourseDetail; version: number }) {
  const [lb, setLb] = useState<Leaderboard | null>(null);
  const [day, setDay] = useState<number | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('day');
  const [failed, setFailed] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async (d?: number) => {
    setLoading(true);
    setFailed('');
    try { setLb(await api.getLeaderboard(c.id, d)); } catch (e) { setFailed(errText(e, 'Couldn’t load the leaderboard.')); }
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(day); }, [c.id, day, version]);

  const shown = lb ? lb.day : day ?? 1;
  let body: ReactNode;
  if (failed) {
    body = (
      <div className="rowb csec-empty" style={{ flexWrap: 'wrap' }}>
        <span className="errtxt"><Icon name="alert" size="sm" />{failed}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => load(day)}><Icon name="refresh" size="sm" />Try again</button>
      </div>
    );
  } else if (!lb) {
    body = <div className="sk" style={{ height: 180, borderRadius: 12 }} aria-busy="true" aria-label="Loading leaderboard" />;
  } else if (tab === 'day') {
    body = (
      <BoardList board={lb.dayBoard} label={'Day ' + lb.day + ' leaderboard'} empty={'No one has handed in day ' + lb.day + ' yet.'}
        value={(r) => (
          <>
            <b>{r.score}</b>
            <span className="muted xs">{r.correct}/{r.total} · {fmtDuration(r.durationMs)}{r.lateDays > 0 ? ' · late' : ''}</span>
          </>
        )} />
    );
  } else if (tab === 'overall') {
    body = (
      <BoardList board={lb.overall} label="Overall leaderboard" empty="No homework handed in yet."
        value={(r) => <><b>{r.score}</b><span className="muted xs">{r.days} {r.days === 1 ? 'day' : 'days'}</span></>} />
    );
  } else {
    body = (
      <BoardList board={lb.streak} label="Streak leaderboard" empty="No streaks yet. Hand in homework on the day it opens to start one."
        value={(r) => (
          <>
            <b className="lbstreak"><Icon name="flame" size="sm" />{r.streak} {r.streak === 1 ? 'day' : 'days'}</b>
            <span className="muted xs">{r.score} pts</span>
          </>
        )} />
    );
  }

  const b = lb ? (tab === 'day' ? lb.dayBoard : tab === 'overall' ? lb.overall : lb.streak) : null;

  return (
    <section className="card lbcard" aria-labelledby="lb-title">
      <div className="rowb" style={{ flexWrap: 'wrap' }}>
        <h2 className="h2 lbtitle" id="lb-title" tabIndex={-1}><Icon name="trophy" />Leaderboard</h2>
        {b && <span className="muted sm">{b.count} of {lb!.members} {lb!.members === 1 ? 'learner' : 'learners'}</span>}
      </div>
      <div className="lbtools">
        <div className="seg lbtabs" role="tablist" aria-label="Leaderboard">
          {TABS.map((t) => (
            <button key={t.id} id={'lbt-' + t.id} role="tab" className={tab === t.id ? 'on' : ''} aria-selected={tab === t.id} aria-controls="lb-panel" onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
        {tab === 'day' && lb && (
          <div className="lbday">
            <label className="label" htmlFor="lb-day">Day</label>
            <select id="lb-day" className="input" value={shown} onChange={(e) => setDay(Number(e.target.value))}>
              {Array.from({ length: lb.maxDay }, (_, k) => k + 1).map((d) => <option key={d} value={d}>Day {d}</option>)}
            </select>
          </div>
        )}
      </div>
      <div id="lb-panel" role="tabpanel" aria-labelledby={'lbt-' + tab} aria-busy={loading}>{body}</div>
      {tab === 'day' && <span className="hint">Ranked by score, then by time taken. Late homework keeps part of its score.</span>}
      {tab === 'streak' && <span className="hint">Days in a row with homework handed in on the day it opened.</span>}
    </section>
  );
}
