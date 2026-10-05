import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type CourseSummary } from '../lib/api';
import { useWB } from '../state/WordbookContext';
import { EmptyState, Icon, PageHead } from '../components/ui';

export const WPD_CHOICES = [3, 4, 5, 6, 7, 8, 9, 10];

export function errText(e: unknown, fallback = 'Something went wrong.'): string {
  return e instanceof ApiError || e instanceof Error ? e.message || fallback : fallback;
}

/** Copies a join code to the clipboard (with a toast either way). */
export function useCopyCode() {
  const { a } = useWB();
  return async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      a.showToast('Join code ' + code + ' copied.');
    } catch {
      a.showToast('Couldn’t copy — the code is ' + code + '.', 'bad');
    }
  };
}

export const VisibilityBadge = ({ v }: { v: CourseSummary['visibility'] }) => (
  <span className={'badge ' + (v === 'public' ? 't-green' : 'pos')}>
    <Icon name={v === 'public' ? 'globe' : 'lock'} size="sm" />{v === 'public' ? 'Public' : 'Private'}
  </span>
);

/** The join code with a copy button (owners only). */
export function JoinCode({ code }: { code: string }) {
  const copy = useCopyCode();
  return (
    <div className="codebox">
      <span className="muted sm">Join code</span>
      <b className="code">{code}</b>
      <button className="iconbtn sm" onClick={() => copy(code)} aria-label={'Copy join code ' + code} title="Copy"><Icon name="copy" size="sm" /></button>
    </div>
  );
}

/** A local modal: backdrop + Escape close it. */
export function Dialog({ label, onClose, children, wide }: { label: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay">
      <button className="backdrop" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className={'modal' + (wide ? ' libmodal' : '')} role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>
  );
}

export function ConfirmDialog({ title, text, confirm, danger, busy, onConfirm, onClose }: {
  title: string; text: string; confirm: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Dialog label={title} onClose={onClose}>
      <h2>{title}</h2>
      <p>{text}</p>
      <div className="mfoot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')} onClick={onConfirm} disabled={busy} autoFocus>{busy ? 'Please wait…' : confirm}</button>
      </div>
    </Dialog>
  );
}

/** Private / Public picker. */
export function VisibilityPicker({ value, onChange }: { value: CourseSummary['visibility']; onChange: (v: CourseSummary['visibility']) => void }) {
  return (
    <div className="seg visseg" role="group" aria-label="Visibility">
      <button className={value === 'private' ? 'on' : ''} aria-pressed={value === 'private'} onClick={() => onChange('private')}><Icon name="lock" size="sm" />Private</button>
      <button className={value === 'public' ? 'on' : ''} aria-pressed={value === 'public'} onClick={() => onChange('public')}><Icon name="globe" size="sm" />Public</button>
    </div>
  );
}

export function WordsPerDayPicker({ value, onChange, id }: { value: number; onChange: (n: number) => void; id: string }) {
  return (
    <div className="chips" role="group" aria-labelledby={id}>
      {WPD_CHOICES.map((n) => (
        <button key={n} className={'chip' + (value === n ? ' on' : '')} aria-pressed={value === n} onClick={() => onChange(n)}>{n}</button>
      ))}
    </div>
  );
}

