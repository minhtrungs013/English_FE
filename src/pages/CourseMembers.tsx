import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type CourseDetail, type CourseMember, type CourseMemberDetail, type CourseMembers as Members, type MemberDay } from '../lib/api';
import { useWB } from '../state/WordbookContext';
import { Icon } from '../components/ui';
import { ConfirmDialog, Dialog, JoinCode, errText, fmtDate } from './Courses';
import { fmtDuration, penaltyFor } from './CourseHomework';

type Sort = 'active' | 'name' | 'progress' | 'score';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'active', label: 'Last active' }, { id: 'name', label: 'Name' }, { id: 'progress', label: 'Progress' }, { id: 'score', label: 'Score' }
];
const ACTIVE_MS = 2 * 86_400_000;

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

/** "just now" · "5 min ago" · "2 h ago" · "3 d ago" · then the date. */
export function ago(ms: number | null, now = Date.now()): string {
  if (!ms) return '—';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 7 * 86400) return Math.floor(s / 86400) + ' d ago';
  return fmtMs(ms);
}
const fmtMs = (ms: number | null) =>
  ms ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms) : '—';

function sortMembers(list: CourseMember[], sort: Sort): CourseMember[] {
  const out = [...list];
  if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'progress') out.sort((a, b) => b.learned - a.learned || b.homework - a.homework || b.currentDay - a.currentDay);
  else if (sort === 'score') out.sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1) || b.totalScore - a.totalScore);
  else out.sort((a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0));
  return out;
}

