import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type BankInput, type BankItem, type BankKind, type BankStatus, type CourseDay, type CourseDetail, type Quota, type Tense } from '../lib/api';
import { Icon } from '../components/ui';
import { errText } from './Courses';
import { Prompt } from './CourseHomework';
import { useWB } from '../state/WordbookContext';

export const TENSES: Tense[] = ['present-simple', 'present-continuous', 'present-perfect', 'past-simple', 'past-continuous', 'future-simple', 'going-to'];
export const TENSE_LABEL: Record<Tense, string> = {
  'present-simple': 'Present simple',
  'present-continuous': 'Present continuous',
  'present-perfect': 'Present perfect',
  'past-simple': 'Past simple',
  'past-continuous': 'Past continuous',
  'future-simple': 'Future simple (will)',
  'going-to': 'Future (be going to)'
};
const KIND_LABEL: Record<BankKind, string> = { tense: 'Typed', tenseChoice: 'Multiple choice', recap: 'Recap story' };
const SOURCE_LABEL: Record<BankItem['source'], string> = { ai: 'AI', template: 'Template', manual: 'Manual' };
const GROUPS: { status: BankStatus; title: string }[] = [
  { status: 'pending', title: 'Waiting for approval' },
  { status: 'approved', title: 'Approved' },
  { status: 'rejected', title: 'Rejected' }
];

const countsOf = (items: BankItem[]) => ({
  pending: items.filter((q) => q.status === 'pending').length,
  approved: items.filter((q) => q.status === 'approved').length
});

