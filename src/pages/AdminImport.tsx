import { useRef, useState } from 'react';
import { api, type LibraryImportItem, type LibraryImportSummary } from '../lib/api';
import { Icon } from '../components/ui';
import { useWB } from '../state/WordbookContext';
import { Dialog, errText } from './Courses';

/** Items sent per request: big files go in parts. */
const PART = 50;
const keyOf = (w: unknown) => (typeof w === 'string' ? w.trim().toLowerCase().replace(/\s+/g, ' ') : '');

/**
 * The items of an import file. Accepts {"items": [...]}, {"words": [...]} or a plain array, and also an AI answer
 * pasted in parts: several {"items": [...]} blocks one after another, with CONTINUE lines and ``` fences.
 */
export function parseImportFile(text: string): unknown[] {
  const clean = text.replace(/^﻿/, '').replace(/```(?:json)?/gi, '').replace(/^\s*CONTINUE\s*$/gim, '').trim();
  const pick = (v: unknown): unknown[] | null => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.items)) return o.items;
      if (Array.isArray(o.words)) return o.words;
    }
    return null;
  };
  try {
    const one = pick(JSON.parse(clean));
    if (one) return one;
  } catch { /* maybe several blocks */ }
  try {
    const merged = clean.replace(/\]\s*\}\s*,?\s*\{\s*"(?:items|words)"\s*:\s*\[/g, ',');
    const all = pick(JSON.parse(merged));
    if (all) return all;
  } catch { /* not JSON */ }
  throw new Error('This file isn’t in the import format: expected {"items": [ ... ]}.');
}

type Row = LibraryImportItem & { n: number };
const STATUS: Record<Row['status'], { label: string; cls: string }> = {
  new: { label: 'New', cls: 't-green' }, fill: { label: 'Fill', cls: 't-blue' }, exists: { label: 'In library', cls: 't-orange' },
  same: { label: 'Nothing to fill', cls: 't-orange' }, repeat: { label: 'Repeated in file', cls: 't-orange' }, invalid: { label: 'Invalid', cls: 't-red' }
};

/** Admin → Library: add words from a JSON file (format in library-import/PROMPT.md). Checks first, then imports. */
export function LibraryImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { a } = useWB();
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [items, setItems] = useState<unknown[] | null>(null);
  const [dup, setDup] = useState<'skip' | 'fill'>('skip');
  // How to use is optional in the file: AI writes the missing ones after the import.
  const [aiUsage, setAiUsage] = useState(true);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [all, setAll] = useState(false);

  const load = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setRows(null); setDone(false); setName(f.name);
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error('The file is too big (20 MB at most).');
      const list = parseImportFile(await f.text());
      if (!list.length) throw new Error('The file has no words.');
      setItems(list);
    } catch (e) { setItems(null); setErr(errText(e)); }
  };

  /** Sends the file in parts. Words the file repeats are marked here, so only their first copy is sent. */
  const run = async (dryRun: boolean) => {
    if (!items) return;
    setErr(''); setBusy(dryRun ? 'Checking' : 'Importing');
    const out: Row[] = [];
    let aiStarted = false, aiNoKey = false;
    const seen = new Set<string>();
    const send: { n: number; item: unknown }[] = [];
    items.forEach((item, n) => {
      const k = keyOf(item && typeof item === 'object' ? (item as Record<string, unknown>).word : '');
      if (k && seen.has(k)) out.push({ n, index: n, word: String((item as Record<string, unknown>).word).trim(), status: 'repeat', errors: [], warnings: [], filled: [] });
      else { if (k) seen.add(k); send.push({ n, item }); }
    });
    try {
      for (let i = 0; i < send.length; i += PART) {
        const part = send.slice(i, i + PART);
        setBusy((dryRun ? 'Checking ' : 'Importing ') + Math.min(i + PART, send.length) + ' / ' + send.length);
        const r = await api.adminImportLibrary(part.map((p) => p.item), dryRun, dup, aiUsage);
        r.items.forEach((x) => out.push({ ...x, n: part[x.index].n }));
        if (r.aiUsage.started) aiStarted = true; else if (r.aiUsage.words && !dryRun && aiUsage) aiNoKey = true;
      }
      out.sort((x, y) => x.n - y.n);
      setRows(out);
      if (!dryRun) {
        setDone(true);
        const c = count(out);
        a.showToast('Imported ' + c.new + (c.new === 1 ? ' word' : ' words') + (c.fill ? ', filled ' + c.fill : '') + '.'
          + (aiStarted ? ' AI is writing How to use for ' + c.ai + ' in the background.' : aiNoKey ? ' AI isn’t set up, so How to use wasn’t written.' : ''), aiNoKey ? 'bad' : undefined);
        onDone();
      }
    } catch (e) { setErr(errText(e)); } finally { setBusy(''); }
  };

  const c = rows ? count(rows) : null;
  const toAdd = c ? c.new + c.fill : 0;
  const shown = rows ? (all ? rows : rows.filter((r) => r.status !== 'new' || r.warnings.length)) : [];
  return (
    <Dialog label="Import words" onClose={busy ? () => undefined : onClose} className="adm-modal imp-lib">
      <div className="adm-modal-head">
        <h2>Import words to the library</h2>
        <p className="muted sm">A JSON file in the format of <code>library-import/PROMPT.md</code>. Nothing is saved until you press Import.</p>
        <button type="button" className="iconbtn sm adm-modal-x" onClick={onClose} disabled={!!busy} aria-label="Close"><Icon name="x" size="sm" /></button>
      </div>
      <div className="adm-modal-body">
        <div className="imp-pick">
          <input ref={file} type="file" accept=".json,application/json,.txt" hidden onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ''; }} />
          <button className="btn btn-secondary" onClick={() => file.current?.click()} disabled={!!busy}><Icon name="upload" size="sm" />{name ? 'Choose another file' : 'Choose a JSON file'}</button>
          {name && items && <span className="sm"><b>{name}</b> · {items.length} {items.length === 1 ? 'word' : 'words'}</span>}
        </div>
        {items && !done && (
          <fieldset className="imp-dup">
            <legend className="label">Words the library already has</legend>
            <label><input type="radio" name="imp-dup" checked={dup === 'skip'} onChange={() => { setDup('skip'); setRows(null); }} /> Skip them</label>
            <label><input type="radio" name="imp-dup" checked={dup === 'fill'} onChange={() => { setDup('fill'); setRows(null); }} /> Fill their empty fields (IPA, example, synonyms, antonyms, word family, How to use) — meaning and Vietnamese stay</label>
          </fieldset>
        )}
        {items && !done && (
          <label className="imp-ai">
            <input type="checkbox" checked={aiUsage} onChange={(e) => setAiUsage(e.target.checked)} />
            <span><b>Write How to use with AI</b> for words that have none (not in the file, not saved yet), in the background after the import.</span>
          </label>
        )}
        {c && (
          <div className="imp-sum" role="status">
            <span className="badge t-green">{c.new} new</span>
            {dup === 'fill' && <span className="badge t-blue">{c.fill} to fill</span>}
            {c.exists + c.same > 0 && <span className="badge t-orange">{c.exists + c.same} already in library</span>}
            {c.repeat > 0 && <span className="badge t-orange">{c.repeat} repeated in file</span>}
            {c.invalid > 0 && <span className="badge t-red">{c.invalid} invalid</span>}
            {c.usage > 0 && <span className="badge">{c.usage} with How to use</span>}
            {aiUsage && c.ai > 0 && <span className="badge t-indigo">{c.ai} How to use by AI</span>}
            {done && <b className="sm hw-ok">Imported.</b>}
          </div>
        )}
        {rows && (
          <>
            <label className="sm imp-all"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show every word (otherwise only problems and warnings)</label>
            {shown.length ? (
              <ul className="imp-rows">
                {shown.map((r) => (
                  <li key={r.n}>
                    <span className="muted xs">#{r.n + 1}</span>
                    <b>{r.word || '—'}</b>
                    <span className={'badge ' + STATUS[r.status].cls}>{STATUS[r.status].label}</span>
                    {r.filled.length > 0 && <span className="muted xs">{r.filled.join(', ')}</span>}
                    {(r.errors.length > 0 || r.warnings.length > 0) && (
                      <span className="imp-why">{[...r.errors, ...r.warnings].join(' ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="muted sm">No problems found.</p>}
          </>
        )}
        {err && <p className="bad sm" role="alert">{err}</p>}
      </div>
      <div className="mfoot">
        <button className="btn btn-secondary" onClick={onClose} disabled={!!busy}>{done ? 'Close' : 'Cancel'}</button>
        {!done && (rows
          ? <button className="btn btn-primary" onClick={() => run(false)} disabled={!!busy || !toAdd}>{busy ? <><span className="spin" />{busy}</> : 'Import ' + toAdd + (toAdd === 1 ? ' word' : ' words')}</button>
          : <button className="btn btn-primary" onClick={() => run(true)} disabled={!!busy || !items}>{busy ? <><span className="spin" />{busy}</> : 'Check'}</button>)}
      </div>
    </Dialog>
  );
}

function count(rows: Row[]): LibraryImportSummary & { usage: number; ai: number } {
  const n = (st: Row['status']) => rows.filter((r) => r.status === st).length;
  return { new: n('new'), fill: n('fill'), exists: n('exists'), same: n('same'), repeat: n('repeat'), invalid: n('invalid'), usage: rows.filter((r) => r.usage || r.filled.includes('usage')).length, ai: rows.filter((r) => r.aiUsage).length };
}