/** The owner's view of who's taking the course: a summary, a searchable table, and each learner's day-by-day detail. */
export function CourseMembers({ c }: { c: CourseDetail }) {
  const [data, setData] = useState<Members | null>(null);
  const [failed, setFailed] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('active');
  const [openId, setOpenId] = useState<string | null>(null);
  /** The row button that opened the detail, to return focus to. */
  const opener = useRef<HTMLElement | null>(null);

  const load = async () => {
    setLoading(true);
    setFailed('');
    try { setData(await api.listMembers(c.id)); } catch (e) { setFailed(errText(e, 'Couldn’t load the members.')); }
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [c.id]);

  const openMember = (id: string, el: HTMLElement) => { opener.current = el; setOpenId(id); };
  const closeMember = () => {
    setOpenId(null);
    const el = opener.current;
    window.setTimeout(() => (el && document.contains(el) ? el.focus() : document.getElementById('cm-title')?.focus()), 0);
  };
  const removed = () => { setOpenId(null); opener.current = null; void load().then(() => document.getElementById('cm-title')?.focus()); };

  let body: ReactNode;
  let status = '';
  if (failed) {
    body = (
      <div className="rowb csec-empty" style={{ flexWrap: 'wrap' }}>
        <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{failed}</span>
        <button className="btn btn-secondary btn-sm" onClick={load}><Icon name="refresh" size="sm" />Try again</button>
      </div>
    );
  } else if (!data) {
    status = 'Loading members…';
    body = <div className="sk" style={{ height: 220, borderRadius: 12 }} aria-hidden="true" />;
  } else if (!data.members.length) {
    status = 'No one has joined yet.';
    body = (
      <div className="csec-empty mempty">
        <span className="tsoon-ic" aria-hidden="true"><Icon name="users" /></span>
        <div className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
          <b>No one has joined yet</b>
          <span className="muted sm">
            {c.joinCode ? 'Share the join code — learners enter it on the Courses page.' : 'Learners will appear here once they join.'}
            {c.visibility === 'public' ? ' Your course is public, so people can also find it in the course list.' : ''}
          </span>
        </div>
        {c.joinCode && <JoinCode code={c.joinCode} />}
      </div>
    );
  } else {
    const all = data.members;
    const now = Date.now();
    const scored = all.filter((m) => m.avgScore !== null);
    const avg = scored.length ? Math.round(scored.reduce((s, m) => s + m.avgScore!, 0) / scored.length) : null;
    const active = all.filter((m) => m.lastActive && now - m.lastActive <= ACTIVE_MS).length;
    const needle = q.trim().toLowerCase();
    const rows = sortMembers(all.filter((m) => !needle || m.name.toLowerCase().includes(needle)), sort);
    status = loading ? 'Updating…' : needle ? plural(rows.length, 'learner') + ' match “' + q.trim() + '”.' : plural(all.length, 'learner') + '.';

    body = (
      <>
        <div className="msum" role="group" aria-label="Summary">
          <div className="msum-i"><b>{all.length}</b><span className="muted sm">{all.length === 1 ? 'learner' : 'learners'}</span></div>
          <div className="msum-i"><b>{avg ?? '—'}</b><span className="muted sm">average score</span></div>
          <div className="msum-i"><b>{active}</b><span className="muted sm">active in the last 2 days</span></div>
          <div className="msum-i"><b>{data.daysWithWords}/{data.totalDays}</b><span className="muted sm">days with words</span></div>
        </div>

        <div className="mtools">
          <div className="msearch">
            <Icon name="search" size="sm" />
            <label className="c-sr" htmlFor="cm-q">Search learners by name</label>
            <input id="cm-q" className="input" type="search" placeholder="Search by name…" value={q} onChange={(ev) => setQ(ev.target.value)} autoComplete="off" />
          </div>
          <div className="msort">
            <label className="label" htmlFor="cm-sort">Sort by</label>
            <select id="cm-sort" className="input" value={sort} onChange={(ev) => setSort(ev.target.value as Sort)}>
              {SORTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
        </div>

        {rows.length ? (
          <div className="mwrap">
            <table className="mtbl">
              <caption className="c-sr">Learners in {c.title}, sorted by {SORTS.find((x) => x.id === sort)!.label.toLowerCase()}. Choose a name for details.</caption>
              <thead>
                <tr>
                  <th scope="col">Learner</th>
                  <th scope="col">Day</th>
                  <th scope="col">Learned</th>
                  <th scope="col"><span aria-hidden="true">🎧 </span>Listened</th>
                  <th scope="col">Homework</th>
                  <th scope="col">Avg score</th>
                  <th scope="col">Streak</th>
                  <th scope="col">Last active</th>
                  <th scope="col">Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.userId} className={openId === m.userId ? 'on' : undefined}
                    onClick={(ev) => { if (!(ev.target as HTMLElement).closest('button')) openMember(m.userId, ev.currentTarget.querySelector('button')!); }}>
                    <th scope="row" data-label="Learner">
                      <button className="mname" onClick={(ev) => openMember(m.userId, ev.currentTarget)} aria-haspopup="dialog">
                        <span className="avatar sm" aria-hidden="true">{m.name.charAt(0).toUpperCase() || '?'}</span>
                        <span className="mname-t">{m.name}</span>
                        {m.isOwner && <span className="badge t-indigo">You</span>}
                      </button>
                    </th>
                    <td data-label="Day">{m.currentDay < 1 ? 'Not started' : m.currentDay + '/' + data.totalDays}</td>
                    <td data-label="Learned">{m.learned}</td>
                    <td data-label="Listened">{m.listened}</td>
                    <td data-label="Homework">
                      <span className="mhw">
                        {m.homework}
                        {m.missing >= 2 && <span className="badge t-amber"><Icon name="alert" size="sm" />{m.missing} missing</span>}
                        {m.missing === 1 && <span className="muted xs">1 missing</span>}
                      </span>
                    </td>
                    <td data-label="Avg score"><b className="mnum">{m.avgScore ?? '—'}</b></td>
                    <td data-label="Streak">{m.streak > 0 ? <span className="mstreak"><Icon name="flame" size="sm" />{m.streak}</span> : <span className="muted">0</span>}</td>
                    <td data-label="Last active">
                      <span title={m.lastActive ? new Date(m.lastActive).toLocaleString() : undefined}>{ago(m.lastActive, now)}</span>
                    </td>
                    <td data-label="Joined">{fmtMs(m.joinedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted sm csec-empty">No learner’s name matches “{q.trim()}”.</p>
        )}
      </>
    );
  }

  return (
    <section className="card mcard" aria-labelledby="cm-title" aria-busy={loading}>
      <div className="rowb" style={{ flexWrap: 'wrap' }}>
        <h2 className="h2 lbtitle" id="cm-title" tabIndex={-1}><Icon name="users" />Members</h2>
        {data && data.members.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}><Icon name="refresh" size="sm" />{loading ? 'Refreshing…' : 'Refresh'}</button>
        )}
      </div>
      {body}
      <div className="c-sr" aria-live="polite" aria-atomic="true">{status}</div>
      {openId && data && (
        <MemberDetail c={c} userId={openId} totalDays={data.totalDays} onClose={closeMember} onRemoved={removed} />
      )}
    </section>
  );
}

