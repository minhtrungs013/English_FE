import { useState, type ChangeEvent } from 'react';
import { api, type BankItem, type CourseDetail, type ImportRow, type Tense } from '../lib/api';
import { Icon } from '../components/ui';
import { Dialog, errText } from './Courses';
import { TENSES } from './CourseQuestions';
import { useWB } from '../state/WordbookContext';

export const IMPORT_COLUMNS = ['type', 'word', 'tense', 'sentence', 'answer', 'choice1', 'choice2', 'choice3', 'choice4', 'accept', 'explain'] as const;
/** The server takes at most this many rows per import. */
const MAX_ROWS = 100;
const MAX_FILE = 1024 * 1024;

/* ---------- templates ---------- */

/** An example sentence for each tense, to be replaced by the owner. */
const SAMPLE: Record<Tense, (w: string) => string> = {
  'present-simple': (w) => 'Every Monday our team ___ (' + w + ') the weekly report.',
  'present-continuous': (w) => 'Right now the team ___ (' + w + ') the test data.',
  'present-perfect': (w) => 'We ___ just (' + w + ') the new release.',
  'past-simple': (w) => 'Yesterday we ___ (' + w + ') the hotfix.',
  'past-continuous': (w) => 'At 9 pm last night I ___ (' + w + ') the server logs.',
  'future-simple': (w) => 'Don’t worry, I ___ (' + w + ') it tomorrow.',
  'going-to': (w) => 'Next sprint we ___ (' + w + ') the payment module.'
};
type TemplateRow = Record<string, string>;

