import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type PhraseDrill } from '../lib/api';
import { DRILL_TITLE, TENSE_HINT, firstLetters, gradeDrill, hidesPhrase, type PhraseTense } from '../lib/phrases';
import { recordAnswer } from '../lib/practice';
import { speak } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { EmptyState, Icon, PageHead } from '../components/ui';
import { errText } from './Courses';
import { PatternChips } from './Phrases';

const SIZE = 10;
type Verdict = 'right' | 'close' | 'wrong';
interface Done { d: PhraseDrill; verdict: Verdict; given: string }

/**
 * Practice → Phrases: each phrase used with a word — one of mine (to use it in a new way) or a new library word (to learn
 * it): translate, fill in the phrase, make it a question; conversation phrases by situation, reply and meaning.
 * A wrong one comes back once at the end. Results count for the phrase, and for my word when one of mine was used.
 */
export function PhrasePractice() {
  const { s, a } = useWB();
  const key = s.sel;
  const [items, setItems] = useState<PhraseDrill[] | null>(null);
  const [err, setErr] = useState('');
  const [i, setI] = useState(0);
  const [input, setInput] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [given, setGiven] = useState('');
  /** Hints asked for on this question: 1 = first letters, 2 = the phrase and its pattern. */
  const [hint, setHint] = useState(0);
  /** Set when the answer was right except for its tense. */
  const [badTense, setBadTense] = useState<PhraseTense | null>(null);
  const [done, setDone] = useState<Done[]>([]);
  const [run, setRun] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    setItems(null); setErr(''); setI(0); setDone([]); setInput(''); setVerdict(null);
    api.phraseSession(SIZE, key ?? undefined).then((r) => { if (live) setItems(r.items); }).catch((e) => { if (live) setErr(errText(e)); });
    return () => { live = false; };
  }, [key, run]);

  const d = items?.[i];
  const finished = !!items && i >= items.length;
  useEffect(() => { if (d && !d.choices.length && !verdict) field.current?.focus(); else if (verdict) nextBtn.current?.focus(); }, [d, verdict]);

  const check = (answer: string) => {
    if (!d || verdict) return;
    const g = gradeDrill(d, answer);
    const v = g.verdict;
    setBadTense(g.tense ?? null);
    setVerdict(v); setGiven(answer);
    const ok = v !== 'wrong';
    const retry = d.id.endsWith(':again');
    if (!retry) {
      setDone((x) => [...x, { d, verdict: v, given: answer }]);
      void api.phraseResults([{ key: d.key, ok }]).catch(() => undefined);
      // My word was used in a sentence I wrote: it counts like a translation of it.
      if (d.filler?.mine && (d.type === 'translate' || d.type === 'transform')) recordAnswer(d.filler.wordId, 'trans', ok);
    }
    if (!ok && !retry) setItems((list) => list && [...list, { ...d, id: d.id + ':again' }]);
    if (ok) speak(d.choices.length ? (d.type === 'meaning' ? d.phrase : answer) : d.answers[0]);
  };
  const next = () => { setI(i + 1); setInput(''); setVerdict(null); setGiven(''); setHint(0); setBadTense(null); };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); if (verdict) next(); else if (input.trim()) check(input); };
  const saveNew = async (libraryId: string, word: string) => {
    const w = await a.saveFromLibrary({ id: libraryId, word });
    if (w) setItems((list) => list && list.map((x) => (x.filler && x.filler.word === word ? { ...x, filler: { ...x.filler, mine: true, wordId: w.id } } : x)));
  };
  useEffect(() => {
    if (!d || !d.choices.length || verdict) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= d.choices.length && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) check(d.choices[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const head = (
    <PageHead title={key ? 'Practise a phrase' : 'Practise phrases'} sub="Use phrases with your own words and new ones.">
      <button className="btn btn-secondary" onClick={() => a.go('phrases', { sel: null })}><Icon name="left" size="sm" />Phrases</button>
    </PageHead>
  );
  if (err) return <>{head}<EmptyState icon="alert" tint="t-red" title="Can’t start the practice" text={err} /></>;
  if (!items) return <>{head}<div className="card ws-card"><div className="sk" style={{ height: 220 }} /></div></>;
  if (!items.length) return <>{head}<EmptyState icon="chat" tint="t-indigo" title="No phrases yet" text="Phrases will appear here once they are added." /></>;

  if (finished) {
    const right = done.filter((x) => x.verdict !== 'wrong').length;
    const phrases = [...new Map(done.map((x) => [x.d.key, x.d.phrase])).entries()];
    const newWords = [...new Map(done.filter((x) => x.d.filler && !x.d.filler.mine && x.d.filler.libraryId).map((x) => [x.d.filler!.word, x.d.filler!])).values()];
    return (
      <>
        {head}
        <div className="card ws-card ws-done">
          <span className="stat-ic t-green"><Icon name="check" size="lg" /></span>
          <h2>Practice done</h2>
          <p className="muted">{right} of {done.length} right the first time.</p>
          <div className="ph-sum">
            {phrases.map(([k, p]) => {
              const mine = done.filter((x) => x.d.key === k);
              const ok = mine.filter((x) => x.verdict !== 'wrong').length;
              return <button key={k} className="ph-sum-row" onClick={() => a.go('phrases', { sel: k })}><b>{p}</b><span className={'badge ' + (ok === mine.length ? 't-green' : 't-amber')}>{ok}/{mine.length}</span></button>;
            })}
          </div>
          {newWords.length > 0 && (
            <div className="stack" style={{ gap: 8, alignItems: 'center' }}>
              <span className="sec-t">New words you used</span>
              <div className="badges" style={{ justifyContent: 'center' }}>
                {newWords.map((f) => s.words.some((w) => w.word.toLowerCase() === f.word.toLowerCase())
                  ? <span key={f.word} className="ph-filler mine">{f.word}<Icon name="check" size="sm" /></span>
                  : <span key={f.word} className="ph-filler">{f.word} <span className="muted xs">{f.vi}</span><button className="linkbtn xs" onClick={() => void saveNew(f.libraryId, f.word)}>+ Save</button></span>)}
              </div>
            </div>
          )}
          <div className="ws-actions">
            <button className="btn btn-secondary" onClick={() => a.go('phrases', { sel: null })}>Back to Phrases</button>
            <button className="btn btn-primary" onClick={() => setRun((x) => x + 1)}>Practise again</button>
          </div>
        </div>
      </>
    );
  }

  const ok = verdict && verdict !== 'wrong';
  const f = d!.filler;
  return (
    <>
      {head}
      <div className="card ws-card ph-practice">
        <div className="ws-top">
          <span className="muted sm">{i + 1} / {items.length}</span>
          <span className="prog" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={i}><div style={{ width: Math.round((i / items.length) * 100) + '%' }} /></span>
        </div>
        <div className="ph-q-head">
          <span className="qkicker">{DRILL_TITLE[d!.type]}{d!.id.endsWith(':again') ? ' · again' : ''}</span>
          {/* Hidden while it would give the answer away; hints show it bit by bit (or the answer, once checked). */}
          {(!hidesPhrase(d!.type) || hint >= 2 || (verdict && d!.type !== 'situation')) && <span className="ph-q-phrase">{d!.pattern ? <PatternChips pattern={d!.pattern} /> : <b>{d!.phrase}</b>}</span>}
          {hidesPhrase(d!.type) && d!.type !== 'situation' && hint === 1 && !verdict && <span className="ph-hint1">{firstLetters(d!.type === 'fill' ? d!.answers[0] : d!.phrase)}</span>}
        </div>
        {f && (
          <div className={'ph-q-word' + (f.mine ? ' mine' : '')}>
            <span className="badge">{f.mine ? 'Your word' : 'New word'}</span>
            <b>{f.en}</b><span className="muted sm" lang="vi">{f.vi}</span>
            {!f.mine && f.libraryId && <button className="linkbtn xs" onClick={() => void saveNew(f.libraryId, f.word)}>+ Save “{f.word}”</button>}
          </div>
        )}
        <h3 className="ph-prompt" lang={d!.type === 'translate' || d!.type === 'situation' ? 'vi' : undefined}>
          {d!.prompt}
          {(d!.type === 'reply' || d!.type === 'fill' || d!.type === 'transform') && <button className="iconbtn sm" onClick={() => speak(d!.type === 'fill' ? d!.answers[0] : d!.prompt)} aria-label="Play" style={{ marginLeft: 6 }}><Icon name="volume" size="sm" /></button>}
        </h3>
        {d!.sub && <p className="muted sm" lang="vi" style={{ margin: 0 }}>{d!.sub}</p>}
        {d!.tense && <span className="ph-tense" lang="vi"><Icon name="clock" size="sm" />Thì: <b>{TENSE_HINT[d!.tense].vi}</b> · {TENSE_HINT[d!.tense].form}</span>}

        {d!.choices.length ? (
          <div className="opts" role="group" aria-label="Choices">
            {d!.choices.map((c, k) => {
              const isRight = d!.answers.includes(c);
              const cls = !verdict ? '' : isRight ? ' correct' : c === given ? ' wrong' : ' dim';
              return (
                <button key={c} className={'opt' + cls} onClick={() => check(c)} disabled={!!verdict} lang={d!.type === 'meaning' ? 'vi' : undefined}>
                  <span className="letter">{k + 1}</span><span className="grow">{c}</span>
                  {verdict && isRight && <Icon name="check" size="sm" />}
                </button>
              );
            })}
          </div>
        ) : (
          <form className="ph-form" onSubmit={onSubmit}>
            <textarea ref={field} className={'input' + (verdict ? (ok ? ' ok' : ' err') : '')} rows={2} value={input} readOnly={!!verdict}
              placeholder={d!.type === 'fill' ? 'Type the missing words…' : 'Type the English sentence…'} autoComplete="off" spellCheck={false}
              onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(e); } }} aria-label="Your answer" />
            {!verdict && (
              <div className="actions" style={{ justifyContent: 'flex-end' }}>
                {hidesPhrase(d!.type) && hint < 2 && <button type="button" className="btn btn-ghost" onClick={() => setHint(hint + 1)}><Icon name="sparkle" size="sm" />{hint ? 'More help' : 'Hint'}</button>}
                <button type="button" className="btn btn-ghost" onClick={() => check('')}>Show answer</button>
                <button type="submit" className="btn btn-primary" disabled={!input.trim()}><Icon name="check" size="sm" />Check</button>
              </div>
            )}
          </form>
        )}

        <div aria-live="polite">
          {verdict && (
            <div className={'wufb ' + (ok ? 'ok' : 'no')}>
              <b className="wufb-t"><Icon name={ok ? 'checkc' : 'alert'} size="sm" />{verdict === 'right' ? 'Correct!' : verdict === 'close' ? 'Correct — another way to say it:' : given ? 'Not quite. The answer:' : 'The answer:'}</b>
              {!d!.choices.length && <span className="ph-answer">{d!.type === 'fill' ? d!.prompt.replace(/(___\s?)+/, d!.answers[0] + ' ') : d!.answers[0]} <button className="iconbtn sm" onClick={() => speak(d!.type === 'fill' ? d!.prompt.replace(/(___\s?)+/, d!.answers[0] + ' ') : d!.answers[0])} aria-label="Play the answer"><Icon name="volume" size="sm" /></button></span>}
              {badTense && <span className="sm" lang="vi"><b>Sai thì:</b> câu này dùng {TENSE_HINT[badTense].vi} ({TENSE_HINT[badTense].form}).</span>}
              {!ok && !badTense && d!.explain && <span className="muted sm" lang="vi">{d!.explain}</span>}
              {!ok && !d!.id.endsWith(':again') && <span className="muted sm">You’ll get this one again at the end.</span>}
            </div>
          )}
        </div>
        {verdict && (
          <div className="hwnav">
            <button className="btn btn-ghost" onClick={() => a.go('phrases', { sel: d!.key })}>Open “{d!.phrase}”</button>
            <button ref={nextBtn} className="btn btn-primary" onClick={next}>Continue<Icon name="right" size="sm" /></button>
          </div>
        )}
      </div>
    </>
  );
}
