import { useEffect, useState } from 'react';
import { api, type AdminLibraryWord, type LibraryFields } from '../lib/api';
import type { Word } from '../lib/data';
import { Dialog, errText } from '../pages/Courses';
import { useWB } from '../state/WordbookContext';
import { Icon } from './ui';

type Key = keyof LibraryFields;
const FIELDS: { key: Key; label: string }[] = [
  { key: 'vi', label: 'Vietnamese' }, { key: 'meaning', label: 'Meaning' }, { key: 'pos', label: 'Part of speech' },
  { key: 'ipa', label: 'IPA' }, { key: 'ex', label: 'Example' }, { key: 'family', label: 'Word family' },
  { key: 'syn', label: 'Synonyms' }, { key: 'ant', label: 'Antonyms' }, { key: 'level', label: 'Level' }, { key: 'topic', label: 'Topic' }
];
/** Fields a learner's saved word shares with the library word. */
const WORD_KEYS = ['ipa', 'pos', 'meaning', 'vi', 'ex', 'syn', 'ant', 'level', 'family'] as const;

/** A field value in a form that compares equal however it was stored (family members without their empty keys). */
const norm = (v: unknown): string => JSON.stringify(Array.isArray(v)
  ? v.map((x) => (x && typeof x === 'object' ? { word: x.word, pos: x.pos, vi: x.vi, ex: x.ex || undefined, note: x.note || undefined } : x))
  : v ?? '');
const blank = (v: unknown) => v == null || v === '' || (Array.isArray(v) && !v.length);

function Value({ k, v }: { k: Key; v: LibraryFields[Key] }) {
  if (blank(v)) return <span className="muted">—</span>;
  if (k === 'family') {
    return <ul className="regen-fam">{(v as LibraryFields['family']).map((m) => <li key={m.word + m.pos}><b>{m.word}</b> <span className="muted xs">{m.pos}</span> · <span lang="vi">{m.vi}</span></li>)}</ul>;
  }
  if (Array.isArray(v)) return <>{v.join(', ')}</>;
  return <span lang={k === 'vi' ? 'vi' : undefined}>{String(v)}</span>;
}

/**
 * Admin: AI writes a library word again, as for a new word. Shows what would change next to what is there now;
 * the admin keeps the parts they want. Saving also updates learners' saved copies of the word (fields they didn't edit).
 */
export function LibraryRegen({ id, word, onClose, onSaved }: { id: string; word: string; onClose: () => void; onSaved: (w: AdminLibraryWord) => void }) {
  const { a } = useWB();
  const [data, setData] = useState<{ current: LibraryFields; proposal: LibraryFields } | null>(null);
  const [err, setErr] = useState('');
  const [keep, setKeep] = useState<Set<Key>>(new Set());
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    let live = true;
    setData(null); setErr('');
    api.adminRegenLibrary(id).then((r) => {
      if (!live) return;
      setData(r);
      setKeep(new Set(FIELDS.filter((f) => !blank(r.proposal[f.key]) && norm(r.current[f.key]) !== norm(r.proposal[f.key])).map((f) => f.key)));
    }).catch((e) => { if (live) setErr(errText(e)); });
    return () => { live = false; };
  }, [id, run]);

  const changed = data ? FIELDS.filter((f) => norm(data.current[f.key]) !== norm(data.proposal[f.key])) : [];
  const toggle = (k: Key) => setKeep((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const save = async () => {
    if (!data || !keep.size) return;
    setBusy(true);
    try {
      const patch: Partial<LibraryFields> = {};
      for (const k of keep) (patch as Record<string, unknown>)[k] = data.proposal[k];
      const res = await api.adminPatchLibrary(id, patch);
      // My own saved copy: the same rule as on the server (only fields I left as the library had them).
      const lw = word.toLowerCase();
      a.set((prev) => ({
        words: prev.words.map((w) => {
          if (w.word.toLowerCase() !== lw) return w;
          const next: Word = { ...w };
          for (const k of WORD_KEYS) if (keep.has(k) && (blank(w[k]) || norm(w[k]) === norm(data.current[k]))) (next as unknown as Record<string, unknown>)[k] = data.proposal[k];
          return next;
        })
      }));
      const n = res.synced ?? 0;
      a.showToast('Updated “' + word + '”' + (n ? ' and ' + n + (n === 1 ? ' learner’s saved word.' : ' learners’ saved words.') : '.'));
      onSaved(res);
    } catch (e) { setErr(errText(e)); setBusy(false); }
  };

  return (
    <Dialog label={'Regenerate ' + word} onClose={busy ? () => undefined : onClose} className="adm-modal regen-modal">
      <div className="adm-modal-head">
        <h2>Regenerate “{word}” with AI</h2>
        <p className="muted sm">AI writes the word again, as for a new word. Tick what to keep. Learners who saved it get the new details too, except fields they changed themselves.</p>
        <button type="button" className="iconbtn sm adm-modal-x" onClick={onClose} disabled={busy} aria-label="Close"><Icon name="x" size="sm" /></button>
      </div>
      <div className="adm-modal-body">
        {err && !data ? (
          <div className="stack" style={{ gap: 10, alignItems: 'flex-start' }}>
            <p className="bad sm" role="alert">{err}</p>
            <button className="btn btn-secondary" onClick={() => setRun((x) => x + 1)}><Icon name="refresh" size="sm" />Try again</button>
          </div>
        ) : !data ? (
          <p className="muted sm" role="status"><span className="spin" /> AI is writing “{word}”…</p>
        ) : !changed.length ? (
          <p className="muted sm">AI wrote the same details as the library already has. Nothing to change.</p>
        ) : (
          <>
            <div className="regen-table" role="table" aria-label="Changes">
              <div className="regen-row head" role="row"><span role="columnheader" /><span role="columnheader">Field</span><span role="columnheader">Now</span><span role="columnheader">AI</span></div>
              {changed.map((f) => (
                <label key={f.key} className={'regen-row' + (keep.has(f.key) ? ' on' : '')} role="row">
                  <span role="cell"><input type="checkbox" checked={keep.has(f.key)} onChange={() => toggle(f.key)} aria-label={'Use the AI ' + f.label} /></span>
                  <span role="cell" className="sec-t">{f.label}</span>
                  <span role="cell" className="regen-old"><Value k={f.key} v={data.current[f.key]} /></span>
                  <span role="cell"><Value k={f.key} v={data.proposal[f.key]} /></span>
                </label>
              ))}
            </div>
            {changed.length < FIELDS.length && <p className="muted xs">{FIELDS.length - changed.length} other fields are the same.</p>}
            {err && <p className="bad sm" role="alert">{err}</p>}
          </>
        )}
      </div>
      <div className="mfoot">
        {data && <button className="btn btn-secondary" onClick={() => setRun((x) => x + 1)} disabled={busy} style={{ marginRight: 'auto' }}><Icon name="refresh" size="sm" />Write again</button>}
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !data || !keep.size}>{busy ? <span className="spin" /> : null}Save {keep.size ? keep.size + (keep.size === 1 ? ' change' : ' changes') : ''}</button>
      </div>
    </Dialog>
  );
}