function CreateCourse({ onClose }: { onClose: () => void }) {
  const { a } = useWB();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [wpd, setWpd] = useState(5);
  const [visibility, setVisibility] = useState<CourseSummary['visibility']>('private');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (busy) return;
    if (!title.trim()) { setErr('Please give the course a title.'); return; }
    setBusy(true);
    try {
      const c = await api.createCourse({ title: title.trim(), description: description.trim(), wordsPerDay: wpd, visibility });
      a.showToast('Course “' + c.title + '” created. Now add words to each day.');
      a.openCourse(c.id, true);
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  };
  return (
    <Dialog label="New course" onClose={onClose}>
      <h2>New Course</h2>
      <div className="field">
        <label className="label" htmlFor="nc-title">Title <span className="req">*</span></label>
        <input id="nc-title" className={'input' + (err ? ' err' : '')} placeholder="e.g. 30 days of IT English" value={title} maxLength={120} autoFocus
          onChange={(e) => { setTitle(e.target.value); setErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void create(); } }} />
      </div>
      <div className="field">
        <label className="label" htmlFor="nc-desc">Description</label>
        <textarea id="nc-desc" className="input" style={{ minHeight: 70 }} placeholder="What will learners get from it?" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field">
        <span className="label" id="nc-wpd">Words per day</span>
        <WordsPerDayPicker id="nc-wpd" value={wpd} onChange={setWpd} />
      </div>
      <div className="field">
        <span className="label">Who can join</span>
        <VisibilityPicker value={visibility} onChange={setVisibility} />
        <span className="hint">{visibility === 'public' ? 'Anyone can find it in Explore. You can also share the join code.' : 'Only people with the join code can join.'}</span>
      </div>
      {err && <span className="errtxt"><Icon name="alert" size="sm" />{err}</span>}
      <div className="mfoot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create & add words'}</button>
      </div>
    </Dialog>
  );
}

function CourseCard({ c, onJoin }: { c: CourseSummary; onJoin?: () => void }) {
  const { a } = useWB();
  const e = c.enrollment;
  const pct = e ? Math.round((e.learned.length / c.totalDays) * 100) : 0;
  return (
    <div className="card ccard">
      <div className="rowb" style={{ alignItems: 'flex-start' }}>
        <span className="cat-ic t-indigo" style={{ width: 42, height: 42, borderRadius: 12 }}><Icon name="cap" /></span>
        {c.isOwner && <VisibilityBadge v={c.visibility} />}
      </div>
      <button className="wordlink ccard-title" onClick={() => a.openCourse(c.id)}>{c.title}</button>
      {c.description && <p className="muted sm ccard-desc">{c.description}</p>}
      <div className="cmeta">
        <span>by <b>{c.isOwner ? 'You' : c.ownerName}</b></span>
        <span><Icon name="layers" size="sm" />{c.readyDays}/{c.totalDays} days ready</span>
        <span><Icon name="users" size="sm" />{c.members} {c.members === 1 ? 'learner' : 'learners'}</span>
      </div>
      {e && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="sm" style={{ fontWeight: 700 }}>Day {Math.min(e.currentDay, c.totalDays)} of {c.totalDays} · {e.learned.length} learned</span>
          <span className="mini indigo" role="progressbar" aria-label="Days learned" aria-valuemin={0} aria-valuemax={c.totalDays} aria-valuenow={e.learned.length}><div style={{ width: pct + '%' }} /></span>
        </div>
      )}
      <div className="ccard-foot">
        {c.isOwner && <button className="btn btn-secondary btn-sm" onClick={() => a.openCourse(c.id, true)}><Icon name="edit" size="sm" />Edit</button>}
        {onJoin
          ? <button className="btn btn-primary btn-sm" onClick={onJoin}><Icon name="plus" size="sm" />Join</button>
          : <button className="btn btn-secondary btn-sm" onClick={() => a.openCourse(c.id)}>{e ? 'Continue' : 'Open'}<Icon name="right" size="sm" /></button>}
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="csec" aria-label={title}>
      <div className="rowb" style={{ marginBottom: 12 }}>
        <h2 className="h2">{title}</h2>
        {count !== undefined && count > 0 && <span className="muted sm">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function JoinWithCode() {
  const { a } = useWB();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const clean = code.trim().toUpperCase();
  const ok = /^[A-Z0-9]{6}$/.test(clean);
  const join = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const c = await api.joinCourseByCode(clean);
      a.showToast('Joined “' + c.title + '”. Day 1 starts today.');
      a.openCourse(c.id);
    } catch (e) {
      a.showToast(errText(e, 'Couldn’t join with that code.'), 'bad');
      setBusy(false);
    }
  };
  return (
    <div className="card joinbox">
      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
        <label className="label" htmlFor="join-code">Join with a code</label>
        <span className="hint">Got a 6-character code from a friend or teacher? Enter it here.</span>
      </div>
      <div className="joinrow">
        <input id="join-code" className="input codeinput" placeholder="ABC123" value={code} maxLength={6} autoComplete="off" spellCheck={false}
          onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void join(); } }} />
        <button className="btn btn-primary" onClick={join} disabled={!ok || busy}>{busy ? 'Joining…' : 'Join'}</button>
      </div>
    </div>
  );
}