/** One day of a learner's progress. */
function DayRow({ d, today }: { d: MemberDay; today: boolean }) {
  const hw = d.homework;
  let homework: ReactNode;
  if (!d.open) homework = null;
  else if (!hw) homework = <span className="muted">—</span>;
  else if ('opened' in hw) homework = <span className="badge t-amber">opened, not handed in</span>;
  else {
    homework = (
      <span className="mdhw">
        <b className="mnum">{hw.score}</b><span className="muted xs">/ 100 · {hw.correct}/{hw.total} · {fmtDuration(hw.durationMs)}</span>
        {hw.lateDays > 0 && <span className="badge t-amber">{plural(hw.lateDays, 'day')} late · kept {penaltyFor(hw.lateDays)}%</span>}
      </span>
    );
  }
  const mark = (on: boolean, label: string, extra?: string) => (
    <span className={'mdmark' + (on ? ' on' : '')}>
      {on ? <Icon name="check" size="sm" /> : <span aria-hidden="true">·</span>}
      {label}{extra ? ' ' + extra : ''}
      <span className="c-sr">{on ? ' done' : ' not done'}</span>
    </span>
  );
  const score = (r: { correct: number; total: number } | null) => (r ? r.correct + '/' + r.total : undefined);

  return (
    <li className={'mday' + (d.open ? '' : ' locked') + (today ? ' today' : '')} aria-current={today ? 'date' : undefined}>
      <div className="mday-h">
        <b>Day {d.day}</b>
        <span className="muted xs">{fmtDate(d.date)}{today ? ' · today' : ''}</span>
      </div>
      {!d.open ? (
        <span className="mdlock muted sm"><Icon name="lock" size="sm" />Not open yet</span>
      ) : !d.words ? (
        <span className="muted sm">No words this day</span>
      ) : (
        <div className="mday-b">
          <span className="mdmarks">
            {d.day >= 2 && mark(!!d.warmedUpAt, 'Review', score(d.warmup))}
            {mark(!!d.learnedAt, 'Learn')}
            {mark(!!d.listenedAt, 'Listening', score(d.listening))}
          </span>
          <span className="mdhw-w"><span className="muted xs">Homework</span>{homework}</span>
        </div>
      )}
    </li>
  );
}

