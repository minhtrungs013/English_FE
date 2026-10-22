import { useEffect, useState, type ReactNode } from 'react';
import { api, type AdminPlan, type AuditEntry, type AuditPage, type AdminCourse, type AdminLibraryWord, type AdminSentence, type AdminStats, type AdminUser, type Paged, type Tense, type Topic } from '../lib/api';
import { LEVELS, POS_LIST } from '../lib/data';
import { EmptyState, Icon, PageHead } from '../components/ui';
import { useWB } from '../state/WordbookContext';
import { ConfirmDialog, CreateCourse, errText } from './Courses';
import { TENSE_LABEL, TENSES } from './CourseQuestions';

type Tab = 'overview' | 'courses' | 'users' | 'plans' | 'sentences' | 'library' | 'audit';
const TABS: { id: Tab; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'courses', label: 'Courses', icon: 'cap' },
  { id: 'users', label: 'Users', icon: 'users' },
  { id: 'plans', label: 'Plans', icon: 'layers' },
  { id: 'sentences', label: 'Sentence bank', icon: 'layers' },
  { id: 'library', label: 'Library', icon: 'globe' },
  { id: 'audit', label: 'Audit log', icon: 'sparkle' }
];
const TAB_KEY = 'wordbook:adminTab';
const TOPICS: Topic[] = ['it', 'interview', 'customer', 'leader', 'toeic', 'other'];
const fmtDay = (t: number | null) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Search box + list + pager, shared by the paged tabs. */
function usePaged<T>(load: (q: string, page: number) => Promise<Paged<T>>, deps: unknown[] = []) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<T> | null>(null);
  const [err, setErr] = useState('');
  const reload = () => { setErr(''); load(q.trim(), page).then(setData).catch((e) => setErr(errText(e))); };
  useEffect(() => {
    const t = window.setTimeout(reload, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page, ...deps]);
  return { q, setQ: (v: string) => { setQ(v); setPage(1); }, page, setPage, data, setData, err, reload };
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="adm-pager">
      <span className="muted sm">{total.toLocaleString()} total</span>
      <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><Icon name="left" size="sm" /></button>
      <span className="sm">Page {page} of {pages}</span>
      <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><Icon name="right" size="sm" /></button>
    </div>
  );
}

function Search({ value, onChange, placeholder, children }: { value: string; onChange: (v: string) => void; placeholder: string; children?: ReactNode }) {
  return (
    <div className="adm-tools">
      <div className="adm-search">
        <span className="inicon"><Icon name="search" size="sm" /></span>
        <input className="input withicon" type="search" value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />
      </div>
      {children}
    </div>
  );
}

/* ---------- overview ---------- */

function Overview({ onTab }: { onTab: (t: Tab) => void }) {
  const [s, setS] = useState<AdminStats | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.adminStats().then(setS).catch((e) => setErr(errText(e))); }, []);
  if (err) return <EmptyState icon="alert" tint="t-red" title="Can’t load the numbers" text={err} />;
  const tile = (label: string, value: number | undefined, sub: string, tab?: Tab, warn = false) => (
    <button className={'adm-tile' + (warn && value ? ' warn' : '')} onClick={tab ? () => onTab(tab) : undefined} disabled={!tab}>
      <span className="adm-tval">{value === undefined ? <span className="sk" style={{ width: 60, height: 28, display: 'inline-block' }} /> : value.toLocaleString()}</span>
      <span className="adm-tlabel">{label}</span>
      <span className="muted xs">{sub}</span>
    </button>
  );
  return (
    <div className="adm-tiles">
      {tile('Users', s?.users, (s?.newUsers ?? 0) + ' new this week · ' + (s?.admins ?? 0) + ' admin', 'users')}
      {tile('Active today', s?.activeToday, 'reviewed at least one word')}
      {tile('Courses', s?.courses, (s?.enrollments ?? 0) + ' enrolments', 'courses')}
      {tile('Questions to review', s?.pendingQuestions, 'pending in course question banks', 'courses', true)}
      {tile('Library words', s?.libraryWords, 'shared with everyone', 'library')}
      {tile('Sentence bank', s?.bankSentences, 'checked example sentences', 'sentences')}
      {tile('Saved words', s?.savedWords, 'in all users’ vocabularies')}
    </div>
  );
}

