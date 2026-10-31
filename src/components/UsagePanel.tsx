import { useEffect, useState, type KeyboardEvent } from 'react';
import { api, ApiError, type Quota, type WordUsage } from '../lib/api';
import { speak } from '../lib/speech';
import { Icon } from './ui';

/** True on screens wide enough for a word's details and its usage side by side. */
export function useWide(query = '(min-width: 900px)'): boolean {
  const [wide, setWide] = useState(() => { try { return window.matchMedia(query).matches; } catch { return false; } });
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia(query); } catch { return; }
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return wide;
}

const errText = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback);

type SectionId = 'patterns' | 'collocations' | 'notes' | 'mistakes' | 'related';
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'patterns', label: 'Structures' }, { id: 'collocations', label: 'Goes with' }, { id: 'mistakes', label: 'Mistakes' },
  { id: 'notes', label: 'Notes' }, { id: 'related', label: 'Don’t mix up' }
];
const countOf = (u: WordUsage, id: SectionId) => u[id].length;

/** One part of the usage. */
function Section({ u, id }: { u: WordUsage; id: SectionId }) {
  if (id === 'patterns') {
    return (
      <ul className="usage-pats">
        {u.patterns.map((p, k) => (
          <li key={k}>
            <b className="usage-pat">{p.pattern}</b>
            <span className="usage-ex">
              <span>{p.ex}</span>
              <button className="iconbtn xs" onClick={() => speak(p.ex)} aria-label={'Play: ' + p.ex} title="Play"><Icon name="volume" size="sm" /></button>
            </span>
            {p.vi && <span className="usage-vi" lang="vi">{p.vi}</span>}
          </li>
        ))}
      </ul>
    );
  }
  if (id === 'collocations') return <div className="usage-chips">{u.collocations.map((c) => <span key={c} className="usage-chip">{c}</span>)}</div>;
  if (id === 'notes') return <ul className="usage-notes" lang="vi">{u.notes.map((n, k) => <li key={k}>{n}</li>)}</ul>;
  if (id === 'mistakes') {
    return (
      <ul className="usage-mis">
        {u.mistakes.map((m, k) => (
          <li key={k}>
            <span className="usage-wrong"><Icon name="x" size="sm" /><s>{m.wrong}</s></span>
            <span className="usage-right"><Icon name="check" size="sm" />{m.right}</span>
            {m.why && <span className="usage-vi" lang="vi">{m.why}</span>}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="usage-rel">
      {u.related.map((r, k) => (
        <li key={k}>
          <span><b>{r.word}</b>{r.pos && <span className="muted"> · {r.pos}</span>}{r.vi && <span lang="vi"> · {r.vi}</span>}</span>
          {r.note && <span className="usage-vi" lang="vi">{r.note}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * The usage itself. tabs: one part at a time behind a tab row (keeps panels short); otherwise every part, one after another
 * (the admin's review list).
 */
export function UsageBody({ u, tabs }: { u: WordUsage; tabs?: boolean }) {
  const parts = SECTIONS.filter((x) => countOf(u, x.id) > 0);
  const [on, setOn] = useState<SectionId>(parts[0]?.id ?? 'patterns');
  if (!tabs) {
    return (
      <div className="usage-body">
        {parts.map((x) => <div key={x.id} className="usage-sec"><span className="usage-h">{x.label}</span><Section u={u} id={x.id} /></div>)}
      </div>
    );
  }
  const cur = parts.some((x) => x.id === on) ? on : parts[0]?.id;
  const key = (e: KeyboardEvent, i: number) => {
    const j = e.key === 'ArrowRight' ? (i + 1) % parts.length : e.key === 'ArrowLeft' ? (i - 1 + parts.length) % parts.length : -1;
    if (j < 0) return;
    e.preventDefault();
    setOn(parts[j].id);
    (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className="usage-body">
      <div className="usage-tabs" role="tablist" aria-label="How to use">
        {parts.map((x, i) => (
          <button key={x.id} role="tab" aria-selected={cur === x.id} tabIndex={cur === x.id ? 0 : -1} className={'usage-tab' + (cur === x.id ? ' on' : '')}
            onClick={() => setOn(x.id)} onKeyDown={(e) => key(e, i)}>
            {x.label}<span className="usage-n">{countOf(u, x.id)}</span>
          </button>
        ))}
      </div>
      {cur && <div role="tabpanel" className="usage-panel"><Section u={u} id={cur} /></div>}
    </div>
  );
}

/** "3 structures · 5 word partners · 2 mistakes" for a folded panel. */
const summaryOf = (u: WordUsage) => [
  u.patterns.length && u.patterns.length + (u.patterns.length === 1 ? ' structure' : ' structures'),
  u.collocations.length && u.collocations.length + ' word partners',
  u.mistakes.length && u.mistakes.length + (u.mistakes.length === 1 ? ' common mistake' : ' common mistakes')
].filter(Boolean).join(' · ');

/**
 * "How to use" for a word: shown when someone already has it (shared, free to read). With canWrite, a missing one can be
 * written by AI on request (one of today's Usage allowance). Without it (e.g. inside a course), nothing shows until one exists.
 */
export function UsagePanel({ word, canWrite = true, className = '', folded = false }: { word: string; canWrite?: boolean; className?: string; folded?: boolean }) {
  /** Folded panels (quick looks, course cards) show a one-line summary until opened. */
  const [open, setOpen] = useState(!folded);
  const [u, setU] = useState<WordUsage | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [ai, setAi] = useState(true);
  const [stale, setStale] = useState(false);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'writing' | 'failed'>('loading');
  const [err, setErr] = useState('');
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [reported, setReported] = useState(false);

  useEffect(() => {
    let alive = true;
    setPhase('loading'); setU(null); setErr(''); setReported(false); setReporting(false);
    let timer = 0;
    // A word that was just added gets its usage written in the background: look again a few times.
    const load = (tries: number) => api.usage(word).then((r) => {
      if (!alive) return;
      if (r.writing && !r.usage && tries > 0) { setPhase('writing'); timer = window.setTimeout(() => void load(tries - 1), 3000); return; }
      setU(r.usage); setQuota(r.quota); setAi(r.ai !== false); setStale(!!r.stale); setPhase('ready');
    }).catch((e) => { if (alive) { setErr(errText(e, 'Couldn’t load how to use this word.')); setPhase('failed'); } });
    void load(8);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [word]);

  const write = async () => {
    setPhase('writing'); setErr('');
    try {
      const r = await api.usage(word, true);
      setU(r.usage); setQuota(r.quota); setStale(false);
    } catch (e) {
      setErr(errText(e, 'Couldn’t write how to use this word.'));
    } finally {
      setPhase('ready');
    }
  };
  const report = async () => {
    try { await api.reportUsage(word, note); setReported(true); setReporting(false); } catch (e) { setErr(errText(e, 'Couldn’t send the report.')); }
  };

  const left = quota ? Math.max(0, quota.limit - quota.used) : null;
  // Inside a course (read-only): nothing at all until someone has written it.
  if (!canWrite && (phase !== 'ready' || !u || stale)) return null;

  return (
    <section className={'usage ' + className} aria-label={'How to use ' + word}>
      <div className="usage-top">
        <span className="sec-t">How to use</span>
        {u && !stale && (u.status === 'approved'
          ? <span className="badge t-green"><Icon name="checkc" size="sm" />Checked</span>
          : <span className="badge pos" title="Written by AI, not checked by an admin yet">AI</span>)}
        {u && !stale && folded && (
          <button className="linkbtn sm usage-fold" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Hide' : 'Show'}<Icon name={open ? 'up' : 'down'} size="sm" />
          </button>
        )}
      </div>
      {phase === 'loading' || (phase === 'writing' && !u) && !err && quota === null ? (
        <div className="sk" style={{ height: 64, borderRadius: 'var(--r-md)' }} aria-busy="true" aria-label="Loading how to use" />
      ) : u && !stale ? (
        <>
          {!open ? <p className="muted sm usage-sum">{summaryOf(u)}</p> : <UsageBody u={u} tabs />}
          {open && <div className="usage-foot">
            {reported ? <span className="muted xs"><Icon name="checkc" size="sm" /> Thanks — an admin will check it.</span> : !reporting && (
              <button className="linkbtn xs" onClick={() => setReporting(true)}>Something wrong? Report it</button>
            )}
          </div>}
          {reporting && (
            <div className="usage-report">
              <textarea className="input" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What’s wrong? (optional)" aria-label="What’s wrong" />
              <div className="actions" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setReporting(false)}>Cancel</button>
                <button className="btn btn-secondary btn-sm" onClick={report}>Send report</button>
              </div>
            </div>
          )}
        </>
      ) : !ai ? (
        <p className="muted sm" style={{ margin: 0 }}>There’s no usage for this word yet.</p>
      ) : (
        <div className="usage-empty">
          <span className="muted sm">{stale ? 'The meaning of this word changed — its usage needs updating.' : 'Structures, word partners and common mistakes for “' + word + '”.'}</span>
          <button className="btn btn-secondary btn-sm" onClick={write} disabled={phase === 'writing' || left === 0}>
            {phase === 'writing' ? <><span className="spin" />Writing…</> : <><Icon name="sparkle" size="sm" />{stale ? 'Update' : 'Show how to use'}</>}
          </button>
          {left !== null && <span className="muted xs">{left === 0 ? (quota!.limit ? 'No usage look-ups left today.' : 'Not included in your plan.') : left + ' of ' + quota!.limit + ' left today'}</span>}
        </div>
      )}
      {err && <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{err}</span>}
    </section>
  );
}

/** A link that opens "How to use" for a word right below it (Write a sentence, My mistakes, the chat's word cards). */
export function UsageToggle({ word }: { word: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="usage-toggle">
      <button className="linkbtn sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name={open ? 'up' : 'down'} size="sm" />How to use “{word}”
      </button>
      {open && <UsagePanel word={word} className="usage-card" />}
    </div>
  );
}

/**
 * A small "How to use" button that opens the word's usage in a popup, for places where a panel would get in the
 * way (a review card, a course question). Keys pressed in the popup stay there, so they don't rate or answer.
 */
export function UsageButton({ word, canWrite = true, className }: { word: string; canWrite?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={'btn btn-ghost btn-sm usage-btn' + (className ? ' ' + className : '')} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="book" size="sm" />How to use
      </button>
      {open && (
        <div className="overlay" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } }}>
          <button className="backdrop" onClick={() => setOpen(false)} aria-label="Close" tabIndex={-1} />
          <div className="modal adm-modal usage-modal" role="dialog" aria-modal="true" aria-label={'How to use ' + word}>
            <div className="adm-modal-head">
              <h2>How to use “{word}”</h2>
              <button type="button" className="iconbtn sm adm-modal-x" onClick={() => setOpen(false)} aria-label="Close" autoFocus><Icon name="x" size="sm" /></button>
            </div>
            <div className="adm-modal-body"><UsagePanel word={word} canWrite={canWrite} /></div>
          </div>
        </div>
      )}
    </>
  );
}
