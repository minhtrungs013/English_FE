import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, type SentenceResult } from '../lib/api';
import type { Word } from '../lib/data';
import { speak } from '../lib/speech';
import { EmptyState, Icon, PageHead } from '../components/ui';
import { useWB } from '../state/WordbookContext';

/** Words per round: due words first, then the newest. */
const ROUND = 10;

const MISTAKE_LABEL: Record<string, string> = {
  tense: 'Tense', agreement: 'Subject–verb', article: 'Article', preposition: 'Preposition', 'word-form': 'Word form',
  'word-meaning': 'Meaning', collocation: 'Collocation', 'word-order': 'Word order', spelling: 'Spelling', punctuation: 'Punctuation', other: 'Other'
};

function pickRound(words: Word[]): Word[] {
  const now = Date.now();
  const due = words.filter((w) => w.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
  const rest = words.filter((w) => w.dueAt > now).sort((a, b) => b.addedAt - a.addedAt);
  return [...due, ...rest].slice(0, ROUND);
}

const tone = (score: number) => (score >= 9 ? 'good' : score >= 6 ? 'ok' : 'bad');

/** Practice → Write a sentence: the learner writes a sentence with each word and AI grades it. */
export function WriteSentence() {
  const { s, a } = useWB();
  const [round, setRound] = useState<Word[]>(() => pickRound(s.words));
  const [i, setI] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<SentenceResult | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const w = round[i];
  const done = i >= round.length;

  useEffect(() => { api.sentenceQuota().then(setQuota).catch(() => setQuota(null)); }, []);
  useEffect(() => { area.current?.focus(); }, [i]);

  const left = quota ? Math.max(0, quota.limit - quota.used) : null;
  const check = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!w || busy) return;
    const t = text.trim();
    if (t.split(/\s+/).length < 3) { setErr('Please write a full sentence (at least 3 words).'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.checkSentence(w.id, t);
      setRes(r); setQuota(r.quota); setSaved(false);
      setScores((x) => [...x, r.score]);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Something went wrong.');
    } finally { setBusy(false); }
  };
  const next = () => { setI(i + 1); setText(''); setRes(null); setErr(''); };
  const retry = () => { setRes(null); setErr(''); setTimeout(() => area.current?.focus(), 0); };
  const saveExample = async (sentence: string) => {
    try { await a.setWordExample(w.id, sentence); setSaved(true); } catch (ex) { a.showToast(ex instanceof Error ? ex.message : 'Couldn’t save.', 'bad'); }
  };
  const avg = useMemo(() => (scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10 : 0), [scores]);

  const head = (
    <PageHead title="Write a sentence" sub="Use each word in your own sentence. AI checks it and shows how to make it better.">
      <button className="btn btn-secondary" onClick={() => a.go('practice')}><Icon name="left" size="sm" />Practice</button>
    </PageHead>
  );

  if (!s.words.length) {
    return <>{head}<EmptyState icon="book" tint="t-indigo" title="No words yet" text="Save some words first, then come back to write sentences with them." /></>;
  }
  if (done) {
    return (
      <>
        {head}
        <div className="card ws-card ws-done">
          <span className="stat-ic t-green"><Icon name="check" size="lg" /></span>
          <h2>Round finished</h2>
          <p className="muted">{scores.length ? 'You checked ' + scores.length + ' sentence' + (scores.length === 1 ? '' : 's') + ' · average score ' + avg + '/10' : 'You skipped every word this time.'}</p>
          <div className="ws-actions">
            <button className="btn btn-secondary" onClick={() => a.go('practice')}>Back to Practice</button>
            <button className="btn btn-secondary" onClick={() => a.go('mistakes')}>My mistakes</button>
            <button className="btn btn-primary" onClick={() => { setRound(pickRound(s.words)); setI(0); setScores([]); }}>New round</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {head}
      <div className="card ws-card">
        <div className="ws-top">
          <span className="muted sm">Word {i + 1} of {round.length}</span>
          {left !== null && <span className={'muted sm' + (left === 0 ? ' ws-bad' : '')}>{left} check{left === 1 ? '' : 's'} left today</span>}
        </div>
        <div className="ws-word">
          <h2>{w.word}</h2>
          <button className="iconbtn sm" onClick={() => speak(w.word)} aria-label={'Hear ' + w.word}><Icon name="volume" size="sm" /></button>
          <span className="badge t-indigo">{w.pos}</span>
        </div>
        {w.vi && <p className="ws-vi">{w.vi}</p>}

        {!res ? (
          <form onSubmit={check} noValidate>
            <label className="label" htmlFor="ws-text">Your sentence with “{w.word}”</label>
            <textarea id="ws-text" ref={area} className="input ws-text" rows={3} maxLength={200} value={text} disabled={busy}
              placeholder={'e.g. a sentence about your work with “' + w.word + '”'}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) check(); }} />
            <div className="ws-meta muted xs"><span>Ctrl + Enter to check</span><span>{text.length}/200</span></div>
            {err && <div className="formerr" role="alert"><Icon name="alert" size="sm" />{err}</div>}
            <div className="ws-actions">
              <button type="button" className="btn btn-ghost" onClick={next} disabled={busy}>Skip</button>
              <button type="submit" className="btn btn-primary" disabled={busy || !text.trim() || left === 0}>
                {busy ? <span className="spin" /> : <Icon name="sparkle" size="sm" />}{busy ? 'Checking…' : 'Check my sentence'}
              </button>
            </div>
          </form>
        ) : (
          <div className="ws-result" aria-live="polite">
            <div className={'ws-score ' + tone(res.score)}>
              <b>{res.score}</b><span>/10</span>
            </div>
            <p className="ws-mine">“{text.trim()}”</p>
            {res.feedbackVi && <p className="ws-fb">{res.feedbackVi}</p>}
            {res.mistakes.length > 0 && (
              <ul className="ws-mistakes">
                {res.mistakes.map((m, k) => (
                  <li key={k}>
                    <span className="badge t-red">{MISTAKE_LABEL[m.type] ?? m.type}</span>
                    <span><s>{m.wrong}</s> → <b>{m.fix}</b>{m.explainVi ? <span className="muted"> · {m.explainVi}</span> : null}</span>
                  </li>
                ))}
              </ul>
            )}
            {res.corrected && res.corrected !== text.trim() && (
              <div className="ws-line">
                <span className="label">Corrected</span>
                <p>{res.corrected}</p>
                <button className="iconbtn sm" onClick={() => speak(res.corrected)} aria-label="Hear the corrected sentence"><Icon name="volume" size="sm" /></button>
              </div>
            )}
            {res.better && (
              <div className="ws-line">
                <span className="label">A natural example</span>
                <p>{res.better}{res.betterVi && <span className="muted sm ws-vi2">{res.betterVi}</span>}</p>
                <button className="iconbtn sm" onClick={() => speak(res.better)} aria-label="Hear the example"><Icon name="volume" size="sm" /></button>
              </div>
            )}
            <div className="ws-extra">
              {res.score >= 8 && !saved && (
                <button className="btn btn-ghost btn-sm" onClick={() => saveExample(res.corrected || text.trim())}><Icon name="plus" size="sm" />Use as my example for “{w.word}”</button>
              )}
              {saved && <span className="sm ws-good"><Icon name="check" size="sm" />Saved as the example</span>}
              {res.lesson && (
                <button className="btn btn-ghost btn-sm" onClick={() => a.openGrammar(res.lesson!.id)}><Icon name="book" size="sm" />Review: {res.lesson.name}</button>
              )}
            </div>
            <div className="ws-actions">
              <button className="btn btn-secondary" onClick={retry} disabled={left === 0}><Icon name="refresh" size="sm" />Write again</button>
              <button className="btn btn-primary" onClick={next}>{i + 1 < round.length ? 'Next word' : 'Finish'}<Icon name="right" size="sm" /></button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