export function Courses() {
  const { a } = useWB();
  const [lists, setLists] = useState<{ joined: CourseSummary[]; mine: CourseSummary[]; pub: CourseSummary[] } | null>(null);
  const [failed, setFailed] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setFailed('');
    try {
      const [joined, mine, pub] = await Promise.all([api.listCourses('joined'), api.listCourses('mine'), api.listCourses('public')]);
      setLists({ joined, mine, pub });
    } catch (e) {
      setFailed(errText(e, 'Couldn’t load courses.'));
    }
  };
  useEffect(() => { void load(); }, []);

  const join = async (c: CourseSummary) => {
    try {
      await api.joinCourse(c.id);
      a.showToast('Joined “' + c.title + '”. Day 1 starts today.');
      a.openCourse(c.id);
    } catch (e) {
      a.showToast(errText(e, 'Couldn’t join this course.'), 'bad');
    }
  };

  const head = (
    <PageHead title="Courses" sub="Learn a few words every day for 30 days — follow a course or plan one for others.">
      <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size="sm" />New Course</button>
    </PageHead>
  );

  let body: ReactNode;
  if (failed) {
    body = (
      <EmptyState icon="alert" tint="t-red" title="Can’t load courses" text={failed}>
        <button className="btn btn-primary" onClick={load}><Icon name="refresh" size="sm" />Try again</button>
      </EmptyState>
    );
  } else if (!lists) {
    body = (
      <div className="cgrid" aria-busy="true" aria-label="Loading courses">
        {[1, 2, 3].map((i) => <div key={i} className="sk" style={{ height: 220, borderRadius: 16 }} />)}
      </div>
    );
  } else {
    const taken = new Set([...lists.joined, ...lists.mine].map((c) => c.id));
    const explore = lists.pub.filter((c) => !taken.has(c.id) && !c.isOwner && !c.enrollment);
    const mine = lists.mine;
    if (!lists.joined.length && !mine.length && !explore.length) {
      body = (
        <EmptyState icon="cap" title="No courses yet" text="Create a course to plan 30 days of words, or join one with a code.">
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size="sm" />New Course</button>
        </EmptyState>
      );
    } else {
      body = (
        <>
          <Section title="Learning" count={lists.joined.length}>
            {lists.joined.length
              ? <div className="cgrid">{lists.joined.map((c) => <CourseCard key={c.id} c={c} />)}</div>
              : <p className="muted sm csec-empty">You’re not taking a course yet. Join one below or with a code.</p>}
          </Section>
          <Section title="My courses" count={mine.length}>
            {mine.length
              ? <div className="cgrid">{mine.map((c) => <CourseCard key={c.id} c={c} />)}</div>
              : <p className="muted sm csec-empty">Plan 30 days of words for yourself, your team or your class. <button className="linkbtn" onClick={() => setCreating(true)}>Create a course</button></p>}
          </Section>
          <Section title="Explore" count={explore.length}>
            {explore.length
              ? <div className="cgrid">{explore.map((c) => <CourseCard key={c.id} c={c} onJoin={() => join(c)} />)}</div>
              : <p className="muted sm csec-empty">No other public courses to explore right now.</p>}
          </Section>
        </>
      );
    }
  }

  return (
    <>
      {head}
      <JoinWithCode />
      {body}
      {creating && <CreateCourse onClose={() => setCreating(false)} />}
    </>
  );
}
