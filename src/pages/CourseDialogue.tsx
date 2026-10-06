import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { api, ApiError, type BankItem, type BankStatus, type CourseDay, type CourseDetail, type Dialogue, type DialogueSpeaker, type Quota } from '../lib/api';
import { Icon } from '../components/ui';
import { useWB } from '../state/WordbookContext';
import { ConfirmDialog, Dialog, errText } from './Courses';
import { download } from './CourseImport';
import { ListeningPractice, SpeakerBadge, countBlanks, parseDialogue } from './CourseListening';

const MAX_FILE = 1024 * 1024;
const MAX_QUESTIONS = 5;
const STATUS_ORDER: BankStatus[] = ['approved', 'pending', 'rejected'];
const STATUS_LABEL: Record<BankStatus, string> = { approved: 'Approved — learners get this one', pending: 'Waiting for approval', rejected: 'Rejected' };
const SOURCE_LABEL: Record<BankItem['source'], string> = { ai: 'AI', template: 'Template', manual: 'Manual' };

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

/* ---------- template & import ---------- */

/** A filled-in example with the day's words as blanks, for the owner to rewrite. */
export function templateDialogue(words: string[]): Dialogue & { _help: string } {
  const ws = words.slice(0, 10);
  while (ws.length < 2) ws.push(ws.length ? 'schedule' : 'meeting');
  const lines: Dialogue['lines'] = ws.map((w, k) => ({
    s: (k % 2) as 0 | 1,
    text: k === 0 ? 'Hi, have you got a minute to talk about the [[' + w + ']]?' : 'Replace this line with a natural sentence that uses [[' + w + ']].',
    vi: 'Bản dịch tiếng Việt của câu này.'
  }));
  const fill = ['Sure. What do you need?', 'Thanks, that really helps.', 'No problem. Let me know if anything changes.'];
  for (let k = 0; lines.length < 4; k++) lines.push({ s: (lines.length % 2) as 0 | 1, text: fill[k], vi: 'Bản dịch tiếng Việt của câu này.' });
  return {
    _help: 'Blanks: [[word]], or [[said form|word]] when the line uses another form, e.g. [[deployed|deploy]]. ' +
      'Exactly 2 speakers (gender "female" or "male"), 4–16 lines (s = 0 or 1), 2–10 blanks, up to 5 questions with 4 different choices including the answer. "scenario", "vi" and "explain" are in Vietnamese.',
    title: 'Talking about the ' + ws[0],
    scenario: 'Hai đồng nghiệp trao đổi về công việc trong văn phòng.',
    speakers: [{ name: 'Anna', gender: 'female' }, { name: 'Tom', gender: 'male' }],
    lines,
    questions: [{
      question: 'What are the speakers mainly discussing?',
      choices: ['The ' + ws[0], 'A holiday plan', 'A new office', 'A job interview'],
      answer: 'The ' + ws[0],
      explain: 'Họ đang nói về ' + ws[0] + '.'
    }]
  };
}

/** The dialogue in pasted / uploaded JSON: the object itself, or { data: {...} }. Keys starting with "_" are dropped. */
function dialogueFromJson(text: string): Record<string, unknown> {
  let raw: unknown;
  try { raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); } catch { throw new Error('This isn’t valid JSON.'); }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && !('lines' in raw) && 'data' in raw) raw = (raw as { data: unknown }).data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The JSON must be one dialogue object: { "title", "scenario", "speakers", "lines", "questions" }.');
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([k]) => !k.startsWith('_')));
}

/** Counts for the import preview, read defensively (the server does the real checks). */
function looksOf(o: Record<string, unknown>) {
  const lines = Array.isArray(o.lines) ? o.lines : [];
  const texts = lines.map((l) => (l && typeof l === 'object' && typeof (l as { text?: unknown }).text === 'string' ? (l as { text: string }).text : ''));
  return {
    title: typeof o.title === 'string' ? o.title : '',
    speakers: Array.isArray(o.speakers) ? o.speakers.length : 0,
    lines: lines.length,
    blanks: texts.reduce((n, t) => n + countBlanks(t), 0),
    questions: Array.isArray(o.questions) ? o.questions.length : 0
  };
}