/** perWord rows for each word (typed and multiple choice in turn), cycling the chosen tenses; with a day column for the whole course. */
function templateRows(entries: { day?: number; word: string }[], perWord: number, tenses: Tense[]): TemplateRow[] {
  const blank = { answer: '', choice1: '', choice2: '', choice3: '', choice4: '', accept: '', explain: '' };
  const ts = tenses.length ? tenses : TENSES;
  let k = 0;
  return entries.flatMap(({ day, word }) => Array.from({ length: perWord }, (_, i) => {
    const tense = ts[k++ % ts.length];
    return { ...(day ? { day: String(day) } : {}), type: i % 2 ? 'multi' : 'typed', word, tense, sentence: SAMPLE[tense](word), ...blank };
  }));
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

/** CSV with a UTF-8 BOM so Excel shows Vietnamese correctly. */
function templateCsv(rows: TemplateRow[], course: boolean): string {
  const cols = course ? ['day', ...IMPORT_COLUMNS] : [...IMPORT_COLUMNS];
  const lines = [cols.join(','), ...rows.map((r) => cols.map((k) => csvCell(r[k] ?? '')).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- parsing ---------- */

/** Comma, unless the header line clearly uses semicolons or tabs (Excel in some locales saves CSV with ";"). */
function delimiterOf(text: string): string {
  const line = text.slice(0, text.search(/\r|\n/) === -1 ? undefined : text.search(/\r|\n/));
  const count = (ch: string) => line.split(ch).length - 1;
  const best = [',', ';', '\t'].sort((x, y) => count(y) - count(x))[0];
  return count(best) > 0 ? best : ',';
}

/** RFC 4180: quoted fields, "" inside quotes, delimiters and newlines inside quotes, CRLF or LF, a leading BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delim = delimiterOf(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
      continue;
    }
    if (ch === '"' && !started) { quoted = true; started = true; continue; }
    if (ch === delim) { row.push(field); field = ''; started = false; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      started = false;
      continue;
    }
    field += ch;
    started = true;
  }
  if (started || field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** n: the row number the owner sees (the spreadsheet row for CSV, the item number for JSON). */
interface Parsed { n: number; row: ImportRow; bad?: string }

function fromCsv(text: string): Parsed[] {
  const recs = parseCsv(text);
  const hi = recs.findIndex((r) => r.some((f) => f.trim()));
  if (hi < 0) throw new Error('The file is empty.');
  const head = recs[hi].map((h) => h.trim().toLowerCase());
  if (!(head.includes('type') || head.includes('kind')) || !head.includes('word') || !(head.includes('sentence') || head.includes('prompt'))) {
    throw new Error('The first row must be the header: ' + IMPORT_COLUMNS.join(',') + '. Start from the template.');
  }
  const out: Parsed[] = [];
  recs.slice(hi + 1).forEach((cells, k) => {
    if (!cells.some((f) => f.trim())) return;
    const row: ImportRow = {};
    head.forEach((h, j) => { if (h) row[h] = (cells[j] ?? '').trim(); });
    // Spreadsheet row: the header is row hi + 1.
    out.push({ n: hi + k + 2, row });
  });
  return out;
}

function fromJson(text: string): Parsed[] {
  let data: unknown;
  try { data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); } catch { throw new Error('This isn’t valid JSON.'); }
  const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : null;
  if (!list) throw new Error('The JSON must be an array of rows, or { "items": [...] }.');
  return list.map((it, k) => {
    if (!it || typeof it !== 'object' || Array.isArray(it)) return { n: k + 1, row: {}, bad: 'Each row must be an object.' };
    const row: ImportRow = {};
    for (const [key, v] of Object.entries(it as Record<string, unknown>)) row[key.toLowerCase()] = v;
    return { n: k + 1, row };
  });
}

/* ---------- checks (the same rules as the server) ---------- */

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : str(v) ? str(v).split('|').map((x) => x.trim()).filter(Boolean) : []);

interface View { day: number | null; kind: 'typed' | 'multi' | ''; word: string; tense: string; sentence: string; answer: string; choices: string[]; accept: string[] }

function viewOf(r: ImportRow): View {
  const t = str(r.kind ?? r.type).toLowerCase();
  const kind = ['tense', 'typed', 'type'].includes(t) ? 'typed' : ['tensechoice', 'multi', 'choice', 'mc', 'multiple'].includes(t) ? 'multi' : '';
  const answer = str(r.answer);
  const choices = kind !== 'multi' ? [] : Array.isArray(r.choices) ? strList(r.choices) : [r.choice1, r.choice2, r.choice3, r.choice4].map(str).filter(Boolean);
  if (kind === 'multi' && choices.length === 3 && answer && !choices.includes(answer)) choices.push(answer);
  const d = Number(str(r.day));
  return { day: Number.isInteger(d) && d > 0 ? d : null, kind, word: str(r.word), tense: str(r.tense), sentence: str(r.prompt ?? r.sentence), answer, choices, accept: strList(r.accept) };
}

function problemOf(v: View, wordsByDay: Map<number, Map<string, string>>, day: number, course: boolean): string {
  const d = course ? v.day : day;
  if (course && !v.day) return 'The day is missing (1–' + Math.max(...wordsByDay.keys(), 30) + ').';
  const words = d ? wordsByDay.get(d) : undefined;
  if (!words || !words.size) return 'Day ' + d + ' has no words yet.';
  if (!v.kind) return 'Type must be “typed” or “multi”.';
  if (!v.word) return 'The word is empty.';
  if (!words.has(v.word.toLowerCase())) return '“' + v.word + '” isn’t one of day ' + d + '’s words.';
  if (v.tense && !(TENSES as string[]).includes(v.tense)) return 'Unknown tense “' + v.tense + '”.';
  if ((v.sentence.match(/___/g) ?? []).length !== 1) return 'The sentence needs exactly one blank (___).';
  if (!v.answer) return 'The answer is empty.';
  if (v.kind === 'multi' && (new Set(v.choices.map((x) => x.toLowerCase())).size !== 4 || !v.choices.includes(v.answer))) {
    return 'Needs 4 different choices, one of them the answer.';
  }
  if (v.sentence.length > 1500 || v.answer.length > 80 || v.choices.some((x) => x.length > 80)) return 'Text is too long.';
  return '';
}

type Status = 'ready' | 'bad' | 'added';
interface Line extends Parsed { view: View; status: Status; reason: string }

/** The most rows one file may import (sent in batches of MAX_ROWS per day). */
const MAX_FILE_ROWS = 3000;

/**
 * Import tense questions from a CSV or JSON file — for one day, or for the whole course (a "day" column) — with a
 * preview and checks before anything is saved. The template follows the chosen questions per word and tenses.
 */
export function ImportQuestions({ c, day, words, perWord, tenses, onImported, onDayImported, onClose }: {
  c: CourseDetail; day: number; words: string[]; perWord: number; tenses: Tense[];
  onImported: (items: BankItem[]) => void; onDayImported?: (day: number, items: BankItem[]) => void; onClose: () => void;
}) {
  const { a } = useWB();
  const [scope, setScope] = useState<'day' | 'course'>('day');
  const [file, setFile] = useState('');
  const [lines, setLines] = useState<Line[] | null>(null);
  const [parseErr, setParseErr] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState('');
  const base = 'qi-' + day;
  const course = scope === 'course';
  const wordsByDay = new Map(c.days.map((d) => [d.day, new Map((d.words ?? []).map((w) => [w.word.toLowerCase(), w.word]))]));
  if (!course) wordsByDay.set(day, new Map(words.map((w) => [w.toLowerCase(), w])));
  const courseEntries = c.days.flatMap((d) => (d.words ?? []).map((w) => ({ day: d.day, word: w.word })));
  const daysWithWords = new Set(courseEntries.map((x) => x.day)).size;

  const switchScope = (s: 'day' | 'course') => { setScope(s); setLines(null); setFile(''); setParseErr(''); setResult(''); };

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // so picking the same file again (after fixing it) works
    if (!f) return;
    setFile(f.name);
    setResult('');
    setParseErr('');
    setLines(null);
    if (f.size > MAX_FILE * (course ? 5 : 1)) { setParseErr('This file is too big (over ' + (course ? 5 : 1) + ' MB).'); return; }
    try {
      const text = await f.text();
      const json = /\.json$/i.test(f.name) || /^﻿?\s*[[{]/.test(text);
      const parsed = json ? fromJson(text) : fromCsv(text);
      if (!parsed.length) { setParseErr('No rows found under the header.'); return; }
      if (parsed.length > MAX_FILE_ROWS) { setParseErr('Too many rows (' + parsed.length + '). Import at most ' + MAX_FILE_ROWS + ' at a time.'); return; }
      setLines(parsed.map((p) => {
        const view = viewOf(p.row);
        const reason = p.bad ?? problemOf(view, wordsByDay, day, course);
        return { ...p, view, status: reason ? 'bad' : 'ready', reason };
      }));
    } catch (err) {
      setParseErr(errText(err, 'Couldn’t read this file.'));
    }
  };

  const ready = lines?.filter((l) => l.status === 'ready') ?? [];
  const bad = lines?.filter((l) => l.status === 'bad').length ?? 0;
  const tooMany = !course && ready.length > MAX_ROWS;

  const run = async () => {
    if (!ready.length || tooMany || busy) return;
    // Rows by day, sent in batches of at most MAX_ROWS.
    const groups = new Map<number, Line[]>();
    for (const l of ready) { const d = course ? l.view.day! : day; groups.set(d, [...(groups.get(d) ?? []), l]); }
    const batches: { d: number; rows: Line[] }[] = [];
    for (const [d, rows] of [...groups].sort((x, y) => x[0] - y[0])) for (let i = 0; i < rows.length; i += MAX_ROWS) batches.push({ d, rows: rows.slice(i, i + MAX_ROWS) });
    const failed = new Map<number, string>();
    const done = new Set<number>();
    let added = 0;
    try {
      for (const [k, b] of batches.entries()) {
        setBusy(batches.length > 1 ? 'Importing day ' + b.d + ' (' + (k + 1) + '/' + batches.length + ')…' : 'Importing…');
        try {
          const r = await api.importQuestions(c.id, b.d, b.rows.map((l) => { const { day: _d, ...row } = l.row as ImportRow & { day?: unknown }; return row; }));
          added += r.added;
          for (const x of r.errors) if (b.rows[x.index]) failed.set(b.rows[x.index].n, x.message);
          for (const l of b.rows) if (!failed.has(l.n)) done.add(l.n);
          if (b.d === day) onImported(r.items);
          else onDayImported?.(b.d, r.items);
        } catch (err) {
          for (const l of b.rows) failed.set(l.n, errText(err, 'Couldn’t import this row.'));
        }
      }
      const next = (lines ?? []).map((l): Line => {
        if (l.status !== 'ready') return l;
        const msg = failed.get(l.n);
        return msg ? { ...l, status: 'bad', reason: msg } : done.has(l.n) ? { ...l, status: 'added', reason: '' } : l;
      });
      setLines(next);
      const skipped = next.filter((l) => l.status === 'bad').length;
      const text = 'Imported ' + added + (added === 1 ? ' question' : ' questions') + (course ? ' into ' + groups.size + (groups.size === 1 ? ' day' : ' days') : '')
        + (skipped ? ' · ' + skipped + (skipped === 1 ? ' row' : ' rows') + ' skipped' : '');
      a.showToast(text, added ? 'ok' : 'bad');
      if (!skipped) onClose();
      else setResult(text + '. Fix the rows marked below and import them again.');
    } finally {
      setBusy('');
    }
  };

  const fname = course ? 'course-questions' : 'day-' + day + '-questions';
  const rows = course ? templateRows(courseEntries, perWord, tenses) : templateRows(words.map((w) => ({ word: w })), perWord, tenses);
  const count = course ? courseEntries.length : words.length;
  return (
    <Dialog label={course ? 'Import questions for the whole course' : 'Import questions for day ' + day} onClose={onClose} wide className="impmodal">
      <h2>Import questions · {course ? 'whole course' : 'day ' + day}</h2>
      <div className="seg" role="group" aria-label="What to import" style={{ alignSelf: 'flex-start' }}>
        <button className={!course ? 'on' : ''} aria-pressed={!course} onClick={() => switchScope('day')} disabled={!!busy}>Day {day}</button>
        <button className={course ? 'on' : ''} aria-pressed={course} onClick={() => switchScope('course')} disabled={!!busy || !daysWithWords}>Whole course ({daysWithWords} {daysWithWords === 1 ? 'day' : 'days'})</button>
      </div>
      <p className="sm">
        Fill in a template, then upload it. Imported questions are <b>approved straight away</b> and apply to homework nobody has handed in yet.
      </p>

      <div className="impstep">
        <span className="label">1. Download a template</span>
        <span className="hint">
          {perWord} example {perWord === 1 ? 'row' : 'rows'} for each of the {course ? 'course’s' : 'day’s'} {count} {count === 1 ? 'word' : 'words'}
          {' '}({rows.length} rows; typed and multiple choice in turn, using the tenses you picked){course ? ', with a day column' : ''} — replace the sentences and fill in the answers.
          Change “Questions per word” and the tenses above to get a different template.
        </span>
        <div className="actions">
          <button className="btn btn-secondary btn-sm" onClick={() => download(fname + '.csv', templateCsv(rows, course), 'text/csv;charset=utf-8')} autoFocus>
            <Icon name="download" size="sm" />Download CSV template
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => download(fname + '.json', JSON.stringify(rows, null, 2) + '\n', 'application/json')}>
            <Icon name="download" size="sm" />Download JSON template
          </button>
        </div>
        <details className="impguide">
          <summary>What goes in each column</summary>
          <ul>
            {course && <li><b>day</b> — the course day (1–{c.days.length}); the word must be one of that day’s words.</li>}
            <li><b>type</b> — <code>typed</code> (learners type the verb) or <code>multi</code> (4 choices).</li>
            <li><b>word</b> — {course ? 'one of that day’s words.' : <>one of this day’s words: {words.join(', ')}.</>}</li>
            <li><b>tense</b> — optional: {TENSES.join(', ')}.</li>
            <li><b>sentence</b> — exactly one <code>___</code>; for typed, put the base verb in brackets after it: <i>We ___ (deploy) it yesterday.</i></li>
            <li><b>answer</b> — the right form, e.g. <i>deployed</i>.</li>
            <li><b>choice1–choice4</b> — multi only: 4 different choices, one of them the answer.</li>
            <li><b>accept</b> — optional other right answers, separated by <code>|</code>.</li>
            <li><b>explain</b> — optional explanation in Vietnamese.</li>
          </ul>
        </details>
      </div>

      <div className="impstep">
        <label className="label" htmlFor={base + '-file'}>2. Upload the filled-in file</label>
        <input id={base + '-file'} type="file" className="input fileinput" accept=".csv,.json,text/csv,application/json" onChange={pick}
          aria-describedby={base + '-fh'} disabled={!!busy} />
        <span className="hint" id={base + '-fh'}>CSV or JSON, {course ? 'up to ' + MAX_FILE_ROWS + ' rows (sent day by day).' : 'up to ' + MAX_ROWS + ' rows at a time.'}</span>
        {parseErr && <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{file ? file + ': ' : ''}{parseErr}</span>}
      </div>

      <div aria-live="polite" className="c-sr">
        {lines ? file + ': ' + lines.length + (lines.length === 1 ? ' row' : ' rows') + ', ' + ready.length + ' ready, ' + bad + ' with problems.' : ''}
      </div>

      {lines && (
        <div className="impstep">
          <div className="rowb" style={{ flexWrap: 'wrap' }}>
            <span className="label">3. Check and import</span>
            <span className="muted sm">
              <b className="impfile">{file}</b> · {ready.length} ready{bad ? ' · ' : ''}{bad > 0 && <span className="impbadn">{bad} with problems</span>}
            </span>
          </div>
          <div className="impwrap">
            <table className="imptbl">
              <caption className="c-sr">Rows in {file}</caption>
              <thead>
                <tr>
                  <th scope="col">Row</th><th scope="col">Check</th>{course && <th scope="col">Day</th>}<th scope="col">Type</th><th scope="col">Word</th>
                  <th scope="col">Sentence</th><th scope="col">Answer</th><th scope="col">Choices</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.n} className={l.status}>
                    <th scope="row" data-label="Row"><span>{l.n}</span></th>
                    <td data-label="Check">
                      {l.status === 'ready' ? <span><span className="badge t-green"><Icon name="check" size="sm" />Ready</span></span>
                        : l.status === 'added' ? <span><span className="badge t-blue"><Icon name="checkc" size="sm" />Imported</span></span>
                        : <span className="impwhy"><Icon name="alert" size="sm" />{l.reason}</span>}
                    </td>
                    {course && <td data-label="Day"><span>{l.view.day ?? '—'}</span></td>}
                    <td data-label="Type"><span>{l.view.kind || str(l.row.type) || '—'}{l.view.tense && <span className="muted xs"> · {l.view.tense}</span>}</span></td>
                    <td data-label="Word"><span>{l.view.word || '—'}</span></td>
                    <td data-label="Sentence" className="impsent"><span>{l.view.sentence || '—'}</span></td>
                    <td data-label="Answer"><span>{l.view.answer || '—'}{l.view.accept.length > 0 && <span className="muted xs"> (also {l.view.accept.join(', ')})</span>}</span></td>
                    <td data-label="Choices"><span>{l.view.choices.length ? l.view.choices.join(' · ') : '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tooMany && <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{ready.length} rows are ready — import at most {MAX_ROWS} at a time. Split the file.</span>}
        </div>
      )}

      {result && <p className="note sm" role="status">{result}</p>}
      {busy && <p className="hint" aria-live="polite" style={{ margin: 0 }}><span className="spin" /> {busy}</p>}

      <div className="mfoot">
        <button className="btn btn-secondary" onClick={onClose} disabled={!!busy}>{lines?.some((l) => l.status === 'added') ? 'Done' : 'Cancel'}</button>
        <button className="btn btn-primary" onClick={run} disabled={!ready.length || tooMany || !!busy}>
          <Icon name="upload" size="sm" />{busy ? 'Importing…' : 'Import ' + ready.length + (ready.length === 1 ? ' valid row' : ' valid rows')}
        </button>
      </div>
    </Dialog>
  );
}