/** Add / edit form for one question or the recap story. Server validation errors are shown under it. */
function QuestionForm({ init, kind: kind0, words, busy, err, onSave, onCancel, idBase }: {
  init?: BankItem; kind: BankKind; words: string[]; busy: boolean; err: string;
  onSave: (q: BankInput) => void; onCancel: () => void; idBase: string;
}) {
  const [kind, setKind] = useState<BankKind>(init?.kind ?? kind0);
  const [word, setWord] = useState(init?.word ?? words[0] ?? '');
  const [tense, setTense] = useState<string>(init?.tense || 'past-simple');
  const [prompt, setPrompt] = useState(init?.prompt ?? '');
  const [answer, setAnswer] = useState(init?.answer ?? '');
  const [accept, setAccept] = useState((init?.accept ?? []).join(', '));
  const [choices, setChoices] = useState<string[]>(() => {
    const c = init?.choices.length ? [...init.choices] : [init?.answer ?? ''];
    return [...c, '', '', '', ''].slice(0, 4);
  });
  const [correct, setCorrect] = useState(() => (init ? Math.max(0, init.choices.indexOf(init.answer)) : 0));
  const [explain, setExplain] = useState(init?.explain ?? '');
  const first = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { first.current?.focus(); }, [kind]);

  const wordOpts = Array.from(new Set([...words, ...(init?.word ? [init.word] : [])]));
  const switchKind = (k: BankKind) => {
    // Carry the typed answer into the choices (and back) so nothing is lost.
    if (k === 'tenseChoice' && kind === 'tense' && !choices.some((c) => c.trim())) { setChoices([answer, '', '', '']); setCorrect(0); }
    if (k === 'tense' && kind === 'tenseChoice' && !answer.trim()) setAnswer(choices[correct] ?? '');
    setKind(k);
  };
  const save = () => {
    if (kind === 'recap') { onSave({ kind, prompt: prompt.trim(), explain: explain.trim() }); return; }
    const base = { kind, word, tense, prompt: prompt.trim(), explain: explain.trim() };
    if (kind === 'tenseChoice') {
      const cs = choices.map((c) => c.trim());
      onSave({ ...base, choices: cs, answer: cs[correct] ?? '' });
    } else {
      onSave({ ...base, answer: answer.trim(), accept: accept.split(/[,\n]/).map((x) => x.trim()).filter(Boolean) });
    }
  };
  const id = (s: string) => idBase + '-' + s;

  return (
    <form className="qbform" onSubmit={(e) => { e.preventDefault(); if (!busy) save(); }} aria-label={init ? 'Edit question' : kind === 'recap' ? 'Write recap' : 'Add question'}>
      {!init && kind !== 'recap' && (
        <div className="seg" role="group" aria-label="Question type">
          {(['tense', 'tenseChoice'] as BankKind[]).map((k) => (
            <button key={k} type="button" className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => switchKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
      )}
      {kind === 'recap' ? (
        <>
          <div className="field">
            <label className="label" htmlFor={id('story')}>Story</label>
            <textarea ref={first} id={id('story')} className="input" value={prompt} maxLength={2000} placeholder="A short story that uses words from earlier days…" onChange={(e) => setPrompt(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor={id('vi')}>Vietnamese translation</label>
            <textarea id={id('vi')} className="input" lang="vi" value={explain} maxLength={2000} onChange={(e) => setExplain(e.target.value)} />
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label className="label" htmlFor={id('prompt')}>Sentence</label>
            <textarea ref={first} id={id('prompt')} className="input qbsentence" value={prompt} maxLength={400} aria-describedby={id('ph')}
              placeholder="Yesterday we ___ (deploy) the hotfix." onChange={(e) => setPrompt(e.target.value)} />
            <span className="hint" id={id('ph')}>Use one ___ for the gap and put the base verb in brackets after it.</span>
          </div>
          <div className="form2 qbgrid">
            <div className="field">
              <label className="label" htmlFor={id('tense')}>Tense</label>
              <select id={id('tense')} className="input" value={tense} onChange={(e) => setTense(e.target.value)}>
                {TENSES.map((t) => <option key={t} value={t}>{TENSE_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor={id('word')}>Word</label>
              <select id={id('word')} className="input" value={word} onChange={(e) => setWord(e.target.value)}>
                <option value="">No word</option>
                {wordOpts.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            {kind === 'tense' && (
              <>
                <div className="field">
                  <label className="label" htmlFor={id('answer')}>Answer</label>
                  <input id={id('answer')} className="input" value={answer} maxLength={120} placeholder="deployed" autoComplete="off" onChange={(e) => setAnswer(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label" htmlFor={id('accept')}>Also accept <span className="muted xs">(optional, comma-separated)</span></label>
                  <input id={id('accept')} className="input" value={accept} maxLength={300} autoComplete="off" onChange={(e) => setAccept(e.target.value)} />
                </div>
              </>
            )}
          </div>
          {kind === 'tenseChoice' && (
            <fieldset className="qbchoiceset">
              <legend className="label">Choices <span className="muted xs">— pick the right one</span></legend>
              {choices.map((ch, k) => (
                <div key={k} className="qbchoice">
                  <input type="radio" name={id('correct')} id={id('c' + k)} checked={correct === k} onChange={() => setCorrect(k)} aria-label={'Choice ' + (k + 1) + ' is the answer'} />
                  <label className="c-sr" htmlFor={id('t' + k)}>Choice {k + 1}</label>
                  <input id={id('t' + k)} className="input" value={ch} maxLength={120} autoComplete="off" placeholder={'Choice ' + (k + 1)}
                    onChange={(e) => setChoices((prev) => prev.map((x, j) => (j === k ? e.target.value : x)))} />
                  {correct === k && <span className="badge t-green">Answer</span>}
                </div>
              ))}
            </fieldset>
          )}
          <div className="field">
            <label className="label" htmlFor={id('explain')}>Explanation (Vietnamese)</label>
            <textarea id={id('explain')} className="input" lang="vi" style={{ minHeight: 64 }} value={explain} maxLength={600}
              placeholder="Vì sao dùng thì này…" onChange={(e) => setExplain(e.target.value)} />
          </div>
        </>
      )}
      {err && <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{err}</span>}
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}><Icon name="check" size="sm" />{busy ? 'Saving…' : init ? 'Save' : kind === 'recap' ? 'Save recap' : 'Add question'}</button>
      </div>
    </form>
  );
}

function QuestionView({ q }: { q: BankItem }) {
  if (q.kind === 'recap') {
    return (
      <div className="stack" style={{ gap: 6 }}>
        <p className="qbstory">{q.prompt}</p>
        {q.explain && <p className="muted sm qbstory" lang="vi">{q.explain}</p>}
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="qbprompt"><Prompt q={{ type: q.kind, prompt: q.prompt }} fill={q.answer} /></div>
      {q.kind === 'tenseChoice' ? (
        <ul className="qbchoices" aria-label="Choices">
          {q.choices.map((ch, k) => <li key={k} className={ch === q.answer ? 'ok' : ''}>{ch}{ch === q.answer && <span className="c-sr"> (answer)</span>}</li>)}
        </ul>
      ) : q.accept.length > 0 && (
        <span className="muted xs">Also accepts: {q.accept.join(', ')}</span>
      )}
      {q.explain && <span className="sm" lang="vi">{q.explain}</span>}
    </div>
  );
}

/** The owner's bank of tense questions (and the recap story) for one day. Homework is made from approved items. */
export function QuestionBank({ c, day, onCounts }: { c: CourseDetail; day: CourseDay; onCounts: (day: number, bank: { pending: number; approved: number }) => void }) {
  const { a } = useWB();
  const [items, setItems] = useState<BankItem[] | null>(null);
  const [failed, setFailed] = useState('');
  const [tenses, setTenses] = useState<Tense[]>(TENSES);
  const [perWord, setPerWord] = useState(1);
  const [gen, setGen] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  /** Item id (or 'all') being saved. */
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState('');
  const [adding, setAdding] = useState<BankKind | null>(null);
  const [formErr, setFormErr] = useState('');
  const [showRejected, setShowRejected] = useState(false);
  const words = (day.words ?? []).map((w) => w.word);
  const base = 'qb-' + day.day;

  const load = async () => {
    setFailed('');
    try { setItems(await api.listQuestions(c.id, day.day)); } catch (e) { setFailed(errText(e, 'Couldn’t load the questions.')); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [c.id, day.day]);

  // Keep the day chip's counts in step with the list.
  useEffect(() => {
    if (!items) return;
    const n = countsOf(items);
    if (n.pending !== day.bank?.pending || n.approved !== day.bank?.approved) onCounts(day.day, n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const focusLater = (id: string) => window.setTimeout(() => document.getElementById(id)?.focus(), 0);

  const generate = async () => {
    setGen(true);
    try {
      const r = await api.generateQuestions(c.id, day.day, { tenses: tenses.length === TENSES.length ? undefined : tenses, perWord });
      setItems(r.items);
      setQuota(r.quota);
      const left = Math.max(0, r.quota.limit - r.quota.used);
      const n = r.added + (r.added === 1 ? ' question' : ' questions');
      a.showToast(r.source === 'ai'
        ? 'Added ' + n + ' with AI — review them below. ' + left + ' of ' + r.quota.limit + ' AI generations left today.'
        : 'AI isn’t available, so ' + n + ' came from built-in templates. Review them below.');
    } catch (e) {
      const qb = e instanceof ApiError ? (e.body?.quota as Quota | undefined) : undefined;
      if (qb) setQuota(qb);
      else if (e instanceof ApiError && e.status === 429 && quota) setQuota({ ...quota, used: quota.limit });
      a.showToast(errText(e, 'Couldn’t generate questions.'), 'bad');
    } finally {
      setGen(false);
    }
  };

  const setStatus = async (q: BankItem, status: BankStatus) => {
    setBusy(q.id);
    try {
      const res = await api.updateQuestion(c.id, q.id, { status });
      // Approving a recap rejects the day's other one, so reload then.
      if (q.kind === 'recap') await load();
      else setItems((prev) => prev && prev.map((x) => (x.id === q.id ? res : x)));
      a.showToast(status === 'approved' ? 'Approved.' : status === 'rejected' ? 'Rejected — it won’t be used.' : 'Moved back to pending.');
    } catch (e) {
      a.showToast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  };
  const approveAll = async () => {
    if (!items) return;
    const ids = items.filter((q) => q.status === 'pending').map((q) => q.id);
    setBusy('all');
    try {
      const r = await api.setQuestionsStatus(c.id, ids, 'approved');
      await load();
      a.showToast('Approved ' + r.updated + (r.updated === 1 ? ' item.' : ' items.'));
    } catch (e) {
      a.showToast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  };
  const remove = async (q: BankItem) => {
    setBusy(q.id);
    try {
      await api.deleteQuestion(c.id, q.id);
      setItems((prev) => prev && prev.filter((x) => x.id !== q.id));
      a.showToast(q.kind === 'recap' ? 'Recap deleted.' : 'Question deleted.');
      focusLater(base + '-h');
    } catch (e) {
      a.showToast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  };
  const saveEdit = async (q: BankItem, input: BankInput) => {
    const patch: Partial<BankInput> = { ...input };
    delete patch.kind;
    setBusy(q.id);
    setFormErr('');
    try {
      const res = await api.updateQuestion(c.id, q.id, patch);
      setItems((prev) => prev && prev.map((x) => (x.id === q.id ? res : x)));
      setEditing('');
      a.showToast('Saved.');
      focusLater(base + '-e-' + q.id);
    } catch (e) {
      setFormErr(errText(e, 'Couldn’t save this question.'));
    } finally {
      setBusy('');
    }
  };
  const saveNew = async (input: BankInput) => {
    setBusy('new');
    setFormErr('');
    try {
      const res = await api.addQuestion(c.id, day.day, input);
      // A new recap replaces the old one, so reload then.
      if (input.kind === 'recap') await load();
      else setItems((prev) => prev && [...prev, res]);
      setAdding(null);
      a.showToast(input.kind === 'recap' ? 'Recap saved and approved.' : 'Question added and approved.');
      focusLater(base + '-add');
    } catch (e) {
      setFormErr(errText(e, 'Couldn’t add this question.'));
    } finally {
      setBusy('');
    }
  };
  const openForm = (k: BankKind | null, id = '') => { setFormErr(''); setAdding(k); setEditing(id); };
  const toggleTense = (t: Tense) => setTenses((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : TENSES.filter((x) => x === t || prev.includes(x))));

  const n = items ? countsOf(items) : { pending: day.bank?.pending ?? 0, approved: day.bank?.approved ?? 0 };
  const hasRecap = !!items?.some((q) => q.kind === 'recap' && q.status !== 'rejected');
  const left = quota ? Math.max(0, quota.limit - quota.used) : null;

  return (
    <section className="qbank" aria-labelledby={base + '-h'}>
      <div className="rowb" style={{ flexWrap: 'wrap' }}>
        <h3 className="h2" id={base + '-h'} tabIndex={-1} style={{ outline: 'none' }}>Tense questions & recap</h3>
        <span className="muted sm">{n.pending} pending · {n.approved} approved</span>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Homework for day {day.day} uses the approved questions, and the approved recap opens the day’s warm-up. Changes apply to homework nobody has handed in yet.
      </p>

      <div className="qbgen">
        <div className="field">
          <span className="label" id={base + '-tenses'}>Tenses</span>
          <div className="chips" role="group" aria-labelledby={base + '-tenses'}>
            {TENSES.map((t) => (
              <button key={t} className={'chip soft' + (tenses.includes(t) ? ' on' : '')} aria-pressed={tenses.includes(t)} onClick={() => toggleTense(t)} disabled={gen}>{TENSE_LABEL[t]}</button>
            ))}
          </div>
        </div>
        <div className="qbgenrow">
          <div className="field">
            <span className="label" id={base + '-pw'}>Questions per word</span>
            <div className="seg" role="group" aria-labelledby={base + '-pw'}>
              {[1, 2, 3].map((k) => <button key={k} className={perWord === k ? 'on' : ''} aria-pressed={perWord === k} onClick={() => setPerWord(k)} disabled={gen}>{k}</button>)}
            </div>
          </div>
          <div className="qbgenbtn">
            {left !== null && <span className="hint">{left} AI {left === 1 ? 'generation' : 'generations'} left today</span>}
            <button className="btn btn-primary" onClick={generate} disabled={gen || !words.length || !tenses.length}>
              {gen ? <span className="spin" /> : <Icon name="sparkle" size="sm" />}{gen ? 'Generating…' : 'Generate with AI'}
            </button>
          </div>
        </div>
        <div aria-live="polite" className="hint">
          {gen ? 'Writing questions for ' + words.length + (words.length === 1 ? ' word' : ' words') + ' — this can take up to a minute…'
            : !words.length ? 'Add words to this day first.'
            : !tenses.length ? 'Pick at least one tense.' : 'New questions wait for your approval before learners see them.'}
        </div>
      </div>

      <div className="actions">
        <button id={base + '-add'} className="btn btn-secondary btn-sm" onClick={() => openForm('tense')} aria-expanded={adding === 'tense'}><Icon name="plus" size="sm" />Add question</button>
        <button className="btn btn-secondary btn-sm" onClick={() => openForm('recap')} aria-expanded={adding === 'recap'}><Icon name="pen" size="sm" />{hasRecap ? 'Rewrite recap' : 'Write recap'}</button>
        {n.pending > 0 && (
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={approveAll} disabled={!!busy}>
            <Icon name="checkc" size="sm" />{busy === 'all' ? 'Approving…' : 'Approve all pending (' + n.pending + ')'}
          </button>
        )}
      </div>
      {adding && (
        <div className="qbnew">
          {adding === 'recap' && hasRecap && <p className="hint" style={{ margin: 0 }}>Saving a new recap replaces this day’s current one.</p>}
          <QuestionForm key={adding} kind={adding} words={words} busy={busy === 'new'} err={formErr} idBase={base + '-new'}
            onSave={saveNew} onCancel={() => { openForm(null); focusLater(base + '-add'); }} />
        </div>
      )}

      {failed ? (
        <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{failed} <button className="linkbtn" onClick={load}>Try again</button></span>
      ) : !items ? (
        <div className="sk" style={{ height: 90, borderRadius: 12 }} aria-busy="true" aria-label="Loading questions" />
      ) : !items.length ? (
        <p className="muted sm" style={{ margin: 0 }}>No tense questions for day {day.day} yet. Generate some, or write your own.</p>
      ) : GROUPS.map(({ status, title }) => {
        const list = items.filter((q) => q.status === status);
        if (!list.length) return null;
        const hidden = status === 'rejected' && !showRejected;
        return (
          <div key={status} className={'qbgroup ' + status}>
            {status === 'rejected' ? (
              <button className="qbgtitle qbtoggle" onClick={() => setShowRejected(!showRejected)} aria-expanded={showRejected}>
                <Icon name={showRejected ? 'down' : 'right'} size="sm" />{title} <span className="count soft">{list.length}</span>
              </button>
            ) : (
              <h4 className="qbgtitle">{title} <span className={'count' + (status === 'pending' ? ' warn' : ' soft')}>{list.length}</span></h4>
            )}
            {!hidden && (
              <ul className="qblist">
                {list.map((q) => (
                  <li key={q.id} className="qbitem">
                    <div className="badges">
                      <span className={'badge ' + (q.kind === 'recap' ? 't-indigo' : 'pos')}>{KIND_LABEL[q.kind]}</span>
                      {q.tenseLabel && <span className="badge t-blue">{q.tenseLabel}</span>}
                      {q.word && <span className="badge pos">{q.word}</span>}
                      <span className="muted xs">{SOURCE_LABEL[q.source]}</span>
                    </div>
                    {editing === q.id ? (
                      <QuestionForm init={q} kind={q.kind} words={words} busy={busy === q.id} err={formErr} idBase={base + '-f-' + q.id}
                        onSave={(input) => saveEdit(q, input)} onCancel={() => { openForm(null); focusLater(base + '-e-' + q.id); }} />
                    ) : (
                      <>
                        <QuestionView q={q} />
                        <div className="qbact">
                          {q.status !== 'approved' && <button className="btn btn-secondary btn-sm qbok" onClick={() => setStatus(q, 'approved')} disabled={!!busy}><Icon name="check" size="sm" />Approve</button>}
                          {q.status !== 'rejected' && <button className="btn btn-secondary btn-sm" onClick={() => setStatus(q, 'rejected')} disabled={!!busy}><Icon name="x" size="sm" />Reject</button>}
                          <button id={base + '-e-' + q.id} className="btn btn-ghost btn-sm" onClick={() => openForm(null, q.id)} disabled={!!busy}><Icon name="edit" size="sm" />Edit</button>
                          <button className="iconbtn sm danger" onClick={() => remove(q)} disabled={!!busy} aria-label={'Delete ' + (q.kind === 'recap' ? 'recap' : 'question: ' + q.prompt)} title="Delete"><Icon name="trash" size="sm" /></button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