/* ---------- courses ---------- */

function Courses() {
  const { a } = useWB();
  const [list, setList] = useState<AdminCourse[] | null>(null);
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => { api.adminCourses().then(setList).catch((e) => setErr(errText(e))); }, []);
  return (
    <>
      <div className="adm-tools">
        <span className="muted sm">Only admins can create and edit courses. Learners join them from the Courses page.</span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setCreating(true)}><Icon name="plus" size="sm" />New course</button>
      </div>
      {err ? <EmptyState icon="alert" tint="t-red" title="Can’t load courses" text={err} /> : !list ? <div className="sk" style={{ height: 200 }} /> : !list.length ? (
        <EmptyState icon="cap" title="No courses yet" text="Create the first one." />
      ) : (
        <div className="adm-table" role="table" aria-label="Courses">
          <div className="adm-row head" role="row">
            <span role="columnheader">Course</span><span role="columnheader">Days ready</span><span role="columnheader">Learners</span><span role="columnheader">To review</span><span role="columnheader">Created</span><span role="columnheader" />
          </div>
          {list.map((c) => (
            <div key={c.id} className="adm-row" role="row">
              <span role="cell" className="adm-main">
                <b>{c.title}</b>
                <span className="muted xs">{c.visibility === 'public' ? 'Public' : 'Private'} · code {c.joinCode} · by {c.ownerName || '—'}</span>
              </span>
              <span role="cell">{c.readyDays}/{c.totalDays}</span>
              <span role="cell">{c.members}</span>
              <span role="cell">{c.pending ? <span className="badge t-amber">{c.pending}</span> : '0'}</span>
              <span role="cell" className="muted sm">{fmtDay(c.createdAt)}</span>
              <span role="cell" className="adm-act">
                <button className="btn btn-secondary btn-sm" onClick={() => a.openCourse(c.id, true)}><Icon name="edit" size="sm" />Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => a.openCourse(c.id)}>Open</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {creating && <CreateCourse onClose={() => setCreating(false)} />}
    </>
  );
}

/* ---------- plans (daily limits) ---------- */

const PLAN_FIELDS: { key: 'chat' | 'autofill' | 'courseAi' | 'tokens'; label: string; hint: string }[] = [
  { key: 'chat', label: 'Chatbot messages', hint: 'a day; 0 turns the chatbot off' },
  { key: 'autofill', label: 'Auto-fills', hint: 'a day (new words only); 0 turns it off' },
  { key: 'courseAi', label: 'Course AI', hint: 'generations a day; 0 turns it off' },
  { key: 'tokens', label: 'AI tokens', hint: 'a day, all features together; 0 = no cap' }
];
type PlanForm = { name: string; chat: string; autofill: string; courseAi: string; tokens: string };
const toForm = (p?: AdminPlan): PlanForm => ({ name: p?.name ?? '', chat: String(p?.chat ?? 30), autofill: String(p?.autofill ?? 3), courseAi: String(p?.courseAi ?? 30), tokens: String(p?.tokens ?? 50000) });

function PlanEditor({ plan, onSaved, onCancel }: { plan?: AdminPlan; onSaved: (list: AdminPlan[]) => void; onCancel: () => void }) {
  const { a } = useWB();
  const [f, setF] = useState<PlanForm>(() => toForm(plan));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const nums = PLAN_FIELDS.map((x) => Number(f[x.key]));
    if (!f.name.trim()) { a.showToast('Please enter a plan name.', 'bad'); return; }
    if (nums.some((n) => !Number.isInteger(n) || n < 0)) { a.showToast('Limits must be whole numbers, 0 or more.', 'bad'); return; }
    const body = { name: f.name.trim(), chat: nums[0], autofill: nums[1], courseAi: nums[2], tokens: nums[3] };
    setBusy(true);
    try {
      onSaved(plan ? await api.adminPatchPlan(plan.id, body) : await api.adminCreatePlan(body));
      a.showToast(plan ? 'Plan saved.' : 'Plan created.');
    } catch (e) { a.showToast(errText(e), 'bad'); } finally { setBusy(false); }
  };
  return (
    <div className="adm-plan editing">
      <div className="adm-field wide">
        <label className="label" htmlFor={'pn-' + (plan?.id ?? 'new')}>Plan name</label>
        <input id={'pn-' + (plan?.id ?? 'new')} className="input" value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Pro" autoFocus />
      </div>
      <div className="adm-plan-grid">
        {PLAN_FIELDS.map((x) => (
          <div key={x.key} className="adm-field">
            <label className="label" htmlFor={'p-' + x.key + (plan?.id ?? 'new')}>{x.label}</label>
            <input id={'p-' + x.key + (plan?.id ?? 'new')} className="input" type="number" min={0} step={x.key === 'tokens' ? 1000 : 1} inputMode="numeric"
              value={f[x.key]} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} />
            <span className="muted xs">{x.hint}</span>
          </div>
        ))}
      </div>
      <div className="adm-plan-foot">
        <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? <span className="spin" /> : null}{plan ? 'Save' : 'Create plan'}</button>
      </div>
    </div>
  );
}

