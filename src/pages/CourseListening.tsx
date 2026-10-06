import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, type CourseDetail, type Dialogue, type ListeningDialogue } from '../lib/api';
import { shuffle } from '../lib/data';
import { canSpeak, pickDialogueVoices, speakLine, stopSpeaking, useEnglishVoices } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { Icon } from '../components/ui';
import { errText } from './Courses';
import { normalizeAnswer } from './CourseWarmup';

/** A blank in a line: [[word]] or [[said form|word]] (like the server). */
export const BLANK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
/** said: what's spoken (and the right fill) · base: the word in the word bank. */
export interface Blank { said: string; base: string }
/** Plain text, or the index of a blank. */
type Seg = string | number;

export const countBlanks = (text: string) => (text.match(BLANK_RE) ?? []).length;

/** The blanks of a dialogue in order, each line cut into text and blanks, and each line as it's spoken. */
export function parseDialogue(lines: { text: string }[]): { blanks: Blank[]; segs: Seg[][]; spoken: string[] } {
  const blanks: Blank[] = [];
  const segs = lines.map((l) => {
    const out: Seg[] = [];
    let at = 0;
    for (const m of l.text.matchAll(BLANK_RE)) {
      const i = m.index ?? 0;
      if (i > at) out.push(l.text.slice(at, i));
      out.push(blanks.length);
      blanks.push({ said: m[1].trim(), base: (m[2] ?? m[1]).trim() });
      at = i + m[0].length;
    }
    if (at < l.text.length) out.push(l.text.slice(at));
    return out;
  });
  const spoken = lines.map((l) => l.text.replace(BLANK_RE, (_, said: string) => said.trim()));
  return { blanks, segs, spoken };
}

/** The word bank the server would send: the blanks' base words, once each, shuffled. */
export const wordBankOf = (blanks: Blank[]) => shuffle([...new Set(blanks.map((b) => b.base))]);

const blankRight = (given: string, b: Blank) => {
  const g = normalizeAnswer(given);
  return !!g && (g === normalizeAnswer(b.said) || g === normalizeAnswer(b.base));
};

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

/** The day's approved dialogue: undefined while loading, null when there's none (or the day isn't open). day null = don't load. */
export function useListening(courseId: string, day: number | null) {
  const [dialogue, setDialogue] = useState<ListeningDialogue | null | undefined>(undefined);
  useEffect(() => {
    if (day === null) { setDialogue(null); return; }
    let live = true;
    setDialogue(undefined);
    api.getListening(courseId, day)
      .then((r) => { if (live) setDialogue(r.dialogue); })
      // Not open / not joined / offline: no listening step — it never blocks the day.
      .catch(() => { if (live) setDialogue(null); });
    return () => { live = false; };
  }, [courseId, day]);
  return dialogue;
}

export function SpeakerBadge({ name, gender, s }: { name: string; gender: 'female' | 'male'; s: number }) {
  return (
    <span className={'lsspk s' + s}>
      <Icon name={gender === 'male' ? 'male' : 'female'} size="sm" />
      {name}<span className="c-sr"> ({gender})</span>
    </span>
  );
}

type Step = 'listen' | 'fill' | 'questions' | 'summary';
type LineMode = 'hidden' | 'text' | 'fill';

/**
 * Listening practice for one dialogue: listen (transcript hidden at first), fill the blanks (tap word-bank words, or type
 * them in hard mode), answer the questions, then a summary. Speech plays one line after another with a voice per speaker.
 * preview: the owner's look (every step open, nothing is saved) · onFinish: Finish on the summary, with blanks + questions right / total; resolves true when it was saved ·
 * onClose: the learner is done with it.
 */