/* ---------- write / edit ---------- */

interface LineDraft { key: number; s: 0 | 1; text: string; vi: string }
interface QuestionDraft { key: number; question: string; choices: string[]; correct: number; explain: string }
let keySeq = 0;
const newLine = (s: 0 | 1): LineDraft => ({ key: ++keySeq, s, text: '', vi: '' });
const newQuestion = (): QuestionDraft => ({ key: ++keySeq, question: '', choices: ['', '', '', ''], correct: 0, explain: '' });

/**
 * Write or edit a dialogue. init: what to start from (an imported one, or the one being edited) · edit: saving updates an
 * existing dialogue rather than adding (and approving) a new one. Server validation messages are shown under it (err).
 */
export function DialogueForm({ init, edit, words, busy, err, onSave, onCancel, idBase }: {
  init?: Dialogue; edit?: boolean; words: string[]; busy: boolean; err: string; onSave: (d: Dialogue) => void; onCancel: () => void; idBase: string;
}) {
  const [title, setTitle] = useState(init?.title ?? '');
  const [scenario, setScenario] = useState(init?.scenario ?? '');
  const [speakers, setSpeakers] = useState<DialogueSpeaker[]>(() =>
    init?.speakers.length === 2 ? init.speakers.map((s) => ({ ...s })) : [{ name: 'Anna', gender: 'female' }, { name: 'Tom', gender: 'male' }]);
  const [lines, setLines] = useState<LineDraft[]>(() =>
    init?.lines.length ? init.lines.map((l) => ({ key: ++keySeq, s: l.s === 1 ? 1 : 0, text: l.text, vi: l.vi })) : [newLine(0), newLine(1), newLine(0), newLine(1)]);
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => (init?.questions ?? []).map((q) => {
    const choices = [...q.choices, '', '', '', ''].slice(0, 4);
    return { key: ++keySeq, question: q.question, choices, correct: Math.max(0, choices.indexOf(q.answer)), explain: q.explain };
  }));
  const [live, setLive] = useState('');
  /** Where "insert blank" goes: the last line text the owner was in, and the caret there. */
  const caret = useRef<{ key: number; start: number; end: number } | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);

  const id = (s: string) => idBase + '-' + s;
  const blanks = lines.reduce((n, l) => n + countBlanks(l.text), 0);
  const filledLines = lines.filter((l) => l.text.trim() || l.vi.trim()).length;
  const setLine = (key: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setQ = (key: number, patch: Partial<QuestionDraft>) => setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  const focusLater = (el: string) => window.setTimeout(() => document.getElementById(el)?.focus(), 0);

  const move = (k: number, by: -1 | 1) => {
    const to = k + by;
    if (to < 0 || to >= lines.length) return;
    const next = [...lines];
    [next[k], next[to]] = [next[to], next[k]];
    setLines(next);
    setLive('Line ' + (k + 1) + ' moved to ' + (to + 1) + '.');
    // Keep focus on the same button, unless the line reached the end it was moving to.
    const up = by < 0 ? to > 0 : to === next.length - 1;
    focusLater(id('l' + next[to].key + (up ? '-up' : '-down')));
  };
  const removeLine = (k: number) => {
    const next = lines.filter((_, j) => j !== k);
    setLines(next);
    setLive('Line ' + (k + 1) + ' removed.');
    focusLater(next.length ? id('l' + next[Math.min(k, next.length - 1)].key + '-text') : id('addline'));
  };
  const addLine = () => {
    const l = newLine(lines.length ? (lines[lines.length - 1].s === 0 ? 1 : 0) : 0);
    setLines([...lines, l]);
    focusLater(id('l' + l.key + '-text'));
  };
  const insertBlank = (w: string) => {
    const at = caret.current && lines.find((l) => l.key === caret.current!.key) ? caret.current : null;
    const line = at ? lines.find((l) => l.key === at.key)! : lines.find((l) => !l.text.trim()) ?? lines[lines.length - 1];
    if (!line) return;
    const tag = '[[' + w + ']]';
    const start = at ? Math.min(at.start, line.text.length) : line.text.length;
    const end = at ? Math.min(at.end, line.text.length) : line.text.length;
    const before = line.text.slice(0, start);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    const text = before + pad + tag + line.text.slice(end);
    setLine(line.key, { text });
    const pos = start + pad.length + tag.length;
    caret.current = { key: line.key, start: pos, end: pos };
    setLive('Blank for ' + w + ' added to line ' + (lines.indexOf(line) + 1) + '.');
    window.setTimeout(() => {
      const el = document.getElementById(id('l' + line.key + '-text')) as HTMLTextAreaElement | null;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    }, 0);
  };
  const track = (key: number, el: HTMLTextAreaElement) => { caret.current = { key, start: el.selectionStart, end: el.selectionEnd }; };

  const save = () => {
    onSave({
      title: title.trim(),
      scenario: scenario.trim(),
      speakers: speakers.map((s) => ({ name: s.name.trim(), gender: s.gender })),
      lines: lines.filter((l) => l.text.trim() || l.vi.trim()).map((l) => ({ s: l.s, text: l.text.trim(), vi: l.vi.trim() })),
      questions: questions.filter((q) => q.question.trim() || q.choices.some((c) => c.trim())).map((q) => {
        const choices = q.choices.map((c) => c.trim());
        return { question: q.question.trim(), choices, answer: choices[q.correct] ?? '', explain: q.explain.trim() };
      })
    });
  };

  return (
    <form className="qbform dlform" onSubmit={(e) => { e.preventDefault(); if (!busy) save(); }} aria-label={edit ? 'Edit dialogue' : 'Write dialogue'}>
      <div className="form2 qbgrid">
        <div className="field">
          <label className="label" htmlFor={id('title')}>Title</label>
          <input ref={first} id={id('title')} className="input" value={title} maxLength={120} placeholder="Booking a meeting room" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor={id('scen')}>Scenario <span className="muted xs">(Vietnamese)</span></label>
          <input id={id('scen')} className="input" lang="vi" value={scenario} maxLength={300} placeholder="Hai đồng nghiệp đặt phòng họp cho buổi chiều." onChange={(e) => setScenario(e.target.value)} />
        </div>
      </div>

      <fieldset className="dlset">
        <legend className="label">Speakers</legend>
        <div className="form2 qbgrid">
          {speakers.map((sp, k) => (
            <div key={k} className="dlspk">
              <div className="field" style={{ flex: 1 }}>
                <label className="label xs" htmlFor={id('sn' + k)}>Speaker {k + 1} name</label>
                <input id={id('sn' + k)} className="input" value={sp.name} maxLength={40} onChange={(e) => setSpeakers((s) => s.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} />
              </div>
              <div className="field">
                <label className="label xs" htmlFor={id('sg' + k)}>Voice</label>
                <select id={id('sg' + k)} className="input" value={sp.gender} onChange={(e) => setSpeakers((s) => s.map((x, j) => (j === k ? { ...x, gender: e.target.value === 'male' ? 'male' : 'female' } : x)))}>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="dlset">
        <legend className="label">Lines <span className={'muted xs' + (filledLines < 4 || filledLines > 16 ? ' dlwarn' : '')}>· {filledLines} of 4–16</span>{' '}
          <span className={'muted xs' + (blanks < 2 || blanks > 10 ? ' dlwarn' : '')}>· {plural(blanks, 'blank')} of 2–10</span>
        </legend>
        <p className="hint" id={id('bh')} style={{ margin: '0 0 8px' }}>
          Mark each blank as <code>[[word]]</code>, or <code>[[said form|word]]</code> when the line uses another form — e.g. <code>[[deployed|deploy]]</code>.
          Learners hear the said form and pick the word from the word bank.
        </p>
        {words.length > 0 && (
          <div className="dlins">
            <span className="label xs" id={id('ins')}>Insert blank for</span>
            <div className="chips" role="group" aria-labelledby={id('ins')}>
              {words.map((w) => (
                <button key={w} type="button" className="chip soft" onMouseDown={(e) => e.preventDefault()} onClick={() => insertBlank(w)}
                  aria-label={'Insert a blank for ' + w}><Icon name="plus" size="sm" />{w}</button>
              ))}
            </div>
          </div>
        )}
        <ol className="dllines">
          {lines.map((l, k) => (
            <li key={l.key} className={'dlline s' + l.s}>
              <div className="dlline-top">
                <span className="dlnum" aria-hidden="true">{k + 1}</span>
                <label className="c-sr" htmlFor={id('l' + l.key + '-s')}>Line {k + 1} speaker</label>
                <select id={id('l' + l.key + '-s')} className="input dlwho" value={l.s} onChange={(e) => setLine(l.key, { s: e.target.value === '1' ? 1 : 0 })}>
                  {speakers.map((sp, j) => <option key={j} value={j}>{sp.name.trim() || 'Speaker ' + (j + 1)}</option>)}
                </select>
                <span className="dlbn muted xs">{countBlanks(l.text) > 0 && plural(countBlanks(l.text), 'blank')}</span>
                <button type="button" id={id('l' + l.key + '-up')} className="iconbtn sm" onClick={() => move(k, -1)} disabled={k === 0} aria-label={'Move line ' + (k + 1) + ' up'} title="Move up"><Icon name="up" size="sm" /></button>
                <button type="button" id={id('l' + l.key + '-down')} className="iconbtn sm" onClick={() => move(k, 1)} disabled={k === lines.length - 1} aria-label={'Move line ' + (k + 1) + ' down'} title="Move down"><Icon name="down" size="sm" /></button>
                <button type="button" className="iconbtn sm danger" onClick={() => removeLine(k)} aria-label={'Remove line ' + (k + 1)} title="Remove"><Icon name="trash" size="sm" /></button>
              </div>
              <label className="c-sr" htmlFor={id('l' + l.key + '-text')}>Line {k + 1} text</label>
              <textarea id={id('l' + l.key + '-text')} className="input dltext" rows={2} value={l.text} maxLength={400} aria-describedby={id('bh')}
                placeholder="Could you send me the [[invoice]] by Friday?"
                onChange={(e) => { setLine(l.key, { text: e.target.value }); track(l.key, e.target); }}
                onSelect={(e) => track(l.key, e.currentTarget)} onFocus={(e) => track(l.key, e.currentTarget)} />
              <label className="c-sr" htmlFor={id('l' + l.key + '-vi')}>Line {k + 1} Vietnamese translation</label>
              <input id={id('l' + l.key + '-vi')} className="input dlvi" lang="vi" value={l.vi} maxLength={600} placeholder="Bản dịch tiếng Việt"
                onChange={(e) => setLine(l.key, { vi: e.target.value })} />
            </li>
          ))}
        </ol>
        <button type="button" id={id('addline')} className="btn btn-secondary btn-sm" onClick={addLine} disabled={lines.length >= 16} style={{ alignSelf: 'flex-start' }}>
          <Icon name="plus" size="sm" />Add line
        </button>
      </fieldset>

      <fieldset className="dlset">
        <legend className="label">Questions <span className="muted xs">· optional, up to {MAX_QUESTIONS}</span></legend>
        {questions.map((q, k) => (
          <div key={q.key} className="dlq">
            <div className="rowb">
              <label className="label xs" htmlFor={id('q' + q.key)}>Question {k + 1}</label>
              <button type="button" className="iconbtn sm danger" onClick={() => { setQuestions((qs) => qs.filter((x) => x.key !== q.key)); focusLater(id('addq')); }}
                aria-label={'Remove question ' + (k + 1)} title="Remove"><Icon name="trash" size="sm" /></button>
            </div>
            <input id={id('q' + q.key)} className="input" value={q.question} maxLength={300} placeholder="Why is the man calling?" onChange={(e) => setQ(q.key, { question: e.target.value })} />
            <fieldset className="qbchoiceset">
              <legend className="c-sr">Question {k + 1} choices — pick the right one</legend>
              {q.choices.map((ch, j) => (
                <div key={j} className="qbchoice">
                  <input type="radio" name={id('qc' + q.key)} checked={q.correct === j} onChange={() => setQ(q.key, { correct: j })} aria-label={'Choice ' + (j + 1) + ' is the answer'} />
                  <label className="c-sr" htmlFor={id('q' + q.key + 'c' + j)}>Question {k + 1} choice {j + 1}</label>
                  <input id={id('q' + q.key + 'c' + j)} className="input" value={ch} maxLength={200} autoComplete="off" placeholder={'Choice ' + (j + 1)}
                    onChange={(e) => setQ(q.key, { choices: q.choices.map((x, i) => (i === j ? e.target.value : x)) })} />
                  {q.correct === j && <span className="badge t-green">Answer</span>}
                </div>
              ))}
            </fieldset>
            <label className="c-sr" htmlFor={id('q' + q.key + 'x')}>Question {k + 1} explanation (Vietnamese)</label>
            <input id={id('q' + q.key + 'x')} className="input" lang="vi" value={q.explain} maxLength={400} placeholder="Giải thích (tiếng Việt)" onChange={(e) => setQ(q.key, { explain: e.target.value })} />
          </div>
        ))}
        <button type="button" id={id('addq')} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={questions.length >= MAX_QUESTIONS}
          onClick={() => { const q = newQuestion(); setQuestions([...questions, q]); focusLater(id('q' + q.key)); }}>
          <Icon name="plus" size="sm" />Add question
        </button>
      </fieldset>

      {err && <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{err}</span>}
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}><Icon name="check" size="sm" />{busy ? 'Saving…' : edit ? 'Save dialogue' : 'Save and approve'}</button>
      </div>
      <div className="c-sr" aria-live="polite" aria-atomic="true">{live}</div>
    </form>
  );
}

/** Paste or upload a dialogue as JSON; saving approves it. "Edit first" opens it in the form instead. */
function ImportDialogue({ day, words, onImport, onEdit, onClose }: {
  day: number; words: string[]; onImport: (d: Dialogue) => Promise<string>; onEdit: (d: Dialogue) => void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [file, setFile] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const base = 'di-' + day;

  let parsed: Record<string, unknown> | null = null;
  let parseErr = '';
  if (text.trim()) {
    try { parsed = dialogueFromJson(text); } catch (e) { parseErr = errText(e, 'This isn’t valid JSON.'); }
  }
  const look = parsed ? looksOf(parsed) : null;

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr('');
    if (f.size > MAX_FILE) { setFile(f.name); setErr('This file is too big (over 1 MB).'); return; }
    try { setText(await f.text()); setFile(f.name); } catch (er) { setErr(errText(er, 'Couldn’t read this file.')); }
  };
  const run = async () => {
    if (!parsed || busy) return;
    setBusy(true);
    setErr('');
    const msg = await onImport(parsed as unknown as Dialogue);
    setBusy(false);
    if (msg) setErr(msg);
  };

  return (
    <Dialog label={'Import a dialogue for day ' + day} onClose={onClose} wide className="impmodal">
      <h2>Import dialogue · day {day}</h2>
      <p className="sm">Paste or upload one dialogue as JSON. Importing <b>approves it straight away</b> and replaces day {day}’s current dialogue.</p>
      <div className="impstep">
        <span className="label">1. Start from the template</span>
        <span className="hint">It uses this day’s words as example blanks — rewrite the lines and questions.</span>
        <div className="actions">
          <button className="btn btn-secondary btn-sm" autoFocus onClick={() => download('day-' + day + '-dialogue.json', JSON.stringify(templateDialogue(words), null, 2) + '\n', 'application/json')}>
            <Icon name="download" size="sm" />Download JSON template
          </button>
        </div>
      </div>
      <div className="impstep">
        <label className="label" htmlFor={base + '-file'}>2. Upload the file…</label>
        <input id={base + '-file'} type="file" className="input fileinput" accept=".json,application/json" onChange={pick} disabled={busy} />
        <label className="label" htmlFor={base + '-text'}>…or paste the JSON</label>
        <textarea id={base + '-text'} className="input dljson" value={text} spellCheck={false} placeholder='{ "title": "…", "scenario": "…", "speakers": [ … ], "lines": [ … ], "questions": [ … ] }'
          onChange={(e) => { setText(e.target.value); setFile(''); setErr(''); }} />
        {parseErr && <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{file ? file + ': ' : ''}{parseErr}</span>}
      </div>
      <div aria-live="polite">
        {look && (
          <p className="note sm dlnote">
            <b>{look.title || 'Untitled'}</b> · {plural(look.speakers, 'speaker')} · {plural(look.lines, 'line')} · {plural(look.blanks, 'blank')} · {plural(look.questions, 'question')}
          </p>
        )}
      </div>
      {err && <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{err}</span>}
      <div className="mfoot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-secondary" onClick={() => parsed && onEdit(parsed as unknown as Dialogue)} disabled={!parsed || busy}><Icon name="edit" size="sm" />Edit first</button>
        <button className="btn btn-primary" onClick={run} disabled={!parsed || busy}><Icon name="upload" size="sm" />{busy ? 'Importing…' : 'Import and approve'}</button>
      </div>
    </Dialog>
  );
}

/** One dialogue in the owner's list: what it has, at a glance. */
function DialogueSummary({ d }: { d: Dialogue }) {
  const nb = parseDialogue(d.lines).blanks;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <b className="dltitle">{d.title}</b>
      {d.scenario && <span className="muted sm" lang="vi">{d.scenario}</span>}
      <div className="badges">
        {d.speakers.map((s, i) => <SpeakerBadge key={i} name={s.name} gender={s.gender} s={i} />)}
        <span className="muted xs">{plural(d.lines.length, 'line')} · {plural(nb.length, 'blank')} · {plural(d.questions.length, 'question')}</span>
      </div>
      {nb.length > 0 && <span className="muted xs">Blanks: {nb.map((b) => (b.said === b.base ? b.said : b.said + ' (' + b.base + ')')).join(', ')}</span>}
    </div>
  );
}

/**
 * The owner's listening dialogue for one day: learners get a listening step with the approved one. AI writes pending
 * ones; written or imported ones are approved straight away. items: the day's dialogue bank items (null while loading).
 */
export function DialogueBank({ c, day, items, setItems, reload }: {
  c: CourseDetail; day: CourseDay; items: BankItem[] | null;
  setItems: Dispatch<SetStateAction<BankItem[] | null>>; reload: () => Promise<void>;
}) {
  const { a } = useWB();
  const [gen, setGen] = useState(false);
  const [genMsg, setGenMsg] = useState('');
  const [quota, setQuota] = useState<Quota | null>(null);
  const [busy, setBusy] = useState('');
  /** 'new', an item id being edited, or ''. */
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState<Dialogue | undefined>(undefined);
  const [formErr, setFormErr] = useState('');
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<BankItem | null>(null);
  const [deleting, setDeleting] = useState<BankItem | null>(null);
  const words = (day.words ?? []).map((w) => w.word);
  const base = 'dl-' + day.day;
  const focusLater = (el: string) => window.setTimeout(() => document.getElementById(el)?.focus(), 0);
  const replace = (q: BankItem) => setItems((prev) => prev && prev.map((x) => (x.id === q.id ? q : x)));

  const generate = async () => {
    setGen(true);
    setGenMsg('');
    try {
      const r = await api.generateDialogue(c.id, day.day);
      setItems(r.items);
      setQuota(r.quota);
      const left = Math.max(0, r.quota.limit - r.quota.used);
      a.showToast('AI wrote a dialogue — preview and approve it below. ' + left + ' of ' + r.quota.limit + ' AI generations left today.');
    } catch (e) {
      const qb = e instanceof ApiError ? (e.body?.quota as Quota | undefined) : undefined;
      if (qb) setQuota(qb);
      else if (e instanceof ApiError && e.status === 429 && quota) setQuota({ ...quota, used: quota.limit });
      setGenMsg(errText(e, 'Couldn’t generate a dialogue.'));
    } finally {
      setGen(false);
    }
  };

  const setStatus = async (q: BankItem, status: BankStatus) => {
    setBusy(q.id);
    try {
      await api.updateQuestion(c.id, q.id, { status });
      // Approving one rejects the day's other approved dialogue.
      await reload();
      a.showToast(status === 'approved' ? 'Dialogue approved — learners get it for day ' + day.day + '.' : status === 'rejected' ? 'Rejected — learners won’t get it.' : 'Moved back to pending.');
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
      a.showToast('Dialogue deleted.');
      setDeleting(null);
      focusLater(base + '-h');
    } catch (e) {
      a.showToast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  };
  const openForm = (which: string, init?: Dialogue) => { setFormErr(''); setDraft(init); setEditing(which); };
  const closeForm = (focus: string) => { setEditing(''); setDraft(undefined); setFormErr(''); focusLater(focus); };
  const saveNew = async (d: Dialogue) => {
    setBusy('new');
    setFormErr('');
    try {
      await api.addDialogue(c.id, day.day, d);
      await reload();
      a.showToast('Dialogue saved and approved.');
      closeForm(base + '-write');
    } catch (e) {
      setFormErr(errText(e, 'Couldn’t save this dialogue.'));
    } finally {
      setBusy('');
    }
  };
  const saveEdit = async (q: BankItem, d: Dialogue) => {
    setBusy(q.id);
    setFormErr('');
    try {
      replace(await api.updateQuestion(c.id, q.id, { data: d }));
      a.showToast('Dialogue saved.');
      closeForm(base + '-e-' + q.id);
    } catch (e) {
      setFormErr(errText(e, 'Couldn’t save this dialogue.'));
    } finally {
      setBusy('');
    }
  };
  /** Returns the server's message when it's refused ('' when saved). */
  const importOne = async (d: Dialogue): Promise<string> => {
    try {
      await api.addDialogue(c.id, day.day, d);
      await reload();
      a.showToast('Dialogue imported and approved.');
      setImporting(false);
      focusLater(base + '-import');
      return '';
    } catch (e) {
      return errText(e, 'Couldn’t import this dialogue.');
    }
  };

  const left = quota ? Math.max(0, quota.limit - quota.used) : null;
  const sorted = items ? STATUS_ORDER.flatMap((st) => items.filter((q) => q.status === st && q.data)) : [];

  return (
    <section className="qbank dlbank" aria-labelledby={base + '-h'}>
      <div className="rowb" style={{ flexWrap: 'wrap' }}>
        <h3 className="h2" id={base + '-h'} tabIndex={-1} style={{ outline: 'none' }}><span aria-hidden="true">🎧 </span>Listening dialogue</h3>
        {items && <span className="muted sm">{items.some((q) => q.status === 'approved') ? '1 approved' : 'None approved'}{items.some((q) => q.status === 'pending') ? ' · ' + items.filter((q) => q.status === 'pending').length + ' pending' : ''}</span>}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        With an approved dialogue, day {day.day} gets a listening step after the new words: learners listen, fill the blanks and answer the questions. One dialogue per day.
      </p>

      <div className="actions">
        <button className="btn btn-primary btn-sm" onClick={generate} disabled={gen || !words.length}>
          {gen ? <span className="spin" /> : <Icon name="sparkle" size="sm" />}{gen ? 'Writing…' : 'Generate with AI'}
        </button>
        <button id={base + '-write'} className="btn btn-secondary btn-sm" onClick={() => openForm('new')} aria-expanded={editing === 'new'}><Icon name="pen" size="sm" />Write dialogue</button>
        <button id={base + '-import'} className="btn btn-secondary btn-sm" onClick={() => setImporting(true)} aria-haspopup="dialog"><Icon name="upload" size="sm" />Import JSON</button>
        {left !== null && <span className="hint">{left} AI {left === 1 ? 'generation' : 'generations'} left today</span>}
      </div>
      <div aria-live="polite">
        {gen ? <span className="hint">Writing a dialogue with day {day.day}’s words — this can take up to a minute…</span>
          : genMsg ? <p className="note sm" role="alert">{genMsg}</p>
          : !words.length && <span className="hint">Add words to this day first to generate one.</span>}
      </div>

      {editing === 'new' && (
        <div className="qbnew">
          {items?.some((q) => q.status === 'approved') && <p className="hint" style={{ margin: 0 }}>Saving approves this dialogue and replaces day {day.day}’s current one.</p>}
          <DialogueForm key={'new' + (draft ? 'i' : '')} init={draft} words={words} busy={busy === 'new'} err={formErr} idBase={base + '-new'}
            onSave={saveNew} onCancel={() => closeForm(base + '-write')} />
        </div>
      )}

      {!items ? (
        <div className="sk" style={{ height: 70, borderRadius: 12 }} aria-busy="true" aria-label="Loading dialogues" />
      ) : !sorted.length ? (
        <p className="muted sm" style={{ margin: 0 }}>No dialogue for day {day.day} yet. Generate one, write it, or import it.</p>
      ) : (
        <ul className="qblist dllist">
          {sorted.map((q) => (
            <li key={q.id} className={'qbitem dlitem ' + q.status}>
              <div className="badges">
                <span className={'badge ' + (q.status === 'approved' ? 't-green' : q.status === 'pending' ? 't-amber' : 'pos')}>{STATUS_LABEL[q.status]}</span>
                <span className="muted xs">{SOURCE_LABEL[q.source]}</span>
              </div>
              {editing === q.id ? (
                <DialogueForm init={q.data} edit words={words} busy={busy === q.id} err={formErr} idBase={base + '-f-' + q.id}
                  onSave={(d) => saveEdit(q, d)} onCancel={() => closeForm(base + '-e-' + q.id)} />
              ) : (
                <>
                  <DialogueSummary d={q.data!} />
                  <div className="qbact">
                    <button className="btn btn-secondary btn-sm" onClick={() => setPreview(q)} aria-haspopup="dialog"><Icon name="headphones" size="sm" />Preview</button>
                    {q.status !== 'approved' && <button className="btn btn-secondary btn-sm qbok" onClick={() => setStatus(q, 'approved')} disabled={!!busy}><Icon name="check" size="sm" />Approve</button>}
                    {q.status !== 'rejected' && <button className="btn btn-secondary btn-sm" onClick={() => setStatus(q, 'rejected')} disabled={!!busy}><Icon name="x" size="sm" />Reject</button>}
                    <button id={base + '-e-' + q.id} className="btn btn-ghost btn-sm" onClick={() => openForm(q.id)} disabled={!!busy}><Icon name="edit" size="sm" />Edit</button>
                    <button className="iconbtn sm danger" onClick={() => setDeleting(q)} disabled={!!busy} aria-label={'Delete dialogue: ' + q.data!.title} title="Delete"><Icon name="trash" size="sm" /></button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {importing && (
        <ImportDialogue day={day.day} words={words} onImport={importOne}
          onEdit={(d) => { setImporting(false); openForm('new', d); }}
          onClose={() => { setImporting(false); focusLater(base + '-import'); }} />
      )}
      {preview?.data && (
        <Dialog label={'Preview: ' + preview.data.title} onClose={() => setPreview(null)} wide className="impmodal dlpreview">
          <div className="rowb">
            <h2>Preview · day {day.day}</h2>
            <button className="iconbtn" onClick={() => setPreview(null)} aria-label="Close preview" autoFocus><Icon name="x" /></button>
          </div>
          <ListeningPractice d={preview.data} day={day.day} preview onClose={() => setPreview(null)} />
        </Dialog>
      )}
      {deleting && (
        <ConfirmDialog title="Delete this dialogue?" text={'“' + (deleting.data?.title ?? '') + '” will be removed' + (deleting.status === 'approved' ? ' and day ' + day.day + ' won’t have a listening step.' : '.')}
          confirm="Delete" danger busy={busy === deleting.id} onConfirm={() => remove(deleting)} onClose={() => setDeleting(null)} />
      )}
    </section>
  );
}