function Plans() {
  const { a } = useWB();
  const [list, setList] = useState<AdminPlan[] | null>(null);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const [del, setDel] = useState<AdminPlan | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.adminPlans().then(setList).catch((e) => setErr(errText(e))); }, []);
  const run = async (fn: () => Promise<AdminPlan[]>, ok: string) => {
    setBusy(true);
    try { setList(await fn()); a.showToast(ok); setDel(null); } catch (e) { a.showToast(errText(e), 'bad'); } finally { setBusy(false); }
  };
  const fmt = (n: number, unit: string, off: string) => (n === 0 ? off : n.toLocaleString() + ' ' + unit);
  if (err) return <EmptyState icon="alert" tint="t-red" title="Can’t load plans" text={err} />;
  if (!list) return <div className="sk" style={{ height: 200 }} />;
  return (
    <>
      <div className="adm-tools">
        <span className="muted sm">Each user is on one plan; users without one get the default plan. Limits reset at midnight. Changes apply within a minute.</span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setEdit('new')} disabled={edit === 'new'}><Icon name="plus" size="sm" />New plan</button>
      </div>
      <div className="adm-plans">
        {edit === 'new' && <PlanEditor onSaved={(l) => { setList(l); setEdit(null); }} onCancel={() => setEdit(null)} />}
        {list.map((p) => edit === p.id ? (
          <PlanEditor key={p.id} plan={p} onSaved={(l) => { setList(l); setEdit(null); }} onCancel={() => setEdit(null)} />
        ) : (
          <div key={p.id} className={'adm-plan' + (p.isDefault ? ' def' : '')}>
            <div className="adm-plan-head">
              <b className="adm-plan-name">{p.name}</b>
              {p.isDefault && <span className="badge t-indigo">Default</span>}
              <span className="muted sm" style={{ marginLeft: 'auto' }}>{p.users.toLocaleString()} user{p.users === 1 ? '' : 's'}</span>
            </div>
            <dl className="adm-plan-limits">
              <dt>Chatbot</dt><dd>{fmt(p.chat, 'messages', 'Off')}</dd>
              <dt>Auto-fill</dt><dd>{fmt(p.autofill, 'words', 'Off')}</dd>
              <dt>Course AI</dt><dd>{fmt(p.courseAi, 'times', 'Off')}</dd>
              <dt>AI tokens</dt><dd>{fmt(p.tokens, 'tokens', 'No cap')}</dd>
            </dl>
            <span className="muted xs">per user, per day</span>
            <div className="adm-plan-foot">
              {!p.isDefault && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.adminPatchPlan(p.id, { isDefault: true }), p.name + ' is now the default plan.')}>Make default</button>}
              {!p.isDefault && <button className="btn btn-ghost btn-sm adm-bad" disabled={busy} onClick={() => setDel(p)}>Delete</button>}
              <button className="btn btn-secondary btn-sm" onClick={() => setEdit(p.id)}><Icon name="edit" size="sm" />Edit</button>
            </div>
          </div>
        ))}
      </div>
      {del && (
        <ConfirmDialog title={'Delete ' + del.name + '?'} confirm="Delete plan" danger busy={busy}
          text={del.users ? del.users + ' user' + (del.users === 1 ? '' : 's') + ' on this plan will move to the default plan.' : 'No users are on this plan.'}
          onConfirm={() => run(() => api.adminDeletePlan(del.id), 'Plan deleted.')} onClose={() => setDel(null)} />
      )}
    </>
  );
}