export function ListeningPractice({ d, day, preview, onFinish, onClose }: {
  d: Dialogue & { wordBank?: string[] }; day: number; preview?: boolean;
  onFinish?: (correct: number, total: number) => Promise<boolean>; onClose: () => void;
}) {
  const speech = canSpeak();
  const voices = useEnglishVoices();
  const P = useMemo(() => parseDialogue(d.lines), [d]);
  const bank = useMemo(() => (d.wordBank?.length ? d.wordBank : wordBankOf(P.blanks)), [d, P]);
  /** How many blanks each word-bank word fills (a word can be in the dialogue twice). */
  const cap = useMemo(() => bank.map((w) => Math.max(1, P.blanks.filter((b) => b.base.toLowerCase() === w.toLowerCase()).length)), [bank, P]);
  /** Choices in a random order (authors and AI tend to put the answer first). */
  const qs = useMemo(() => d.questions.map((x) => ({ ...x, choices: shuffle(x.choices) })), [d]);
  const nb = P.blanks.length;
  const hid = 'ls-' + day + (preview ? '-p' : '');

  const [step, setStep] = useState<Step>('listen');
  const [reached, setReached] = useState(0);
  const [showText, setShowText] = useState(false);
  const [showVi, setShowVi] = useState(false);
  const [live, setLive] = useState('');

  /* ---------- player ---------- */
  const voiceFor = useMemo(() => pickDialogueVoices(voices, d.speakers.map((s) => s.gender)), [voices, d.speakers]);
  const [cur, setCur] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  /** Bumped on every play / stop, so a cancelled line's onend doesn't move on. */
  const gen = useRef(0);
  const opts = useRef({ voiceFor, speed });
  opts.current = { voiceFor, speed };

  const halt = () => { gen.current++; stopSpeaking(); };
  const play = (from: number, all: boolean) => {
    halt();
    const g = gen.current;
    const done = () => { setCur(null); setPlaying(false); setPaused(false); };
    const say = (k: number) => {
      if (g !== gen.current) return;
      if (k >= d.lines.length) { done(); return; }
      setCur(k);
      setPlaying(true);
      setPaused(false);
      const v = opts.current.voiceFor[d.lines[k].s] ?? { pitch: 1 };
      const ok = speakLine(P.spoken[k], v, opts.current.speed, () => {
        if (g !== gen.current) return;
        if (all) say(k + 1); else done();
      });
      if (!ok) done();
    };
    say(from);
  };
  /** Pausing stops the line; Resume plays it again from its start (pause/resume isn't reliable in every browser). */
  const pause = () => { halt(); setPlaying(false); setPaused(true); };
  const stop = () => { halt(); setPlaying(false); setPaused(false); setCur(null); };
  useEffect(() => () => { gen.current++; stopSpeaking(); }, []);

  const name = (s: number) => d.speakers[s]?.name ?? (s ? 'B' : 'A');
  useEffect(() => {
    if (cur === null || !playing) return;
    setLive('Line ' + (cur + 1) + ' of ' + d.lines.length + ', ' + name(d.lines[cur].s) + '.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, playing]);

  /* ---------- fill the blanks ---------- */
  const [answers, setAnswers] = useState<string[]>(() => P.blanks.map(() => ''));
  /** Which word-bank chip filled each blank (null = typed or empty). */
  const [chipOf, setChipOf] = useState<(number | null)[]>(() => P.blanks.map(() => null));
  const [target, setTarget] = useState(0);
  const [hard, setHard] = useState(false);
  const [marks, setMarks] = useState<boolean[] | null>(null);
  const filled = answers.filter((x) => x.trim()).length;
  const used = (i: number) => chipOf.filter((x) => x === i).length >= cap[i];

  const setBlank = (k: number, text: string, chip: number | null) => {
    setAnswers((a) => a.map((x, j) => (j === k ? text : x)));
    setChipOf((a) => a.map((x, j) => (j === k ? chip : x)));
  };
  const fillChip = (i: number) => {
    if (marks || used(i)) return;
    const t = target;
    const next = answers.map((x, j) => (j === t ? bank[i] : x));
    setBlank(t, bank[i], i);
    // On to the next empty blank (after this one, then from the start).
    const order = [...Array(nb).keys()].map((j) => (t + 1 + j) % nb);
    const to = order.find((j) => !next[j].trim());
    if (to !== undefined) setTarget(to);
    setLive('Blank ' + (t + 1) + ': ' + bank[i] + '. ' + (to !== undefined ? 'Next: blank ' + (to + 1) + '.' : 'All blanks filled.'));
  };
  const focusBlank = (k: number) => document.getElementById(hid + '-b' + k)?.focus();
  const checkBlanks = () => {
    if (marks || !filled) return;
    const m = P.blanks.map((b, k) => blankRight(answers[k], b));
    setMarks(m);
    setLive(m.filter(Boolean).length + ' of ' + nb + ' blanks right.');
  };

  /* ---------- questions ---------- */
  const [qi, setQi] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const q = qs[qi];
  const qChecked = picks.length > qi;
  const pick = (t: string) => { if (!q || qChecked) return; setPicks((p) => [...p, t]); };

  const blanksRight = marks?.filter(Boolean).length ?? 0;
  const qRight = picks.filter((p, k) => qs[k] && p === qs[k].answer).length;

  /* ---------- steps ---------- */
  const steps: { id: Step; label: string }[] = [
    { id: 'listen', label: 'Listen' },
    { id: 'fill', label: 'Fill the blanks' },
    ...(qs.length ? [{ id: 'questions' as const, label: 'Questions' }] : []),
    { id: 'summary', label: 'Results' }
  ];
  const idx = steps.findIndex((s) => s.id === step);
  const stepHead = useRef<HTMLHeadingElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const shown = useRef(step);
  const go = (s: Step) => {
    const k = steps.findIndex((x) => x.id === s);
    setStep(s);
    setReached((r) => Math.max(r, k));
  };
  // Focus: the step's heading when the step changes.
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    stepHead.current?.focus();
  }, [step]);
  // Questions: Next once answered · blanks: Next once checked.
  useEffect(() => { if (step === 'questions' && qChecked) nextBtn.current?.focus(); }, [step, qChecked]);
  useEffect(() => { if (step === 'fill' && marks) nextBtn.current?.focus(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [marks]);

  const nextQ = () => {
    if (qi < qs.length - 1) { setQi(qi + 1); window.setTimeout(() => stepHead.current?.focus(), 0); return; }
    go('summary');
  };
  const restart = () => {
    stop();
    setAnswers(P.blanks.map(() => ''));
    setChipOf(P.blanks.map(() => null));
    setTarget(0);
    setMarks(null);
    setQi(0);
    setPicks([]);
    setReached(0);
    setShowText(false);
    setStep('listen');
    setLive('Starting again.');
  };
  const [finishing, setFinishing] = useState(false);
  const finish = async () => {
    if (!onFinish) { onClose(); return; }
    setFinishing(true);
    try { await onFinish(blanksRight + qRight, nb + qs.length); } finally { setFinishing(false); }
  };

  // 1–4 answer a question, Enter goes on once answered (when the focus isn't on a control).
  const onKey = (ev: KeyboardEvent) => {
    if (step !== 'questions' || !q) return;
    const tag = (ev.target as HTMLElement).tagName;
    if (ev.ctrlKey || ev.metaKey || ev.altKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tag)) return;
    const k = Number(ev.key);
    if (!qChecked && k >= 1 && k <= q.choices.length) { ev.preventDefault(); pick(q.choices[k - 1]); }
    else if (qChecked && ev.key === 'Enter') { ev.preventDefault(); nextQ(); }
  };

  /* ---------- pieces ---------- */
  const blankInput = (k: number) => {
    const b = P.blanks[k];
    const m = marks?.[k];
    const width = Math.max(6, Math.max(b.said.length, b.base.length, answers[k].length) + 2);
    return (
      <span key={'b' + k} className="lsgap">
        <input id={hid + '-b' + k} className={'input lsblank' + (marks ? (m ? ' ok' : ' err') : '') + (!hard && !marks && k === target ? ' target' : '')}
          style={{ width: width + 'ch' }} value={answers[k]} aria-label={'Blank ' + (k + 1)}
          aria-invalid={marks ? !m : undefined} aria-describedby={marks && !m ? hid + '-fix' + k : undefined}
          readOnly={!hard || !!marks} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={60}
          placeholder={!hard && !marks && k === target ? '?' : ''}
          onFocus={() => { if (!marks) setTarget(k); }}
          onChange={(ev) => setBlank(k, ev.target.value, null)}
          onKeyDown={(ev) => {
            if (marks) return;
            if (!hard && (ev.key === 'Backspace' || ev.key === 'Delete') && answers[k]) { ev.preventDefault(); setBlank(k, '', null); setLive('Blank ' + (k + 1) + ' cleared.'); }
            else if (ev.key === 'Enter') { ev.preventDefault(); if (k < nb - 1) focusBlank(k + 1); else checkBlanks(); }
          }} />
        {marks && !m && <span id={hid + '-fix' + k} className="lsfix"><span className="c-sr">Answer: </span>{b.said}</span>}
      </span>
    );
  };

  const lineList = (mode: LineMode) => (
    <ol className={'lslines' + (mode === 'fill' ? ' fill' : '')} aria-label="Dialogue">
      {d.lines.map((l, i) => {
        const on = cur === i;
        const who = <span className={'lswho s' + l.s}>{name(l.s)}</span>;
        const vi = showVi && l.vi && <span className="lsvi" lang="vi">{l.vi}</span>;
        if (mode === 'fill') {
          return (
            <li key={i} className={'lsline s' + l.s + (on ? ' on' : '')}>
              <button className="iconbtn sm lsplay" onClick={() => play(i, false)} disabled={!speech} aria-label={'Play line ' + (i + 1) + ', ' + name(l.s)} title="Play this line">
                <Icon name={on ? 'volume' : 'play'} size="sm" />
              </button>
              <div className="lsbody">
                {who}
                <span className="lstx">{P.segs[i].map((sg, j) => (typeof sg === 'number' ? blankInput(sg) : <span key={j}>{sg}</span>))}</span>
                {vi}
              </div>
            </li>
          );
        }
        return (
          <li key={i} className={'lsline s' + l.s + (on ? ' on' : '')}>
            <button className="lsrow" onClick={() => play(i, false)} disabled={!speech} aria-current={on ? 'true' : undefined}>
              <span className="lsplay" aria-hidden="true"><Icon name={on ? 'volume' : 'play'} size="sm" /></span>
              <span className="lsbody">
                <span className="c-sr">Play line {i + 1}: </span>
                {who}
                {mode === 'text' ? (
                  <span className="lstx">{P.segs[i].map((sg, j) => (typeof sg === 'number' ? <b key={j} className="lsword">{P.blanks[sg].said}</b> : <span key={j}>{sg}</span>))}</span>
                ) : (
                  <span className="lstx lshidden" aria-hidden="true">{'•'.repeat(Math.min(24, Math.max(6, Math.round(P.spoken[i].length / 4))))}</span>
                )}
                {vi}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  const player = (
    <div className="lsplayer">
      <div className="lsctl" role="group" aria-label="Player">
        {playing ? (
          <button className="btn btn-primary" onClick={pause}><Icon name="pause" size="sm" />Pause</button>
        ) : (
          <button className="btn btn-primary" onClick={() => play(paused && cur !== null ? cur : 0, true)} disabled={!speech}>
            <Icon name="play" size="sm" />{paused ? 'Resume' : 'Play all'}
          </button>
        )}
        <button className="btn btn-secondary" onClick={stop} disabled={!playing && !paused}><Icon name="stop" size="sm" />Stop</button>
        <div className="seg" role="group" aria-label="Speed">
          {[0.75, 1].map((x) => <button key={x} className={speed === x ? 'on' : ''} aria-pressed={speed === x} onClick={() => setSpeed(x)}>{x}×</button>)}
        </div>
      </div>
      {speech ? <span className="hint">Tap a line to hear it again.</span>
        : <span className="errtxt"><Icon name="alert" size="sm" />Your browser can’t play speech, so the audio won’t work here. You can still read the transcript.</span>}
    </div>
  );

  const toggles = (text: boolean) => (
    <div className="lstoggles">
      {text && (
        <button className="linkbtn" onClick={() => setShowText(!showText)} aria-pressed={showText}>
          <Icon name={showText ? 'eyeOff' : 'eye'} size="sm" />{showText ? 'Hide transcript' : 'Show transcript'}
        </button>
      )}
      <button className="linkbtn" onClick={() => setShowVi(!showVi)} aria-pressed={showVi}>
        <Icon name={showVi ? 'eyeOff' : 'eye'} size="sm" />{showVi ? 'Hide translation' : 'Show translation'}
      </button>
    </div>
  );

  const heading = (text: ReactNode) => (
    <h5 ref={stepHead} tabIndex={-1} className="qkicker lshead" id={hid + '-h'}>{text}</h5>
  );

  let body: ReactNode;
  if (step === 'listen') {
    body = (
      <>
        {heading(<>Step 1 · Listen</>)}
        <p className="muted sm" style={{ margin: 0 }}>Listen to the whole conversation first. Try it without the transcript, then check what you missed.</p>
        {player}
        {toggles(true)}
        {lineList(showText ? 'text' : 'hidden')}
        <div className="hwnav">
          <button className="btn btn-ghost" onClick={onClose}>{preview ? 'Close' : 'Stop'}</button>
          <button className="btn btn-primary" onClick={() => go('fill')}>Next: fill the blanks<Icon name="right" size="sm" /></button>
        </div>
      </>
    );
  } else if (step === 'fill') {
    const bankArea = !marks && !hard && (
      <div className="lsbankwrap">
        <span className="label" id={hid + '-bank'}>Word bank <span className="muted xs">— fills blank {target + 1}</span></span>
        <div className="chips lsbank" role="group" aria-labelledby={hid + '-bank'}>
          {bank.map((w, i) => (
            <button key={w + i} className={'chip lschip' + (used(i) ? ' used' : '')} disabled={used(i)} onClick={() => fillChip(i)}
              aria-label={used(i) ? w + ' (used)' : 'Put ' + w + ' in blank ' + (target + 1)}>{w}</button>
          ))}
        </div>
      </div>
    );
    body = (
      <>
        {heading(<>Step 2 · Fill the blanks</>)}
        <div className="lsmode">
          <p className="muted sm" style={{ margin: 0 }}>
            {marks ? 'Wrong blanks show the right word next to them.' : hard ? 'Type the missing words as you hear them.' : 'Tap a blank, then the word that goes there. Play the lines as often as you like.'}
          </p>
          {!marks && (
            <span className="lshard">
              <span className="sm" id={hid + '-hard'}>Hard mode: type the words</span>
              <button className={'switch' + (hard ? ' on' : '')} role="switch" aria-checked={hard} aria-labelledby={hid + '-hard'} onClick={() => setHard(!hard)} />
            </span>
          )}
        </div>
        {player}
        {toggles(false)}
        {lineList('fill')}
        {bankArea}
        <div aria-live="polite" aria-atomic="true">
          {marks && (
            <div className={'wufb ' + (blanksRight === nb ? 'ok' : 'no')}>
              <b className="wufb-t"><Icon name={blanksRight === nb ? 'checkc' : 'alert'} size="sm" />{blanksRight === nb ? 'All blanks right!' : blanksRight + ' of ' + nb + ' blanks right.'}</b>
              {blanksRight < nb && <span className="sm">Play the lines again to hear the words you missed.</span>}
            </div>
          )}
        </div>
        <div className="hwnav">
          <button className="btn btn-ghost" onClick={() => go('listen')}><Icon name="left" size="sm" />Back</button>
          {marks ? (
            <button ref={nextBtn} className="btn btn-primary" onClick={() => go(qs.length ? 'questions' : 'summary')}>
              {qs.length ? 'Next: questions' : 'See results'}<Icon name="right" size="sm" />
            </button>
          ) : (
            <span className="lscheck">
              <span className="muted sm" aria-hidden="true">{filled}/{nb}</span>
              <button className="btn btn-primary" onClick={checkBlanks} disabled={!filled}><Icon name="check" size="sm" />Check<span className="c-sr"> ({filled} of {nb} blanks filled)</span></button>
            </span>
          )}
        </div>
      </>
    );
  } else if (step === 'questions' && q) {
    const picked = picks[qi];
    const ok = qChecked && picked === q.answer;
    body = (
      <>
        <div className="hwbar">
          <span className="scount" aria-hidden="true">{qi + 1} / {qs.length}</span>
          <span className="prog" role="progressbar" aria-label="Questions" aria-valuemin={1} aria-valuemax={qs.length} aria-valuenow={qi + 1} aria-valuetext={'Question ' + (qi + 1) + ' of ' + qs.length}>
            <div style={{ width: Math.round(((qi + 1) / qs.length) * 100) + '%' }} />
          </span>
        </div>
        {heading(<>Step 3 · Question {qi + 1} of {qs.length}</>)}
        <div key={qi} className="hwq animA">
          <h6 className="qtext hwprompt sentence" id={hid + '-q'}>{q.question}</h6>
          <div className="opts hwopts" role="group" aria-labelledby={hid + '-q'}>
            {q.choices.map((t, k) => {
              const isAns = t === q.answer;
              const cls = !qChecked ? '' : isAns ? ' correct' : t === picked ? ' wrong' : ' dim';
              return (
                <button key={k} className={'opt' + cls} onClick={() => pick(t)} disabled={qChecked} aria-pressed={qChecked ? t === picked : undefined}>
                  <span className="letter">{k + 1}</span>
                  <span className="grow">{t}</span>
                  {qChecked && isAns && <Icon name="check" size="sm" />}
                  {qChecked && !isAns && t === picked && <Icon name="x" size="sm" />}
                </button>
              );
            })}
          </div>
          {!qChecked && <span className="keyhint">Press <span className="kbd">1</span>–<span className="kbd">{q.choices.length}</span> to answer</span>}
        </div>
        <div aria-live="polite" aria-atomic="true">
          {qChecked && (
            <div className={'wufb ' + (ok ? 'ok' : 'no')}>
              <b className="wufb-t"><Icon name={ok ? 'checkc' : 'alert'} size="sm" />{ok ? 'Correct!' : 'Not quite.'}</b>
              {!ok && <span>Answer: <b className="hw-ok">{q.answer}</b></span>}
              {q.explain && <span className="sm" lang="vi">{q.explain}</span>}
            </div>
          )}
        </div>
        <details className="lsmore">
          <summary>Listen again</summary>
          <div className="stack" style={{ gap: 12, marginTop: 12 }}>
            {player}
            {toggles(true)}
            {lineList(showText ? 'text' : 'hidden')}
          </div>
        </details>
        <div className="hwnav">
          <button className="btn btn-ghost" onClick={() => go('fill')}><Icon name="left" size="sm" />Back</button>
          {qChecked && (
            <button ref={nextBtn} className="btn btn-primary" onClick={nextQ}>
              {qi < qs.length - 1 ? <>Next<Icon name="right" size="sm" /></> : <>See results<Icon name="right" size="sm" /></>}
            </button>
          )}
        </div>
      </>
    );
  } else {
    const all = blanksRight + qRight;
    const total = nb + qs.length;
    body = (
      <>
        <div className="hwresult">
          {heading(<>Listening done<span className="c-sr">: {all} of {total} right</span></>)}
          <div className="lsstats" aria-hidden="true">
            <div><b>{blanksRight}</b><span className="muted">/ {plural(nb, 'blank')}</span></div>
            {qs.length > 0 && <div><b>{qRight}</b><span className="muted">/ {plural(qs.length, 'question')}</span></div>}
          </div>
          <span className="c-sr">Blanks: {blanksRight} of {nb}.{qs.length ? ' Questions: ' + qRight + ' of ' + qs.length + '.' : ''}</span>
          <span className="muted sm">
            {preview ? 'Preview — nothing is saved.' : all === total ? 'Everything right — great listening!' : 'Practice only — it doesn’t count toward your homework score.'}
          </span>
        </div>
        {marks && blanksRight < nb && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Missed words</span>
            <div className="badges">{P.blanks.filter((_, k) => !marks[k]).map((b, k) => <span key={k} className="badge t-red">{b.said}</span>)}</div>
          </div>
        )}
        <div className="dfoot">
          <button className="btn btn-secondary" onClick={restart}><Icon name="refresh" size="sm" />Practise again</button>
          {preview || !onFinish ? (
            <button className="btn btn-primary" onClick={onClose}>{preview ? 'Close preview' : 'Done'}</button>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={finish} disabled={finishing}><Icon name="check" size="sm" />{finishing ? 'Saving…' : 'Finish'}</button>
          )}
        </div>
      </>
    );
  }

  return (
    <section className="lsbox" aria-label={'Listening: ' + d.title} onKeyDown={onKey}>
      <header className="lshdr">
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <h4 className="lstitle"><Icon name="headphones" size="sm" />{d.title}</h4>
          {d.scenario && <p className="muted sm lsscen" lang="vi">{d.scenario}</p>}
        </div>
        <div className="lsspks" aria-label="Speakers">
          {d.speakers.map((s, i) => <SpeakerBadge key={i} name={s.name} gender={s.gender} s={i} />)}
        </div>
      </header>
      <ol className="lssteps" aria-label="Steps">
        {steps.map((s, k) => (
          <li key={s.id}>
            <button className={'lsstep' + (k === idx ? ' on' : k <= reached ? ' seen' : '')} onClick={() => { if (s.id !== step) go(s.id); }}
              disabled={!preview && k > reached} aria-current={k === idx ? 'step' : undefined}>
              <span className="lsstep-n" aria-hidden="true">{k < steps.length - 1 ? k + 1 : <Icon name="check" size="sm" />}</span>{s.label}
            </button>
          </li>
        ))}
      </ol>
      {body}
      <div className="c-sr" aria-live="polite" aria-atomic="true">{live}</div>
    </section>
  );
}

/** "Listening" for an earlier open day, under its words in the All days panel. Nothing when the day has no dialogue. */
export function DayListening({ c, day, onListened }: { c: CourseDetail; day: number; onListened: (listened: number[]) => void }) {
  const { a } = useWB();
  const d = useListening(c.id, day);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  if (!d) return null;
  const done = (c.enrollment?.listened ?? []).includes(day);
  const close = () => { setOpen(false); window.setTimeout(() => btn.current?.focus(), 0); };
  const finish = async (correct: number, total: number) => {
    try {
      onListened((await api.listeningDone(c.id, day, correct, total)).listened);
      a.showToast('Listening for day ' + day + ' saved: ' + correct + ' of ' + total + ' right.');
      close();
      return true;
    } catch (err) {
      a.showToast(errText(err, 'Couldn’t save your listening.'), 'bad');
      return false;
    }
  };
  const hid = 'dl-' + day;
  return (
    <section className="card lscard" aria-labelledby={hid}>
      <div className="rowb" style={{ flexWrap: 'wrap' }}>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h3 className="h2" id={hid}><span aria-hidden="true">🎧 </span>Listening · day {day}</h3>
          <span className="muted sm">{d.title} · {plural(parseDialogue(d.lines).blanks.length, 'blank')}{d.questions.length ? ' · ' + plural(d.questions.length, 'question') : ''}</span>
        </div>
        {done && <span className="badge t-green"><Icon name="check" size="sm" />Done</span>}
      </div>
      {open ? (
        <ListeningPractice key={'dlp' + day} d={d} day={day} onFinish={finish} onClose={close} />
      ) : (
        <div className="tact">
          <button ref={btn} className={'btn ' + (done ? 'btn-secondary' : 'btn-primary')} onClick={() => setOpen(true)}>
            <Icon name="headphones" size="sm" />{done ? 'Practise listening again' : 'Listening'}
          </button>
        </div>
      )}
    </section>
  );
}
