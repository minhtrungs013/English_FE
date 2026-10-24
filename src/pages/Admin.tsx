import { useEffect, useState, type ReactNode } from 'react';
import { api, type AdminInsights, type AdminSuggestion, type AdminPlan, type AuditEntry, type AuditPage, type AdminCourse, type AdminLibraryWord, type AdminSentence, type AdminStats, type AdminUser, type Paged, type Tense, type Topic } from '../lib/api';
import { LEVELS, POS_LIST } from '../lib/data';
import { EmptyState, Icon, PageHead } from '../components/ui';
import { useWB } from '../state/WordbookContext';
import { ConfirmDialog, CreateCourse, Dialog, errText } from './Courses';
import { TENSE_LABEL, TENSES } from './CourseQuestions';

type Tab = 'overview' | 'courses' | 'users' | 'plans' | 'sentences' | 'library' | 'insights' | 'audit';
const TABS: { id: Tab; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'courses', label: 'Courses', icon: 'cap' },
  { id: 'users', label: 'Users', icon: 'users' },
  { id: 'plans', label: 'Plans', icon: 'layers' },
  { id: 'sentences', label: 'Sentence bank', icon: 'layers' },
  { id: 'library', label: 'Library', icon: 'globe' },
  { id: 'insights', label: 'Insights', icon: 'alert' },
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

/* ---------- shared: form modal ---------- */

