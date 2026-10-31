import { useEffect, useState } from 'react';
import { api, ApiError, type Quota, type WordUsage } from '../lib/api';
import { speak } from '../lib/speech';
import { Icon } from './ui';

const errText = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback);

/** The usage itself: structures, collocations, notes, mistakes, look-alikes. */
export function UsageBody({ u }: { u: WordUsage }) {
  return (
    <div className="usage-body">
      {u.patterns.length > 0 && (
        <div className="usage-sec">
          <span className="usage-h">Structures</span>
          <ul className="usage-pats">
            {u.patterns.map((p, k) => (
              <li key={k}>
                <b>{p.pattern}</b>
                <span className="usage-ex">
                  <span>“{p.ex}”</span>
                  <button className="iconbtn sm" onClick={() => speak(p.ex)} aria-label={'Play: ' + p.ex}><Icon name="volume" size="sm" /></button>
                </span>
                {p.vi && <span className="muted sm" lang="vi">{p.vi}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {u.collocations.length > 0 && (
        <div className="usage-sec">
          <span className="usage-h">Goes with</span>
          <div className="badges">{u.collocations.map((c) => <span key={c} className="pill">{c}</span>)}</div>
        </div>
      )}
      {u.notes.length > 0 && (
        <div className="usage-sec">
          <span className="usage-h">Notes</span>
          <ul className="usage-notes" lang="vi">{u.notes.map((n, k) => <li key={k}>{n}</li>)}</ul>
        </div>
      )}
      {u.mistakes.length > 0 && (
        <div className="usage-sec">
          <span className="usage-h">Common mistakes</span>
          <ul className="usage-mis">
            {u.mistakes.map((m, k) => (
              <li key={k}>
                <span className="usage-wrong"><Icon name="x" size="sm" /><s>{m.wrong}</s></span>
                <span className="usage-right"><Icon name="check" size="sm" />{m.right}</span>
                {m.why && <span className="muted sm" lang="vi">{m.why}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {u.related.length > 0 && (
        <div className="usage-sec">
          <span className="usage-h">Don’t mix up</span>
          <ul className="usage-rel">
            {u.related.map((r, k) => (
              <li key={k}><b>{r.word}</b>{r.pos && <span className="muted sm"> ({r.pos})</span>}{r.vi && <span lang="vi"> · {r.vi}</span>}{r.note && <span className="muted sm" lang="vi"> — {r.note}</span>}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * "How to use" for a word: shown when someone already has it (shared, free to read). With canWrite, a missing one can be
 * written by AI on request (one of today's Usage allowance). Without it (e.g. inside a course), nothing shows until one exists.
 */
export function UsagePanel({ word, canWrite = true, className = '' }: { word: string; canWrite?: boolean; className?: string }) {
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
      </div>
      {phase === 'loading' || (phase === 'writing' && !u) && !err && quota === null ? (
        <div className="sk" style={{ height: 64, borderRadius: 'var(--r-md)' }} aria-busy="true" aria-label="Loading how to use" />
      ) : u && !stale ? (
        <>
          <UsageBody u={u} />
          <div className="usage-foot">
            {reported ? <span className="muted xs"><Icon name="checkc" size="sm" /> Thanks — an admin will check it.</span> : !reporting && (
              <button className="linkbtn xs" onClick={() => setReporting(true)}>Something wrong? Report it</button>
            )}
          </div>
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
