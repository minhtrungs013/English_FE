import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type PhraseBrief, type RolePlaySession } from '../lib/api';
import { speak } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { Icon, PageHead } from '../components/ui';
import { errText } from './Courses';
import { MicButton } from '../components/MicButton';

/**
 * Role-play with AI: a short chat at work where I use up to 3 phrases (the ones given in the URL, or some of mine).
 * AI plays the other person, marks each phrase as I use it right, and reviews my lines at the end.
 */
export function RolePlayPage() {
  const { s, a } = useWB();
  const keys = (s.sel ?? '').split('|').map((k) => k.trim()).filter(Boolean);
  const [play, setPlay] = useState<RolePlaySession | null>(null);
  const [picked, setPicked] = useState<PhraseBrief[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  // The phrases this role-play is about (those in the URL; otherwise the server picks some of mine).
  useEffect(() => {
    let live = true;
    api.phrases().then((r) => { if (live) setPicked(keys.length ? r.items.filter((p) => keys.includes(p.key)) : r.items.filter((p) => p.saved).slice(0, 3)); }).catch(() => { if (live) setPicked([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.sel]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); if (play && !play.done) field.current?.focus(); }, [play]);

  const start = async () => {
    setBusy('Setting up the situation…'); setErr('');
    try { const r = await api.roleplayStart(keys); setPlay(r); speak(r.lines[0]?.text ?? ''); }
    catch (e) { setErr(errText(e)); } finally { setBusy(''); }
  };
  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!play || !text.trim() || busy) return;
    const t = text.trim();
    setBusy('…'); setErr('');
    // My line shows straight away; AI's answer follows.
    setPlay({ ...play, lines: [...play.lines, { from: 'me', text: t, used: [], noteVi: '' }] });
    setText('');
    try {
      const r = await api.roleplaySay(play.id, t);
      setPlay(r);
      const last = r.lines[r.lines.length - 1];
      if (last?.from === 'ai' && !r.done) speak(last.text);
    } catch (ex) { setErr(errText(ex)); setPlay(play); setText(t); } finally { setBusy(''); }
  };
  const finish = async () => {
    if (!play) return;
    setBusy('AI is reviewing your lines…'); setErr('');
    try { setPlay(await api.roleplayFinish(play.id)); } catch (e) { setErr(errText(e)); } finally { setBusy(''); }
  };

  const head = (
    <PageHead title="Role-play with AI" sub="A short conversation at work. Use your phrases — AI plays the other person.">
      <button className="btn btn-secondary" onClick={() => a.go('phrases', { sel: null })}><Icon name="left" size="sm" />Phrases</button>
    </PageHead>
  );

  if (!play) {
    return (
      <>
        {head}
        <div className="card ws-card rp-start">
          <span className="stat-ic t-indigo"><Icon name="users" size="lg" /></span>
          <h2>Practise phrases in a conversation</h2>
          <p className="muted">AI sets up a situation at work and plays the other person. Use the phrases below in your answers — each one is ticked when you use it right. At the end AI checks every line you wrote.</p>
          {!picked ? <div className="sk" style={{ height: 40, width: '100%' }} /> : picked.length ? (
            <div className="badges" style={{ justifyContent: 'center' }}>{picked.map((p) => <span key={p.key} className="pill">{p.phrase}</span>)}</div>
          ) : <p className="muted sm">AI will pick some phrases for you.</p>}
          {err && <p className="bad sm" role="alert">{err}</p>}
          <button className="btn btn-primary btn-lg" onClick={start} disabled={!!busy}>{busy ? <><span className="spin" />{busy}</> : <><Icon name="sparkle" size="sm" />Start the role-play</>}</button>
          <span className="muted xs">Uses one of today’s role-plays.</span>
        </div>
      </>
    );
  }

  const usedAll = play.phrases.every((p) => play.used.includes(p.key));
  return (
    <>
      {head}
      <div className="card ws-card rp-card">
        <div className="rp-scene">
          <b>{play.scenario.title}</b>{play.scenario.titleVi && <span className="muted sm" lang="vi"> · {play.scenario.titleVi}</span>}
          <p className="sm" lang="vi" style={{ margin: '4px 0 0' }}>{play.scenario.settingVi}</p>
          <p className="muted xs" style={{ margin: '4px 0 0' }}>AI: {play.scenario.aiRole} · You: {play.scenario.learnerRole}{play.scenario.learnerRoleVi ? ' (' + play.scenario.learnerRoleVi + ')' : ''}</p>
        </div>
        <div className="rp-goals" aria-label="Phrases to use">
          {play.phrases.map((p) => {
            const on = play.used.includes(p.key);
            return <span key={p.key} className={'rp-goal' + (on ? ' on' : '')} title={p.vi}>{on ? <Icon name="check" size="sm" /> : <Icon name="chat" size="sm" />}{p.phrase}</span>;
          })}
          {!play.done && <span className="muted xs" style={{ marginLeft: 'auto' }}>{play.turnsLeft} {play.turnsLeft === 1 ? 'turn' : 'turns'} left</span>}
        </div>

        <div className="rp-chat" aria-live="polite">
          {play.lines.map((l, k) => (
            <div key={k} className={'rp-line ' + l.from}>
              <div className="rp-bubble">
                {l.text}
                {l.from === 'ai' && <button className="iconbtn sm" onClick={() => speak(l.text)} aria-label="Play"><Icon name="volume" size="sm" /></button>}
              </div>
              {l.from === 'me' && l.used.length > 0 && <span className="rp-used"><Icon name="check" size="sm" />{l.used.map((u) => play.phrases.find((p) => p.key === u)?.phrase ?? u).join(', ')}</span>}
              {l.from === 'me' && l.noteVi && <span className="rp-note" lang="vi">💡 {l.noteVi}</span>}
            </div>
          ))}
          {busy === '…' && <div className="rp-line ai"><div className="rp-bubble muted"><span className="spin" /> typing…</div></div>}
          <div ref={end} />
        </div>

        {play.done ? (
          <div className="rp-review">
            <h3 style={{ margin: 0 }}>{usedAll ? 'You used every phrase!' : 'Role-play finished'}</h3>
            {play.feedback?.summaryVi && <p lang="vi" style={{ margin: 0 }}>{play.feedback.summaryVi}</p>}
            <ul className="ph-list">
              {(play.feedback?.items ?? []).map((it, k) => (
                <li key={k}>
                  <span className={it.ok ? 'ph-right' : 'ph-wrong'}>{it.ok ? '✓' : '✗'} {it.text}</span>
                  {!it.ok && it.corrected !== it.text && <span>→ <b>{it.corrected}</b></span>}
                  {it.noteVi && <span className="muted xs" lang="vi">{it.noteVi}</span>}
                </li>
              ))}
            </ul>
            <div className="ws-actions">
              <button className="btn btn-secondary" onClick={() => a.go('phrases', { sel: null })}>Back to Phrases</button>
              <button className="btn btn-primary" onClick={() => { setPlay(null); setErr(''); }}><Icon name="refresh" size="sm" />New role-play</button>
            </div>
          </div>
        ) : (
          <form className="rp-form" onSubmit={send}>
            <div className="mic-wrap">
              <textarea ref={field} className="input" rows={2} value={text} maxLength={300} placeholder="Your answer in English…" aria-label="Your answer"
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} disabled={!!busy && busy !== '…'} />
              <MicButton value={text} onChange={setText} disabled={!!busy} onError={setErr} />
            </div>
            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              {err && <span className="bad sm" role="alert" style={{ marginRight: 'auto' }}>{err}</span>}
              <button type="button" className="btn btn-ghost" onClick={finish} disabled={!!busy}>{busy && busy !== '…' ? <><span className="spin" />{busy}</> : 'Finish'}</button>
              <button type="submit" className="btn btn-primary" disabled={!text.trim() || !!busy}><Icon name="right" size="sm" />Send</button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