/** A modal form: title, body, Cancel / save. Enter in a one-line field saves; Escape or the backdrop closes it. */
function FormModal({ title, sub, save, busy, onSave, onClose, children }: {
  title: string; sub?: string; save: string; busy: boolean; onSave: () => void; onClose: () => void; children: ReactNode;
}) {
  return (
    <Dialog label={title} onClose={busy ? () => undefined : onClose} className="adm-modal">
      <form className="adm-modal-form" onSubmit={(e) => { e.preventDefault(); onSave(); }} noValidate>
        <div className="adm-modal-head">
          <h2>{title}</h2>
          {sub && <p className="muted sm">{sub}</p>}
          <button type="button" className="iconbtn sm adm-modal-x" onClick={onClose} disabled={busy} aria-label="Close"><Icon name="x" size="sm" /></button>
        </div>
        <div className="adm-modal-body">{children}</div>
        <div className="mfoot">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <span className="spin" /> : null}{save}</button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------- plans (daily limits) ---------- */

const PLAN_FIELDS: { key: 'chat' | 'autofill' | 'courseAi' | 'sentence' | 'tokens'; label: string; unit: string; hint: string; off: string }[] = [
  { key: 'chat', label: 'Chatbot', unit: 'messages', hint: 'Questions to the AI assistant', off: 'Off' },
  { key: 'autofill', label: 'Auto-fill', unit: 'words', hint: 'New words filled in by AI or dictionaries', off: 'Off' },
  { key: 'courseAi', label: 'Course AI', unit: 'times', hint: 'AI-generated course content', off: 'Off' },
  { key: 'sentence', label: 'Sentence checks', unit: 'checks', hint: 'Practice → Write a sentence', off: 'Off' },
  { key: 'tokens', label: 'AI tokens', unit: 'tokens', hint: 'All AI features together', off: 'No cap' }
];
type PlanForm = { name: string; chat: string; autofill: string; courseAi: string; sentence: string; tokens: string };
const toForm = (p?: AdminPlan): PlanForm => ({ name: p?.name ?? '', chat: String(p?.chat ?? 30), autofill: String(p?.autofill ?? 3), courseAi: String(p?.courseAi ?? 30), sentence: String(p?.sentence ?? 10), tokens: String(p?.tokens ?? 50000) });
/** "1 word", "30 words", or what 0 means. */
const limitText = (n: number, unit: string, off: string) => (n === 0 ? off : n.toLocaleString() + ' ' + (n === 1 ? unit.replace(/s$/, '') : unit));

function PlanModal({ plan, onSaved, onClose }: { plan?: AdminPlan; onSaved: (list: AdminPlan[]) => void; onClose: () => void }) {
  const { a } = useWB();
  const [f, setF] = useState<PlanForm>(() => toForm(plan));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const nums = PLAN_FIELDS.map((x) => Number(f[x.key]));
    if (!f.name.trim()) { setErr('Please enter a plan name.'); return; }
    if (PLAN_FIELDS.some((x, k) => !f[x.key].trim() || !Number.isInteger(nums[k]) || nums[k] < 0)) { setErr('Limits must be whole numbers, 0 or more.'); return; }
    const body = { name: f.name.trim(), chat: nums[0], autofill: nums[1], courseAi: nums[2], sentence: nums[3], tokens: nums[4] };
    setBusy(true); setErr('');
    try {
      onSaved(plan ? await api.adminPatchPlan(plan.id, body) : await api.adminCreatePlan(body));
      a.showToast(plan ? 'Plan saved.' : 'Plan created.');
      onClose();
    } catch (e) { setErr(errText(e)); setBusy(false); }
  };
  return (
    <FormModal title={plan ? 'Edit ' + plan.name : 'New plan'} sub="Limits are per user, per day, and reset at midnight. 0 turns a feature off (for AI tokens: no cap)."
      save={plan ? 'Save' : 'Create plan'} busy={busy} onSave={save} onClose={onClose}>
      {err && <div className="formerr" role="alert"><Icon name="alert" size="sm" />{err}</div>}
      <div className="field">
        <label className="label" htmlFor="pl-name">Plan name</label>
        <input id="pl-name" className="input" value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Pro" autoFocus />
      </div>
      <div className="pl-limits">
        {PLAN_FIELDS.map((x) => (
          <div key={x.key} className="pl-limit">
            <label htmlFor={'pl-' + x.key}><b>{x.label}</b><span className="muted xs">{x.hint}</span></label>
            <div className="pl-num">
              <input id={'pl-' + x.key} className="input" type="number" min={0} step={x.key === 'tokens' ? 1000 : 1} inputMode="numeric"
                value={f[x.key]} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} />
              <span className="muted sm">{x.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </FormModal>
  );
}

function Plans() {
  const { a } = useWB();
  const [list, setList] = useState<AdminPlan[] | null>(null);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState<AdminPlan | 'new' | null>(null);
  const [del, setDel] = useState<AdminPlan | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.adminPlans().then(setList).catch((e) => setErr(errText(e))); }, []);
  const run = async (fn: () => Promise<AdminPlan[]>, ok: string) => {
    setBusy(true);
    try { setList(await fn()); a.showToast(ok); setDel(null); } catch (e) { a.showToast(errText(e), 'bad'); } finally { setBusy(false); }
  };
  if (err) return <EmptyState icon="alert" tint="t-red" title="Can’t load plans" text={err} />;
  if (!list) return <div className="sk" style={{ height: 200 }} />;
  return (
    <>
      <div className="adm-tools">
        <span className="muted sm">Each user is on one plan; users without one get the default plan. Limits reset at midnight. Changes apply within a minute.</span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal('new')}><Icon name="plus" size="sm" />New plan</button>
      </div>
      <div className="adm-plans">
        {list.map((p) => (
          <div key={p.id} className={'adm-plan' + (p.isDefault ? ' def' : '')}>
            <div className="adm-plan-head">
              <b className="adm-plan-name">{p.name}</b>
              {p.isDefault && <span className="badge t-indigo">Default</span>}
              <span className="muted sm" style={{ marginLeft: 'auto' }}>{p.users.toLocaleString()} user{p.users === 1 ? '' : 's'}</span>
            </div>
            <dl className="adm-plan-limits">
              {PLAN_FIELDS.map((x) => <div key={x.key}><dt>{x.label}</dt><dd className={p[x.key] === 0 ? 'muted' : ''}>{limitText(p[x.key], x.unit, x.off)}</dd></div>)}
            </dl>
            <span className="muted xs">per user, per day</span>
            <div className="adm-plan-foot">
              {!p.isDefault && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.adminPatchPlan(p.id, { isDefault: true }), p.name + ' is now the default plan.')}>Make default</button>}
              {!p.isDefault && <button className="iconbtn sm danger" disabled={busy} onClick={() => setDel(p)} aria-label={'Delete ' + p.name} title="Delete"><Icon name="trash" size="sm" /></button>}
              <button className="btn btn-secondary btn-sm" onClick={() => setModal(p)}><Icon name="edit" size="sm" />Edit</button>
            </div>
          </div>
        ))}
      </div>
      {modal && <PlanModal plan={modal === 'new' ? undefined : modal} onSaved={setList} onClose={() => setModal(null)} />}
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
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [edit, setEdit] = useState<AdminUser | null>(null);
  const [del, setDel] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.adminPlans().then(setPlans).catch(() => setPlans([])); }, []);
  const def = plans.find((x) => x.isDefault);
  const planOf = (u: AdminUser) => plans.find((x) => x.id === u.plan) ?? def;
  const patchRow = (id: string, patch: Partial<AdminUser>) => p.setData((d) => d && { ...d, items: d.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const remove = async (u: AdminUser) => {
    setBusy(true);
    try {
      await api.adminDeleteUser(u.id);
      p.setData((d) => d && { ...d, total: d.total - 1, items: d.items.filter((x) => x.id !== u.id) });
      a.showToast('Deleted ' + u.name + '’s account.');
      setDel(null);
    } catch (e) { a.showToast(errText(e), 'bad'); } finally { setBusy(false); }
  };
  return (
    <>
      <Search value={p.q} onChange={p.setQ} placeholder="Search by name or email" />
      {p.err ? <EmptyState icon="alert" tint="t-red" title="Can’t load users" text={p.err} /> : !p.data ? <div className="sk" style={{ height: 200 }} /> : (
        <>
          <div className="adm-table" role="table" aria-label="Users">
            <div className="adm-row head usr" role="row">
              <span role="columnheader">User</span><span role="columnheader">Plan</span><span role="columnheader">AI tokens today</span>
              <span role="columnheader" className="num">Words</span><span role="columnheader" className="num">Courses</span>
              <span role="columnheader">Joined</span><span role="columnheader" className="c-sr">Actions</span>
            </div>
            {p.data.items.map((u) => {
              const pl = planOf(u);
              const cap = pl?.tokens ?? 0;
              const me = u.id === s.userId;
              return (
                <div key={u.id} className="adm-row usr" role="row">
                  <span role="cell" className="adm-main usr-who">
                    <span className="usr-av" aria-hidden="true">{(u.name || u.email).charAt(0).toUpperCase()}</span>
                    <span className="usr-id">
                      <b>{u.name}{me && <span className="muted xs"> (you)</span>}</b>
                      <span className="muted xs">{u.email}</span>
                    </span>
                    {u.role === 'admin' && <span className="badge t-indigo">Admin</span>}
                  </span>
                  <span role="cell"><span className={'badge ' + (pl?.isDefault ? 'pos' : 't-green')}>{pl?.name ?? 'Default'}</span></span>
                  <span role="cell" className="sm usr-tok">
                    <span>{u.tokensToday.toLocaleString()}{cap ? <span className="muted"> / {cap.toLocaleString()}</span> : <span className="muted"> · no cap</span>}</span>
                    {cap > 0 && <span className="adm-meter" aria-hidden="true"><i className={u.tokensToday >= cap ? 'full' : ''} style={{ width: Math.min(100, (u.tokensToday / cap) * 100) + '%' }} /></span>}
                  </span>
                  <span role="cell" className="num">{u.words}</span>
                  <span role="cell" className="num">{u.courses}</span>
                  <span role="cell" className="muted sm">{fmtDay(u.createdAt)}</span>
                  <span role="cell" className="adm-act">
                    <button className="iconbtn sm" onClick={() => setEdit(u)} aria-label={'Edit ' + u.name} title="Edit plan and role"><Icon name="edit" size="sm" /></button>
                    <button className="iconbtn sm danger" onClick={() => setDel(u)} disabled={me || u.role === 'admin'} aria-label={'Delete ' + u.name}
                      title={me ? 'You can’t delete your own account here' : u.role === 'admin' ? 'Remove the admin role first' : 'Delete account'}><Icon name="trash" size="sm" /></button>
                  </span>
                </div>
              );
            })}
          </div>
          <Pager page={p.page} pages={p.data.pages} total={p.data.total} onPage={p.setPage} />
        </>
      )}
      {edit && <UserModal u={edit} me={edit.id === s.userId} plans={plans} onSaved={(patch) => { patchRow(edit.id, patch); setEdit(null); }} onClose={() => setEdit(null)} />}
      {del && (
        <ConfirmDialog title={'Delete ' + del.name + '’s account?'} confirm="Delete account" danger busy={busy}
          text={del.email + ' and everything it owns — words, progress, homework, sentences — will be deleted for good. This can’t be undone.'}
          onConfirm={() => remove(del)} onClose={() => setDel(null)} />
      )}
    </>
  );
}

/** Edit a user's plan and role. */
function UserModal({ u, me, plans, onSaved, onClose }: { u: AdminUser; me: boolean; plans: AdminPlan[]; onSaved: (patch: Partial<AdminUser>) => void; onClose: () => void }) {
  const { a } = useWB();
  const valid = plans.some((x) => x.id === u.plan) ? u.plan : '';
  const [plan, setPlan] = useState(valid);
  const [role, setRole] = useState<'user' | 'admin'>(u.role);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const def = plans.find((x) => x.isDefault);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      if (plan !== valid) await api.adminSetUserPlan(u.id, plan);
      if (role !== u.role) await api.adminSetRole(u.id, role);
      a.showToast('Saved ' + u.name + '.');
      onSaved({ plan, role });
    } catch (e) { setErr(errText(e)); setBusy(false); }
  };
  return (
    <FormModal title={u.name} sub={u.email} save="Save" busy={busy} onSave={save} onClose={onClose}>
      {err && <div className="formerr" role="alert"><Icon name="alert" size="sm" />{err}</div>}
      <div className="field">
        <span className="label" id="um-plan">Plan</span>
        <div className="usr-opts" role="radiogroup" aria-labelledby="um-plan">
          {[{ id: '', p: def }, ...plans.filter((x) => !x.isDefault).map((x) => ({ id: x.id, p: x }))].map(({ id, p }) => (
            <label key={id || 'default'} className={'radio usr-opt' + (plan === id ? ' on' : '')}>
              <input type="radio" name="um-plan" checked={plan === id} onChange={() => setPlan(id)} />
              <span className="usr-opt-t">
                <b>{p?.name ?? 'Default'}{id === '' && <span className="muted xs"> · default</span>}</b>
                {p && <span className="hint">{p.chat} chat · {p.autofill} auto-fill · {p.sentence} sentence checks · {p.tokens ? p.tokens.toLocaleString() + ' tokens' : 'no token cap'} a day</span>}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label" id="um-role">Role</span>
        <div className="seg" role="group" aria-labelledby="um-role" style={{ alignSelf: 'flex-start' }}>
          <button type="button" className={role === 'user' ? 'on' : ''} aria-pressed={role === 'user'} disabled={me} onClick={() => setRole('user')}>Learner</button>
          <button type="button" className={role === 'admin' ? 'on' : ''} aria-pressed={role === 'admin'} onClick={() => setRole('admin')}>Admin</button>
        </div>
        <span className="hint">{me ? 'You can’t remove your own admin role.' : role === 'admin' ? 'Admins create and edit every course, and manage users, plans, the sentence bank and the library.' : 'Learners use the app; they can’t open this page.'}</span>
      </div>
    </FormModal>
  );
}

/* ---------- audit log (AI calls) ---------- */

const AUDIT_ACTIONS: { id: string; label: string }[] = [
  { id: 'chat', label: 'Chatbot' },
  { id: 'lookup', label: 'Auto-fill' },
  { id: 'lookup-family', label: 'Word family' },
  { id: 'tense-questions', label: 'Tense questions' },
  { id: 'dialogue', label: 'Listening dialogue' },
  { id: 'sentence-check', label: 'Sentence check' },
  { id: 'homework-sentence', label: 'Homework sentence' },
  { id: 'recap', label: 'Course recap' }
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

/* ---------- sentence suggestions (AI examples from Write a sentence) ---------- */

function SuggestionRow({ x, onDone }: { x: AdminSuggestion; onDone: () => void }) {
  const { a } = useWB();
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(x.sentence);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setErr('');
    try { await fn(); a.showToast(ok); setEdit(false); onDone(); } catch (e) { const m = errText(e); if (edit) setErr(m); else a.showToast(m, 'bad'); setBusy(false); }
  };
  const approve = (sentence?: string) => act(() => api.adminApproveSuggestion(x.id, sentence), 'Added to the sentence bank.');
  return (
    <li className="adm-sent">
      <div className="adm-sent-body">
        <span className="badge t-indigo">{x.word}</span>
        <span className="sm" style={{ flex: 1 }}>{x.sentence}{x.vi && <span className="muted xs" style={{ display: 'block' }}>{x.vi}</span>}</span>
      </div>
      <div className="adm-act" style={{ justifyContent: 'flex-end' }}>
        <span className="muted xs" style={{ marginRight: 'auto' }}>{fmtDay(x.at)}</span>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEdit(true)}><Icon name="edit" size="sm" />Edit</button>
        <button className="btn btn-ghost btn-sm adm-bad" disabled={busy} onClick={() => act(() => api.adminRejectSuggestion(x.id), 'Suggestion rejected.')}>Reject</button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => approve()}><Icon name="check" size="sm" />Add to bank</button>
      </div>
      {edit && (
        <FormModal title={'Edit suggestion · ' + x.word} sub="Fix the sentence, then add it to the sentence bank." save="Add to bank" busy={busy}
          onSave={() => { if (!text.trim()) { setErr('The sentence is empty.'); return; } approve(text.trim() !== x.sentence ? text.trim() : undefined); }}
          onClose={() => { setEdit(false); setText(x.sentence); setErr(''); }}>
          {err && <div className="formerr" role="alert"><Icon name="alert" size="sm" />{err}</div>}
          <div className="field">
            <label className="label" htmlFor={'sg-' + x.id}>Sentence</label>
            <textarea id={'sg-' + x.id} className="input" rows={3} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} autoFocus />
            {x.vi && <span className="muted xs">{x.vi}</span>}
          </div>
        </FormModal>
      )}
    </li>
  );
}