/* ---------- users ---------- */

function Users() {
  const { s, a } = useWB();
  const p = usePaged<AdminUser>((q, page) => api.adminUsers(q, page));
  const [confirm, setConfirm] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  useEffect(() => { api.adminPlans().then(setPlans).catch(() => setPlans([])); }, []);
  const def = plans.find((x) => x.isDefault);
  const setPlan = async (u: AdminUser, plan: string) => {
    try {
      await api.adminSetUserPlan(u.id, plan);
      p.setData((d) => d && { ...d, items: d.items.map((x) => (x.id === u.id ? { ...x, plan } : x)) });
      a.showToast(u.name + ' is now on ' + (plans.find((x) => x.id === plan)?.name ?? def?.name ?? 'the default plan') + '.');
    } catch (e) { a.showToast(errText(e), 'bad'); }
  };
  const tokenCap = (u: AdminUser) => (plans.find((x) => x.id === u.plan) ?? def)?.tokens ?? 0;
  const setRole = async (u: AdminUser) => {
    setBusy(true);
    try {
      const role = u.role === 'admin' ? 'user' : 'admin';
      await api.adminSetRole(u.id, role);
      p.setData((d) => d && { ...d, items: d.items.map((x) => (x.id === u.id ? { ...x, role } : x)) });
      a.showToast(u.name + (role === 'admin' ? ' is now an admin.' : ' is no longer an admin.'));
      setConfirm(null);
    } catch (e) {
      a.showToast(errText(e), 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Search value={p.q} onChange={p.setQ} placeholder="Search by name or email" />
      {p.err ? <EmptyState icon="alert" tint="t-red" title="Can’t load users" text={p.err} /> : !p.data ? <div className="sk" style={{ height: 200 }} /> : (
        <>
          <div className="adm-table" role="table" aria-label="Users">
            <div className="adm-row head users" role="row">
              <span role="columnheader">User</span><span role="columnheader">Words</span><span role="columnheader">Courses</span><span role="columnheader">Joined</span>
              <span role="columnheader">Plan</span><span role="columnheader">AI tokens today</span><span role="columnheader">Role</span>
            </div>
            {p.data.items.map((u) => (
              <div key={u.id} className="adm-row users" role="row">
                <span role="cell" className="adm-main"><b>{u.name}</b><span className="muted xs">{u.email}</span></span>
                <span role="cell">{u.words}</span>
                <span role="cell">{u.courses}</span>
                <span role="cell" className="muted sm">{fmtDay(u.createdAt)}</span>
                <span role="cell">
                  <select className="input adm-sel" value={plans.some((x) => x.id === u.plan) ? u.plan : ''} onChange={(e) => setPlan(u, e.target.value)} aria-label={'Plan for ' + u.name}>
                    <option value="">{def ? def.name + ' (default)' : 'Default'}</option>
                    {plans.filter((x) => !x.isDefault).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </span>
                <span role="cell" className="sm">
                  {u.tokensToday.toLocaleString()}{tokenCap(u) ? <span className="muted"> / {tokenCap(u).toLocaleString()}</span> : null}
                  {tokenCap(u) > 0 && (
                    <span className="adm-meter" aria-hidden="true"><i className={u.tokensToday >= tokenCap(u) ? 'full' : ''} style={{ width: Math.min(100, (u.tokensToday / tokenCap(u)) * 100) + '%' }} /></span>
                  )}
                </span>
                <span role="cell" className="adm-act">
                  {u.role === 'admin' ? <span className="badge t-indigo">Admin</span> : <span className="muted sm">Learner</span>}
                  {u.id !== s.userId && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(u)}>{u.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>
                  )}
                </span>
              </div>
            ))}
          </div>
          <Pager page={p.page} pages={p.data.pages} total={p.data.total} onPage={p.setPage} />
        </>
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.role === 'admin' ? 'Remove admin role?' : 'Make admin?'}
          text={confirm.role === 'admin'
            ? confirm.name + ' will no longer be able to create or edit courses or use this page.'
            : confirm.name + ' (' + confirm.email + ') will be able to create and edit every course, manage users, the sentence bank and the library.'}
          confirm={confirm.role === 'admin' ? 'Remove admin' : 'Make admin'} danger={confirm.role === 'admin'} busy={busy}
          onConfirm={() => setRole(confirm)} onClose={() => setConfirm(null)} />
      )}
    </>
  );
}

/* ---------- audit log (AI calls) ---------- */

const AUDIT_ACTIONS: { id: string; label: string }[] = [
  { id: 'chat', label: 'Chatbot' },
  { id: 'lookup', label: 'Auto-fill' },
  { id: 'lookup-family', label: 'Word family' },
  { id: 'tense-questions', label: 'Tense questions' },
  { id: 'dialogue', label: 'Listening dialogue' }
];
const actionLabel = (a: string) => AUDIT_ACTIONS.find((x) => x.id === a)?.label ?? a;
const fmtTime = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtNum = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 10_000 ? Math.round(n / 1000) + 'k' : n.toLocaleString());

