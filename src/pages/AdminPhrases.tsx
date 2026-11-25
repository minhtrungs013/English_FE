import { useEffect, useRef, useState } from 'react';
import { api, type AdminPhrase, type PhraseImportItem } from '../lib/api';
import { FUNCTION_LABEL } from '../lib/phrases';
import { EmptyState, Icon } from '../components/ui';
import { useWB } from '../state/WordbookContext';
import { parseImportFile } from './AdminImport';
import { ConfirmDialog, Dialog, errText } from './Courses';

/** Items sent per request. */
const PART = 50;
const STATUS: Record<PhraseImportItem['status'], { label: string; cls: string }> = {
  new: { label: 'New', cls: 't-green' }, replace: { label: 'Replace', cls: 't-blue' }, exists: { label: 'Already there', cls: 't-orange' },
  repeat: { label: 'Repeated in file', cls: 't-orange' }, invalid: { label: 'Invalid', cls: 't-red' }
};

/** Admin → Phrases: add phrases from a JSON file (format in phrase-import/PROMPT.md). Checks first, then imports. */
function PhraseImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { a } = useWB();
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [items, setItems] = useState<unknown[] | null>(null);
  const [dup, setDup] = useState<'skip' | 'replace'>('skip');
  const [rows, setRows] = useState<PhraseImportItem[] | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setRows(null); setDone(false); setName(f.name);
    try { const list = parseImportFile(await f.text()); if (!list.length) throw new Error('The file has no phrases.'); setItems(list); }
    catch (e) { setItems(null); setErr(errText(e)); }
  };
  const run = async (dryRun: boolean) => {
    if (!items) return;
    setErr(''); setBusy(dryRun ? 'Checking' : 'Importing');
    const out: PhraseImportItem[] = [];
    try {
      for (let i = 0; i < items.length; i += PART) {
        setBusy((dryRun ? 'Checking ' : 'Importing ') + Math.min(i + PART, items.length) + ' / ' + items.length);
        const r = await api.adminImportPhrases(items.slice(i, i + PART), dryRun, dup);
        out.push(...r.items.map((x) => ({ ...x, index: x.index + i })));
      }
      setRows(out);
      if (!dryRun) {
        setDone(true);
        a.showToast('Imported ' + out.filter((x) => x.status === 'new' || x.status === 'replace').length + ' phrases.');
        onDone();
      }
    } catch (e) { setErr(errText(e)); } finally { setBusy(''); }
  };
  const n = (st: PhraseImportItem['status']) => rows?.filter((r) => r.status === st).length ?? 0;
  const toAdd = n('new') + n('replace');
  return (
    <Dialog label="Import phrases" onClose={busy ? () => undefined : onClose} className="adm-modal imp-lib">
      <div className="adm-modal-head">
        <h2>Import phrases</h2>
        <p className="muted sm">A JSON file in the format of <code>phrase-import/PROMPT.md</code>. Nothing is saved until you press Import.</p>
        <button type="button" className="iconbtn sm adm-modal-x" onClick={onClose} disabled={!!busy} aria-label="Close"><Icon name="x" size="sm" /></button>
      </div>
      <div className="adm-modal-body">
        <div className="imp-pick">
          <input ref={file} type="file" accept=".json,application/json,.txt" hidden onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ''; }} />
          <button className="btn btn-secondary" onClick={() => file.current?.click()} disabled={!!busy}><Icon name="upload" size="sm" />{name ? 'Choose another file' : 'Choose a JSON file'}</button>
          {name && items && <span className="sm"><b>{name}</b> · {items.length} phrases</span>}
        </div>
        {items && !done && (
          <fieldset className="imp-dup">
            <legend className="label">Phrases that already exist</legend>
            <label><input type="radio" name="ph-dup" checked={dup === 'skip'} onChange={() => { setDup('skip'); setRows(null); }} /> Skip them</label>
            <label><input type="radio" name="ph-dup" checked={dup === 'replace'} onChange={() => { setDup('replace'); setRows(null); }} /> Replace them with the file’s</label>
          </fieldset>
        )}
        {rows && (
          <>
            <div className="imp-sum" role="status">
              <span className="badge t-green">{n('new')} new</span>
              {n('replace') > 0 && <span className="badge t-blue">{n('replace')} to replace</span>}
              {n('exists') > 0 && <span className="badge t-orange">{n('exists')} already there</span>}
              {n('repeat') > 0 && <span className="badge t-orange">{n('repeat')} repeated</span>}
              {n('invalid') > 0 && <span className="badge t-red">{n('invalid')} invalid</span>}
              {done && <b className="sm hw-ok">Imported.</b>}
            </div>
            <ul className="imp-rows">
              {rows.filter((r) => r.status !== 'new' || r.warnings.length).map((r) => (
                <li key={r.index}>
                  <span className="muted xs">#{r.index + 1}</span><b>{r.phrase || '—'}</b>
                  <span className={'badge ' + STATUS[r.status].cls}>{STATUS[r.status].label}</span>
                  {(r.errors.length > 0 || r.warnings.length > 0) && <span className="imp-why">{[...r.errors, ...r.warnings].join(' ')}</span>}
                </li>
              ))}
              {!rows.some((r) => r.status !== 'new' || r.warnings.length) && <li className="muted sm">No problems found.</li>}
            </ul>
          </>
        )}
        {err && <p className="bad sm" role="alert">{err}</p>}
      </div>
      <div className="mfoot">
        <button className="btn btn-secondary" onClick={onClose} disabled={!!busy}>{done ? 'Close' : 'Cancel'}</button>
        {!done && (rows
          ? <button className="btn btn-primary" onClick={() => run(false)} disabled={!!busy || !toAdd}>{busy ? <><span className="spin" />{busy}</> : 'Import ' + toAdd + ' phrases'}</button>
          : <button className="btn btn-primary" onClick={() => run(true)} disabled={!!busy || !items}>{busy ? <><span className="spin" />{busy}</> : 'Check'}</button>)}
      </div>
    </Dialog>
  );
}