function Suggestions() {
  const p = usePaged<AdminSuggestion>((q, page) => api.adminSuggestions(q, page));
  return (
    <>
      <Search value={p.q} onChange={p.setQ} placeholder="Search a word or part of a sentence">
        <span className="muted sm">AI example sentences for library words, from learners’ Write a sentence checks. Learners’ own sentences are never shown here.</span>
      </Search>
      {p.err ? <EmptyState icon="alert" tint="t-red" title="Can’t load suggestions" text={p.err} /> : !p.data ? <div className="sk" style={{ height: 200 }} /> : !p.data.items.length ? (
        <EmptyState icon="check" tint="t-green" title="Nothing to review" text="New suggestions appear here when learners check sentences with library words." />
      ) : (
        <>
          <ul className="adm-sents">
            {p.data.items.map((x) => <SuggestionRow key={x.id} x={x} onDone={() => p.setData((d) => d && { ...d, total: d.total - 1, items: d.items.filter((y) => y.id !== x.id) })} />)}
          </ul>
          <Pager page={p.page} pages={p.data.pages} total={p.data.total} onPage={p.setPage} />
        </>
      )}
    </>
  );
}

/* ---------- insights: what learners get wrong ---------- */

const KIND_LABEL: Record<string, string> = {
  tense: 'Tense', agreement: 'Subject–verb', article: 'Article (a/an/the)', preposition: 'Preposition', 'word-form': 'Word form',
  'word-meaning': 'Word meaning', collocation: 'Collocation', 'word-order': 'Word order', spelling: 'Spelling', punctuation: 'Punctuation', other: 'Other'
};