function AuditLog() {
  const [action, setAction] = useState('');
  const [status, setStatus] = useState('');
  const [days, setDays] = useState(7);
  const [open, setOpen] = useState<string | null>(null);
  const [summary, setSummary] = useState<AuditPage['summary'] | null>(null);
  const p = usePaged<AuditEntry>(async (q, page) => {
    const r = await api.adminAudit({ q, action, status, days, page });
    setSummary(r.summary);
    return r;
  }, [action, status, days]);
  const s = summary;
  const tile = (label: string, value: string | undefined, sub: string, warn = false) => (
    <div className={'adm-tile' + (warn ? ' warn' : '')}>
      <span className="adm-tval">{value ?? <span className="sk" style={{ width: 60, height: 28, display: 'inline-block' }} />}</span>
      <span className="adm-tlabel">{label}</span>
      <span className="muted xs">{sub}</span>
    </div>
  );
  return (
    <>
      <Search value={p.q} onChange={p.setQ} placeholder="Search email, word or API">
        <select className="input" style={{ width: 'auto' }} value={action} onChange={(e) => { setAction(e.target.value); p.setPage(1); }} aria-label="Feature">
          <option value="">All features</option>
          {AUDIT_ACTIONS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => { setStatus(e.target.value); p.setPage(1); }} aria-label="Result">
          <option value="">All results</option>
          <option value="ok">Succeeded</option>
          <option value="failed">Failed</option>
        </select>
        <div className="seg" role="group" aria-label="Period">
          {[1, 7, 30, 90].map((d) => <button key={d} className={days === d ? 'on' : ''} aria-pressed={days === d} onClick={() => { setDays(d); p.setPage(1); }}>{d === 1 ? '24h' : d + 'd'}</button>)}
        </div>
      </Search>
      <div className="adm-tiles">
        {tile('AI calls', s ? fmtNum(s.calls) : undefined, s ? s.users + ' user' + (s.users === 1 ? '' : 's') : '…')}
        {tile('Failed', s ? fmtNum(s.failed) : undefined, s && s.calls ? Math.round((s.failed / s.calls) * 100) + '% of calls' : 'no calls', !!s?.failed)}
        {tile('Tokens', s ? fmtNum(s.inTokens + s.outTokens) : undefined, s ? fmtNum(s.inTokens) + ' in · ' + fmtNum(s.outTokens) + ' out' : '…')}
        {tile('Average time', s ? (s.avgMs / 1000).toFixed(1) + 's' : undefined, 'per call')}
      </div>
      {s && s.byAction.length > 0 && (
        <div className="adm-chips" aria-label="Calls per feature">
          {s.byAction.map((b) => (
            <button key={b.action} className={'chip' + (action === b.action ? ' on' : '')} aria-pressed={action === b.action}
              onClick={() => { setAction(action === b.action ? '' : b.action); p.setPage(1); }}>
              {actionLabel(b.action)} <b>{b.calls}</b>{b.failed ? <span className="adm-bad"> · {b.failed} failed</span> : null}
            </button>
          ))}
        </div>
      )}
      {p.err ? <EmptyState icon="alert" tint="t-red" title="Can’t load the audit log" text={p.err} /> : !p.data ? <div className="sk" style={{ height: 200 }} /> : !p.data.items.length ? (
        <EmptyState icon="sparkle" tint="t-indigo" title="No AI calls" text="Nothing matches these filters in this period." />
      ) : (
        <>
          <div className="adm-table" role="table" aria-label="AI calls">
            <div className="adm-row head audit" role="row">
              <span role="columnheader">Time</span><span role="columnheader">User</span><span role="columnheader">Feature</span>
              <span role="columnheader">Result</span><span role="columnheader">Tokens</span><span role="columnheader">Time taken</span>
            </div>
            {p.data.items.map((e) => (
              <div key={e.id} className={'adm-row audit' + (open === e.id ? ' open' : '')} role="row">
                <span role="cell" className="muted sm">{fmtTime(e.at)}</span>
                <span role="cell" className="adm-main"><b>{e.email || 'System'}</b>{e.detail ? <span className="muted xs adm-ell" title={e.detail}>{e.detail}</span> : null}</span>
                <span role="cell">{actionLabel(e.action)}</span>
                <span role="cell">{e.ok ? <span className="badge t-green">OK</span> : <span className="badge t-red">{e.status ? 'Error ' + e.status : 'No answer'}</span>}</span>
                <span role="cell" className="sm">{e.inTokens || e.outTokens ? fmtNum(e.inTokens) + ' / ' + fmtNum(e.outTokens) : '—'}</span>
                <span role="cell" className="adm-act">
                  <span className="sm">{(e.ms / 1000).toFixed(1)}s</span>
                  <button className="btn btn-ghost btn-sm" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? 'Hide' : 'Details'}</button>
                </span>
                {open === e.id && (
                  <dl className="adm-detail" role="cell">
                    <dt>API</dt><dd>{e.route || '—'}</dd>
                    <dt>Model</dt><dd>{e.model || '—'}</dd>
                    <dt>Tokens</dt><dd>{e.inTokens.toLocaleString()} in · {e.outTokens.toLocaleString()} out</dd>
                    {e.detail && <><dt>Input</dt><dd>{e.detail}</dd></>}
                    {e.error && <><dt>Error</dt><dd className="adm-bad">{e.error}</dd></>}
                  </dl>
                )}
              </div>
            ))}
          </div>
          <Pager page={p.page} pages={p.data.pages} total={p.data.total} onPage={p.setPage} />
        </>
      )}
    </>
  );
}