export function AdminPhrases() {
  const { a } = useWB();
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ total: number; items: AdminPhrase[] } | null>(null);
  const [err, setErr] = useState('');
  const [importing, setImporting] = useState(false);
  const [del, setDel] = useState<AdminPhrase | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => { api.adminPhrases(q.trim()).then((r) => { if (live) { setData(r); setErr(''); } }).catch((e) => { if (live) setErr(errText(e)); }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, tick]);
  const remove = async (p: AdminPhrase) => {
    setBusy(true);
    try { await api.adminDeletePhrase(p.key); a.showToast('Deleted “' + p.phrase + '”.'); setDel(null); setTick((x) => x + 1); }
    catch (e) { a.showToast(errText(e), 'bad'); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="adm-tools">
        <div className="search-wrap" style={{ marginBottom: 0 }}>
          <span className="inicon"><Icon name="search" /></span>
          <input className="input withicon" type="search" placeholder="Search a phrase or a Vietnamese meaning" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search phrases" />
        </div>
        <button className="btn btn-secondary" onClick={() => setImporting(true)}><Icon name="upload" size="sm" />Import JSON</button>
      </div>
      {err ? <EmptyState icon="alert" tint="t-red" title="Can’t load the phrases" text={err} /> : !data ? <div className="sk" style={{ height: 200 }} /> : (
        <div className="adm-table" role="table" aria-label="Phrases" style={{ marginTop: 12 }}>
          <div className="adm-row head ph-adm" role="row">
            <span role="columnheader">Phrase</span><span role="columnheader">Vietnamese</span><span role="columnheader">Kind</span><span role="columnheader">Practice</span><span role="columnheader">Source</span><span role="columnheader" />
          </div>
          {data.items.map((p) => (
            <div key={p.key} className="adm-row ph-adm" role="row">
              <span role="cell" className="adm-main"><b>{p.phrase}</b><span className="muted xs">{p.pattern || FUNCTION_LABEL[p.function] || ''} · {p.level}</span></span>
              <span role="cell" className="sm" lang="vi">{p.vi}</span>
              <span role="cell" className="muted sm">{p.kind === 'slot' ? 'Slot' : 'Conversation'}</span>
              <span role="cell" className="muted sm">{p.kind === 'slot' ? p.templates + ' templates · ' + p.fillers + ' words' : '—'}</span>
              <span role="cell" className="muted sm">{p.source}</span>
              <span role="cell" className="adm-act">
                <button className="iconbtn sm" onClick={() => a.go('phrases', { sel: p.key })} aria-label={'Open ' + p.phrase} title="Open"><Icon name="eye" size="sm" /></button>
                <button className="iconbtn sm danger" onClick={() => setDel(p)} aria-label={'Delete ' + p.phrase} title="Delete"><Icon name="trash" size="sm" /></button>
              </span>
            </div>
          ))}
          {!data.items.length && <div className="muted sm" style={{ padding: 14 }}>No phrases.</div>}
        </div>
      )}
      {importing && <PhraseImport onClose={() => setImporting(false)} onDone={() => setTick((x) => x + 1)} />}
      {del && <ConfirmDialog title={'Delete “' + del.phrase + '”?'} danger busy={busy} confirm="Delete" text="It disappears from Phrases and from everyone’s practice. Copies people saved to My Vocabulary stay." onConfirm={() => remove(del)} onClose={() => setDel(null)} />}
    </>
  );
}