function Insights({ onTab }: { onTab: (t: Tab) => void }) {
  const [days, setDays] = useState(30);
  const [d, setD] = useState<AdminInsights | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { setD(null); api.adminInsights(days).then(setD).catch((e) => setErr(errText(e))); }, [days]);
  if (err) return <EmptyState icon="alert" tint="t-red" title="Can’t load insights" text={err} />;
  const max = d?.byType[0]?.count ?? 1;
  return (
    <>
      <div className="adm-tools">
        <span className="muted sm">From learners’ sentences in Write a sentence and course homework.</span>
        <div className="seg" role="group" aria-label="Period" style={{ marginLeft: 'auto' }}>
          {[7, 30, 90].map((n) => <button key={n} className={days === n ? 'on' : ''} aria-pressed={days === n} onClick={() => setDays(n)}>{n}d</button>)}
        </div>
      </div>
      {!d ? <div className="sk" style={{ height: 240 }} /> : (
        <>
          <div className="adm-tiles">
            <div className="adm-tile"><span className="adm-tval">{d.attempts.toLocaleString()}</span><span className="adm-tlabel">Sentences checked</span><span className="muted xs">{d.practice} practice · {d.homework} homework</span></div>
            <div className="adm-tile"><span className="adm-tval">{d.users}</span><span className="adm-tlabel">Learners</span><span className="muted xs">wrote at least one</span></div>
            <div className="adm-tile"><span className="adm-tval">{d.avg ?? '—'}</span><span className="adm-tlabel">Average score</span><span className="muted xs">out of 10</span></div>
            <button className={'adm-tile' + (d.pendingSuggestions ? ' warn' : '')} onClick={() => onTab('sentences')}>
              <span className="adm-tval">{d.pendingSuggestions}</span><span className="adm-tlabel">Suggestions to review</span><span className="muted xs">AI examples for the sentence bank</span>
            </button>
          </div>
          <div className="adm-ins">
            <div className="card mk-card">
              <h3 className="adm-h3">Most common mistakes</h3>
              {!d.byType.length ? <p className="muted sm">No mistakes in this period.</p> : (
                <ul className="adm-bars">
                  {d.byType.map((t) => (
                    <li key={t.type}>
                      <span className="adm-bars-l">{KIND_LABEL[t.type] ?? t.type}</span>
                      <span className="adm-bars-t" aria-hidden="true"><i style={{ width: Math.max(2, (t.count / max) * 100) + '%' }} /></span>
                      <span className="adm-bars-v">{t.count}<span className="muted xs"> · {t.users} learner{t.users === 1 ? '' : 's'}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card mk-card">
              <h3 className="adm-h3">Hardest words</h3>
              <p className="muted xs" style={{ margin: '0 0 8px' }}>Lowest average score, words written at least twice.</p>
              {!d.hardWords.length ? <p className="muted sm">Not enough sentences yet.</p> : (
                <div className="adm-table" role="table" aria-label="Hardest words">
                  <div className="adm-row head hard" role="row"><span role="columnheader">Word</span><span role="columnheader">Avg</span><span role="columnheader">Sentences</span><span role="columnheader">Mistakes</span></div>
                  {d.hardWords.map((w) => (
                    <div key={w.word} className="adm-row hard" role="row">
                      <span role="cell" className="adm-main"><b>{w.word}</b></span>
                      <span role="cell"><span className={'mk-score ' + (w.avg >= 9 ? 'good' : w.avg >= 6 ? 'ok' : 'bad')} style={{ marginLeft: 0 }}>{w.avg}</span></span>
                      <span role="cell">{w.attempts}</span>
                      <span role="cell">{w.mistakes}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    try { onSaved(await api.adminPatchSentence(s.id, f)); setEdit(false); a.showToast('Saved.'); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
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
      <div className="adm-sent-body">
        <span className="sm">{at < 0 ? s.sentence : <>{s.sentence.slice(0, at)}<mark className="sbk-verb">{s.verb}</mark>{s.sentence.slice(at + s.verb.length)}</>}</span>
        <span className="adm-act">
          <button className="iconbtn sm" onClick={() => { setF({ sentence: s.sentence, verb: s.verb, base: s.base, tense: s.tense }); setErr(''); setEdit(true); }} aria-label={'Edit: ' + s.sentence} title="Edit"><Icon name="edit" size="sm" /></button>
          <button className="iconbtn sm danger" onClick={del} disabled={busy} aria-label={'Delete: ' + s.sentence} title="Delete"><Icon name="trash" size="sm" /></button>
        </span>
      </div>
      {edit && (
        <FormModal title={'Edit sentence · ' + s.word} save="Save" busy={busy} onSave={save} onClose={() => setEdit(false)}>
          {err && <div className="formerr" role="alert"><Icon name="alert" size="sm" />{err}</div>}
          <div className="field">
            <label className="label" htmlFor={'sb-s-' + s.id}>Sentence</label>
            <textarea id={'sb-s-' + s.id} className="input" rows={3} value={f.sentence} onChange={(e) => setF({ ...f, sentence: e.target.value })} autoFocus />
          </div>
          <div className="adm-grid2">
            <div className="field">
              <label className="label" htmlFor={'sb-v-' + s.id}>Verb phrase</label>
              <input id={'sb-v-' + s.id} className="input" value={f.verb} placeholder="exactly as in the sentence" onChange={(e) => setF({ ...f, verb: e.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor={'sb-b-' + s.id}>Base verb</label>
              <input id={'sb-b-' + s.id} className="input" value={f.base} placeholder="e.g. assign" onChange={(e) => setF({ ...f, base: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor={'sb-t-' + s.id}>Tense lesson</label>
            <select id={'sb-t-' + s.id} className="input" value={f.tense} onChange={(e) => setF({ ...f, tense: e.target.value as Tense | '' })}>
              <option value="">No tense lesson</option>
              {TENSES.map((t) => <option key={t} value={t}>{TENSE_LABEL[t]}</option>)}
            </select>
          </div>
        </FormModal>
      )}
    </li>
  );
}

/** The sentence bank, and the AI suggestions waiting to be added to it. */
function Sentences() {
  const [view, setView] = useState<'bank' | 'suggestions'>('bank');
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => { api.adminSuggestions('', 1).then((r) => setPending(r.total)).catch(() => setPending(null)); }, [view]);
  return (
    <>
      <div className="seg" role="group" aria-label="Sentence bank view" style={{ marginBottom: 12 }}>
        <button className={view === 'bank' ? 'on' : ''} aria-pressed={view === 'bank'} onClick={() => setView('bank')}>Sentence bank</button>
        <button className={view === 'suggestions' ? 'on' : ''} aria-pressed={view === 'suggestions'} onClick={() => setView('suggestions')}>Suggestions{pending ? ' (' + pending + ')' : ''}</button>
      </div>
      {view === 'bank' ? <SentenceBank /> : <Suggestions />}
    </>
  );
}

function SentenceBank() {
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
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.word.trim()) { setErr('Please enter the word.'); return; }
    setBusy(true); setErr('');
    try {
      const { id: _id, authorName: _a, saves: _s, ...patch } = f;
      onSaved(await api.adminPatchLibrary(w.id, patch));
      setEdit(false);
      a.showToast('Saved “' + f.word + '”.');
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const field = (k: 'word' | 'ipa' | 'meaning' | 'vi' | 'ex', label: string, area = false) => (
    <div className="field">
      <label className="label" htmlFor={'lw-' + k + w.id}>{label}</label>
      {area
        ? <textarea id={'lw-' + k + w.id} className="input" rows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        : <input id={'lw-' + k + w.id} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} autoFocus={k === 'word'} />}
    </div>
  );
  const pick = <K extends 'pos' | 'level' | 'topic'>(k: K, label: string, options: readonly string[]) => (
    <div className="field">
      <label className="label" htmlFor={'lw-' + k + w.id}>{label}</label>
      <select id={'lw-' + k + w.id} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value as AdminLibraryWord[K] })}>{options.map((x) => <option key={x}>{x}</option>)}</select>
    </div>
  );
  return (
    <>
      <div className="adm-row lib" role="row">
        <span role="cell" className="adm-main"><b>{w.word}</b><span className="muted xs">{w.ipa} · {w.pos}</span></span>
        <span role="cell" className="sm" lang="vi">{w.vi}</span>
        <span role="cell"><span className={'badge lv-' + w.level}>{w.level}</span></span>
        <span role="cell" className="muted sm">{w.topic}</span>
        <span role="cell" className="muted sm">{w.saves}</span>
        <span role="cell" className="adm-act">
          <button className="iconbtn sm" onClick={() => { setF(w); setErr(''); setEdit(true); }} aria-label={'Edit ' + w.word} title="Edit"><Icon name="edit" size="sm" /></button>
          <button className="iconbtn sm danger" onClick={onDelete} aria-label={'Delete ' + w.word} title="Delete"><Icon name="trash" size="sm" /></button>
        </span>
      </div>
      {edit && (
        <FormModal title={'Edit “' + w.word + '”'} sub="Changes apply to the shared library for everyone." save="Save" busy={busy} onSave={save} onClose={() => setEdit(false)}>
          {err && <div className="formerr" role="alert"><Icon name="alert" size="sm" />{err}</div>}
          <div className="adm-grid2">{field('word', 'Word')}{field('ipa', 'IPA')}</div>
          <div className="adm-grid3">{pick('pos', 'Part of speech', POS_LIST)}{pick('level', 'Level', LEVELS)}{pick('topic', 'Topic', TOPICS)}</div>
          {field('vi', 'Vietnamese')}
          {field('meaning', 'Meaning', true)}
          {field('ex', 'Example', true)}
        </FormModal>
      )}
    </>
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
        {tab === 'insights' && <Insights onTab={setTab} />}
        {tab === 'audit' && <AuditLog />}
      </div>
    </>
  );
}