/* ---------- sentence bank ---------- */

function SentenceRow({ s, onSaved, onDeleted }: { s: AdminSentence; onSaved: (x: AdminSentence) => void; onDeleted: () => void }) {
  const { a } = useWB();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ sentence: s.sentence, verb: s.verb, base: s.base, tense: s.tense });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { onSaved(await api.adminPatchSentence(s.id, f)); setEdit(false); a.showToast('Saved.'); } catch (e) { a.showToast(errText(e), 'bad'); } finally { setBusy(false); }
  };
  const del = async () => {
    setBusy(true);
    try { await api.adminDeleteSentence(s.id); onDeleted(); a.showToast('Sentence deleted.'); } catch (e) { a.showToast(errText(e), 'bad'); } finally { setBusy(false); }
  };
  const at = s.verb ? s.sentence.indexOf(s.verb) : -1;
  return (
    <li className="adm-sent">
      <div className="badges">
        <b>{s.word}</b>
        {s.tense ? <span className="badge t-blue">{TENSE_LABEL[s.tense]}</span> : <span className="badge pos">No tense lesson</span>}
        <span className="badge pos">{s.context}</span>
        {s.level && <span className={'badge lv-' + s.level}>{s.level}</span>}
      </div>
      {edit ? (
        <div className="adm-form">
          <textarea className="input" rows={2} value={f.sentence} aria-label="Sentence" onChange={(e) => setF({ ...f, sentence: e.target.value })} />
          <div className="adm-form-row">
            <input className="input" value={f.verb} aria-label="Verb phrase (as in the sentence)" placeholder="Verb phrase" onChange={(e) => setF({ ...f, verb: e.target.value })} />
            <input className="input" value={f.base} aria-label="Base verb" placeholder="Base verb" onChange={(e) => setF({ ...f, base: e.target.value })} />
            <select className="input" value={f.tense} aria-label="Tense" onChange={(e) => setF({ ...f, tense: e.target.value as Tense | '' })}>
              <option value="">No tense lesson</option>
              {TENSES.map((t) => <option key={t} value={t}>{TENSE_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="adm-act">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}><Icon name="check" size="sm" />Save</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEdit(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="adm-sent-body">
          <span className="sm">{at < 0 ? s.sentence : <>{s.sentence.slice(0, at)}<mark className="sbk-verb">{s.verb}</mark>{s.sentence.slice(at + s.verb.length)}</>}</span>
          <span className="adm-act">
            <button className="iconbtn sm" onClick={() => setEdit(true)} aria-label={'Edit: ' + s.sentence} title="Edit"><Icon name="edit" size="sm" /></button>
            <button className="iconbtn sm danger" onClick={del} disabled={busy} aria-label={'Delete: ' + s.sentence} title="Delete"><Icon name="trash" size="sm" /></button>
          </span>
        </div>
      )}
    </li>
  );
}

function Sentences() {
  const [tense, setTense] = useState('');
  const p = usePaged<AdminSentence>((q, page) => api.adminSentences(q, tense, page), [tense]);
  return (
    <>
      <Search value={p.q} onChange={p.setQ} placeholder="Search a word or part of a sentence">
        <select className="input adm-select" value={tense} aria-label="Tense" onChange={(e) => { setTense(e.target.value); p.setPage(1); }}>
          <option value="">All tenses</option>
          {TENSES.map((t) => <option key={t} value={t}>{TENSE_LABEL[t]}</option>)}
          <option value="none">No tense lesson</option>
        </select>
      </Search>
      {p.err ? <EmptyState icon="alert" tint="t-red" title="Can’t load sentences" text={p.err} /> : !p.data ? <div className="sk" style={{ height: 200 }} /> : (
        <>
          <ul className="adm-sents">
            {p.data.items.map((s) => (
              <SentenceRow key={s.id} s={s}
                onSaved={(x) => p.setData((d) => d && { ...d, items: d.items.map((y) => (y.id === x.id ? x : y)) })}
                onDeleted={() => p.setData((d) => d && { ...d, total: d.total - 1, items: d.items.filter((y) => y.id !== s.id) })} />
            ))}
          </ul>
          <Pager page={p.page} pages={p.data.pages} total={p.data.total} onPage={p.setPage} />
        </>
      )}
    </>
  );
}

/* ---------- library ---------- */

function LibraryRow({ w, onSaved, onDelete }: { w: AdminLibraryWord; onSaved: (x: AdminLibraryWord) => void; onDelete: () => void }) {
  const { a } = useWB();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(w);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const { id: _id, authorName: _a, saves: _s, ...patch } = f;
      onSaved(await api.adminPatchLibrary(w.id, patch));
      setEdit(false);
      a.showToast('Saved “' + f.word + '”.');
    } catch (e) { a.showToast(errText(e), 'bad'); } finally { setBusy(false); }
  };
  if (!edit) {
    return (
      <div className="adm-row lib" role="row">
        <span role="cell" className="adm-main"><b>{w.word}</b><span className="muted xs">{w.ipa} · {w.pos}</span></span>
        <span role="cell" className="sm" lang="vi">{w.vi}</span>
        <span role="cell"><span className={'badge lv-' + w.level}>{w.level}</span></span>
        <span role="cell" className="muted sm">{w.topic}</span>
        <span role="cell" className="muted sm">{w.saves}</span>
        <span role="cell" className="adm-act">
          <button className="iconbtn sm" onClick={() => setEdit(true)} aria-label={'Edit ' + w.word} title="Edit"><Icon name="edit" size="sm" /></button>
          <button className="iconbtn sm danger" onClick={onDelete} aria-label={'Delete ' + w.word} title="Delete"><Icon name="trash" size="sm" /></button>
        </span>
      </div>
    );
  }
  const field = (k: 'word' | 'ipa' | 'meaning' | 'vi' | 'ex', label: string, wide = false) => (
    <label className={'adm-field' + (wide ? ' wide' : '')}><span className="label">{label}</span>
      <input className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <div className="adm-row lib editing" role="row">
      <div className="adm-form" role="cell">
        <div className="adm-form-row">
          {field('word', 'Word')}{field('ipa', 'IPA')}
          <label className="adm-field"><span className="label">Part of speech</span>
            <select className="input" value={f.pos} onChange={(e) => setF({ ...f, pos: e.target.value })}>{POS_LIST.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="adm-field"><span className="label">Level</span>
            <select className="input" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as AdminLibraryWord['level'] })}>{LEVELS.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="adm-field"><span className="label">Topic</span>
            <select className="input" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value as Topic })}>{TOPICS.map((x) => <option key={x}>{x}</option>)}</select></label>
        </div>
        {field('vi', 'Vietnamese', true)}{field('meaning', 'Meaning', true)}{field('ex', 'Example', true)}
        <div className="adm-act">
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}><Icon name="check" size="sm" />Save</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setF(w); setEdit(false); }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Library() {
  const { a } = useWB();
  const p = usePaged<AdminLibraryWord>((q, page) => api.adminLibrary(q, page));
  const [del, setDel] = useState<AdminLibraryWord | null>(null);
  const [busy, setBusy] = useState(false);
  const remove = async (w: AdminLibraryWord) => {
    setBusy(true);
    try {
      await api.adminDeleteLibrary(w.id);
      p.setData((d) => d && { ...d, total: d.total - 1, items: d.items.filter((x) => x.id !== w.id) });
      a.showToast('Deleted “' + w.word + '” from the library.');
      setDel(null);
    } catch (e) { a.showToast(errText(e), 'bad'); } finally { setBusy(false); }
  };
  return (
    <>
      <Search value={p.q} onChange={p.setQ} placeholder="Search a word or a Vietnamese meaning" />
      {p.err ? <EmptyState icon="alert" tint="t-red" title="Can’t load the library" text={p.err} /> : !p.data ? <div className="sk" style={{ height: 200 }} /> : (
        <>
          <div className="adm-table" role="table" aria-label="Library words">
            <div className="adm-row head lib" role="row">
              <span role="columnheader">Word</span><span role="columnheader">Vietnamese</span><span role="columnheader">Level</span><span role="columnheader">Topic</span><span role="columnheader">Saves</span><span role="columnheader" />
            </div>
            {p.data.items.map((w) => (
              <LibraryRow key={w.id} w={w} onDelete={() => setDel(w)}
                onSaved={(x) => p.setData((d) => d && { ...d, items: d.items.map((y) => (y.id === x.id ? x : y)) })} />
            ))}
          </div>
          <Pager page={p.page} pages={p.data.pages} total={p.data.total} onPage={p.setPage} />
        </>
      )}
      {del && (
        <ConfirmDialog title={'Delete “' + del.word + '”?'} danger busy={busy} confirm="Delete"
          text="It disappears from the library and its sentences leave the sentence bank. Words people already saved stay in their vocabulary."
          onConfirm={() => remove(del)} onClose={() => setDel(null)} />
      )}
    </>
  );
}

/** Admin: numbers, courses (create and edit), users and roles, the sentence bank and the library. */
export function AdminPage() {
  const [tab, setTabState] = useState<Tab>(() => {
    try { const t = localStorage.getItem(TAB_KEY) as Tab | null; return t && TABS.some((x) => x.id === t) ? t : 'overview'; } catch { return 'overview'; }
  });
  const setTab = (t: Tab) => { setTabState(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* storage blocked */ } };
  return (
    <>
      <PageHead title="Admin" sub="Courses, users, the sentence bank and the library." />
      <div className="adm-tabs" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={'adm-tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size="sm" />{t.label}
          </button>
        ))}
      </div>
      <div className="adm-panel" role="tabpanel">
        {tab === 'overview' && <Overview onTab={setTab} />}
        {tab === 'courses' && <Courses />}
        {tab === 'users' && <Users />}
        {tab === 'plans' && <Plans />}
        {tab === 'sentences' && <Sentences />}
        {tab === 'library' && <Library />}
        {tab === 'audit' && <AuditLog />}
      </div>
    </>
  );
}