function MemberDetail({ c, userId, totalDays, onClose, onRemoved }: {
  c: CourseDetail; userId: string; totalDays: number; onClose: () => void; onRemoved: () => void;
}) {
  const { a } = useWB();
  const [m, setM] = useState<CourseMemberDetail | null>(null);
  const [failed, setFailed] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const head = useRef<HTMLHeadingElement>(null);
  const removeBtn = useRef<HTMLButtonElement>(null);

  const load = async () => {
    setFailed('');
    try { setM(await api.getMember(c.id, userId)); } catch (e) { setFailed(errText(e, 'Couldn’t load this learner.')); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [userId]);
  const loaded = !!m;
  // Focus the name once it's there (the dialog opens on "Loading…").
  useEffect(() => { head.current?.focus(); }, [loaded]);

  const remove = async () => {
    if (!m) return;
    setBusy(true);
    try {
      await api.removeMember(c.id, m.userId);
      a.showToast(m.name + ' was removed from “' + c.title + '”.');
      setAsking(false);
      onRemoved();
    } catch (e) {
      a.showToast(errText(e, 'Couldn’t remove this learner.'), 'bad');
      setBusy(false);
    }
  };

  let body: ReactNode;
  if (failed) {
    body = (
      <div className="rowb" style={{ flexWrap: 'wrap' }}>
        <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{failed}</span>
        <button className="btn btn-secondary btn-sm" onClick={load}><Icon name="refresh" size="sm" />Try again</button>
      </div>
    );
  } else if (!m) {
    body = <div className="sk" style={{ height: 260, borderRadius: 12 }} aria-busy="true" aria-label="Loading" />;
  } else {
    const open = m.days.filter((d) => d.open && d.words);
    const handed = open.filter((d) => d.homework && 'score' in d.homework);
    const scores = handed.map((d) => (d.homework as { score: number }).score);
    const late = handed.filter((d) => (d.homework as { lateDays: number }).lateDays > 0).length;
    const avg = scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null;
    body = (
      <>
        <div className="msum sm4" role="group" aria-label="Progress">
          <div className="msum-i"><b>{m.days.filter((d) => d.learnedAt).length}</b><span className="muted sm">days learned</span></div>
          <div className="msum-i"><b>{m.days.filter((d) => d.listenedAt).length}</b><span className="muted sm">🎧 listened</span></div>
          <div className="msum-i"><b>{handed.length}/{open.length}</b><span className="muted sm">homework{late ? ' · ' + late + ' late' : ''}</span></div>
          <div className="msum-i"><b>{avg ?? '—'}</b><span className="muted sm">average score</span></div>
        </div>
        <ol className="mdays" aria-label="Day by day">
          {m.days.map((d) => <DayRow key={d.day} d={d} today={d.day === m.currentDay} />)}
        </ol>
        {!m.isOwner && (
          <div className="mremove">
            <span className="muted sm">Removing {m.name} deletes their progress and homework in this course.</span>
            <button ref={removeBtn} className="btn btn-danger-soft btn-sm" onClick={() => setAsking(true)}><Icon name="trash" size="sm" />Remove from course</button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
    <Dialog label={m ? m.name + ' — progress' : 'Learner progress'} className="mpanel" onClose={() => { if (!asking) onClose(); }}>
      <div className="mpanel-h">
        <span className="avatar" aria-hidden="true">{(m?.name.charAt(0) || '?').toUpperCase()}</span>
        <div className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
          <h2 ref={head} tabIndex={-1} className="mpanel-t">{m ? m.name : 'Loading…'}{m?.isOwner && <span className="badge t-indigo">You</span>}</h2>
          {m && (
            <span className="muted sm">
              {m.currentDay < 1 ? 'Not started yet' : 'Day ' + m.currentDay + ' / ' + totalDays}
              {' · joined ' + fmtMs(m.joinedAt)}
              {m.startDay ? ' · day 1 was ' + fmtDate(m.startDay) : ''}
            </span>
          )}
        </div>
        <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      </div>
      <div className="mpanel-b">{body}</div>
    </Dialog>
      {asking && m && (
        <ConfirmDialog title={'Remove ' + m.name + ' from the course?'}
          text={'They’ll leave “' + c.title + '” and their progress and handed-in homework here will be deleted (scores drop off the leaderboard). Words they saved stay in their vocabulary. They can join again with the join code.'}
          confirm="Remove" danger busy={busy} onConfirm={remove}
          onClose={() => { setAsking(false); window.setTimeout(() => removeBtn.current?.focus(), 0); }} />
      )}
    </>
  );
}
