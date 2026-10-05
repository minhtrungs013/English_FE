import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { CourseDetail, CourseWord } from '../lib/api';
import { shuffle } from '../lib/data';
import { canSpeak, speak } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { Icon, LevelBadge, PosBadge } from '../components/ui';
import { normalizeAnswer } from './CourseWarmup';

/**
 * listen: hear the word, pick it · dictation: hear it, type it · meaning: pick the Vietnamese meaning ·
 * fill: type the word missing from its example · recall: meaning → type the word · match: pair up to 5 words with their meanings.
 */
type Kind = 'listen' | 'dictation' | 'meaning' | 'fill' | 'recall' | 'match';
type Phase = 'meet' | 'practice' | 'done';

const KIND: Record<Kind, string> = {
  listen: 'Listen & choose',
  dictation: 'Dictation',
  meaning: 'Meaning',
  fill: 'Fill the blank',
  recall: 'Recall',
  match: 'Match pairs'
};
const RECOGNISE: Kind[] = ['listen', 'meaning'];
const PRODUCE: Kind[] = ['dictation', 'fill', 'recall'];
/** Words answered correctly in this many different exercise types are learned. */
const MASTERY = 2;
const MATCH_MAX = 5;
/** A wrong answer comes back after this many other items. */
const RETRY_GAP = 2;

/** A course word ready for practice. label: what the meaning questions show (Vietnamese, else the English meaning). */
interface LW extends CourseWord {
  label: string;
  /** The example with the word blanked out, or null when it has no usable example. */
  blank: { before: string; found: string; after: string } | null;
}
interface Item {
  id: number;
  kind: Kind;
  /** Word indexes: one, or the pairs of a match round. */
  ws: number[];
  /** listen / meaning: up to 4 choices. */
  choices: string[];
  /** match: the order of the meanings column. */
  right: number[];
}
interface Run {
  queue: Item[];
  /** Items answered. */
  done: number;
  /** Exercise types answered correctly, per word. */
  got: Kind[][];
  tries: number;
  right: number;
  /** Wrong answers per word. */
  misses: number[];
  streak: number;
}
interface Ctx {
  W: LW[];
  kinds: Kind[][];
  wordTiers: string[][];
  viTiers: string[][];
  meaningTiers: string[][];
}

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The example with the word (or a simple inflection of it) blanked out, like the server's homework. */
function blankOut(w: CourseWord): LW['blank'] {
  if (!w.ex || !w.word.trim()) return null;
  const m = new RegExp('\\b' + escapeRegex(w.word.trim()) + '(?:s|es|ed|d|ing|er|ers)?\\b', 'i').exec(w.ex);
  if (!m) return null;
  return { before: w.ex.slice(0, m.index), found: m[0], after: w.ex.slice(m.index + m[0].length) };
}

function lettersHint(word: string): string {
  const parts = word.trim().split(/\s+/);
  return 'starts with “' + word.trim().charAt(0).toUpperCase() + '” · ' + plural(word.replace(/\s/g, '').length, 'letter') +
    (parts.length > 1 ? ' · ' + plural(parts.length, 'word') : '');
}

/** The answer plus up to 3 different wrong choices, taken from the tiers in order (closest first). */
function choicesFor(answer: string, tiers: string[][]): string[] {
  const seen = new Set([normalizeAnswer(answer)]);
  const out: string[] = [];
  for (const tier of tiers) {
    for (const p of shuffle(tier)) {
      const k = normalizeAnswer(p);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(p);
      if (out.length === 3) return shuffle([answer, ...out]);
    }
  }
  return shuffle([answer, ...out]);
}

const labelTiers = (ctx: Ctx, w: LW) => (w.vi ? ctx.viTiers : ctx.meaningTiers);

let seq = 0;
function makeItem(ctx: Ctx, kind: Kind, ws: number[]): Item {
  const w = ctx.W[ws[0]];
  return {
    id: ++seq, kind, ws,
    choices: kind === 'listen' ? choicesFor(w.word, ctx.wordTiers) : kind === 'meaning' ? choicesFor(w.label, labelTiers(ctx, w)) : [],
    right: kind === 'match' ? shuffle(ws) : []
  };
}

/** Exercise types that work for a word (audio needs speech, choices need something to choose from). */
function kindsFor(w: LW, ctx: Omit<Ctx, 'kinds'>, speech: boolean): Kind[] {
  const out: Kind[] = [];
  if (speech && choicesFor(w.word, ctx.wordTiers).length > 1) out.push('listen');
  if (w.label && choicesFor(w.label, w.vi ? ctx.viTiers : ctx.meaningTiers).length > 1) out.push('meaning');
  if (speech) out.push('dictation');
  if (w.blank) out.push('fill');
  if (w.label) out.push('recall');
  return out;
}

const need = (ctx: Ctx, w: number) => Math.min(MASTERY, ctx.kinds[w].length);
const mastered = (ctx: Ctx, got: Kind[][], w: number) => new Set(got[w]).size >= need(ctx, w);

/** Round 1 recognises each word, a match round, round 2 produces each word in another type. */
function plan(ctx: Ctx): Item[] {
  const all = ctx.W.map((_, i) => i).filter((i) => ctx.kinds[i].length);
  const first = shuffle(all);
  const off = Math.floor(Math.random() * 3);
  const used: Kind[] = [];
  const r1 = first.map((w, k) => {
    const ks = ctx.kinds[w];
    const rec = ks.filter((x) => RECOGNISE.includes(x));
    const kind = (rec.length ? rec : ks)[(k + off) % (rec.length || ks.length)];
    used[w] = kind;
    return makeItem(ctx, kind, [w]);
  });
  const second = shuffle(all);
  // The same word twice in a row is too easy.
  if (second.length > 1 && second[0] === first[first.length - 1]) second.push(second.shift()!);
  const r2 = second.flatMap((w, k) => {
    const others = ctx.kinds[w].filter((x) => x !== used[w]);
    if (!others.length) return [];
    const prod = others.filter((x) => PRODUCE.includes(x));
    const from = prod.length ? prod : others;
    return [makeItem(ctx, from[(k + off) % from.length], [w])];
  });
  const seen = new Set<string>();
  const pairs = shuffle(all).filter((w) => {
    const k = normalizeAnswer(ctx.W[w].label);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, MATCH_MAX);
  return [...r1, ...(pairs.length > 1 ? [makeItem(ctx, 'match', pairs)] : []), ...r2];
}

/** Another item for each word that isn't learned yet, in a type it hasn't got right. */
function topUp(ctx: Ctx, got: Kind[][]): Item[] {
  return shuffle(ctx.W.map((_, i) => i).filter((w) => !mastered(ctx, got, w))).map((w) => {
    const fresh = ctx.kinds[w].filter((x) => !got[w].includes(x));
    const from = fresh.length ? fresh : ctx.kinds[w];
    return makeItem(ctx, from[Math.floor(Math.random() * from.length)], [w]);
  });
}

const newRun = (ctx: Ctx): Run => ({
  queue: plan(ctx), done: 0, got: ctx.W.map(() => []), tries: 0, right: 0, misses: ctx.W.map(() => 0), streak: 0
});

const isChoice = (k: Kind) => k === 'listen' || k === 'meaning';
const isTyped = (k: Kind) => k === 'dictation' || k === 'fill' || k === 'recall';

const wordKey = (word: string) => word.trim().toLowerCase();
/** Whether a word is already in My Vocabulary (matched by word, ignoring case). */
export function useSavedWords(): (word: string) => boolean {
  const { s } = useWB();
  const have = useMemo(() => new Set(s.words.map((w) => wordKey(w.word))), [s.words]);
  return (word: string) => have.has(wordKey(word));
}

/**
 * Saves one word of an open course day to My Vocabulary — or "Saved ✓" when it's already there.
 * Saving keeps keyboard focus on the same spot (the "Saved" label).
 */
export function SaveWordButton({ courseId, day, word }: { courseId: string; day: number; word: string }) {
  const { a } = useWB();
  const isSaved = useSavedWords();
  const saved = isSaved(word);
  const [busy, setBusy] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const done = useRef<HTMLSpanElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (saved && refocus.current) { refocus.current = false; done.current?.focus(); }
  }, [saved]);

  if (saved) {
    return (
      <span ref={done} tabIndex={-1} className="badge t-green cwsaved">
        Saved <Icon name="check" size="sm" /><span className="c-sr">: {word} is in My Vocabulary</span>
      </span>
    );
  }
  const save = async () => {
    refocus.current = document.activeElement === btn.current;
    setBusy(true);
    const ok = await a.saveCourseWords(courseId, day, [word]);
    setBusy(false);
    if (!ok) refocus.current = false;
  };
  return (
    <button ref={btn} className="btn btn-secondary btn-sm cwsave" onClick={save} disabled={busy} aria-label={'Save ' + word + ' to My Vocabulary'}>
      <Icon name="plus" size="sm" />{busy ? 'Saving…' : 'Save to My Vocabulary'}
    </button>
  );
}

/**
 * Learning a course day: meet the words one at a time, practise them until each is right in two different exercise
 * types, then a summary. Saving words to My Vocabulary is up to the learner, word by word — it isn't needed to finish.
 * onLearn: marks the day learned (saves no words); given only when the learner is enrolled and the day is open,
 * which also shows the save buttons. Without it, or when the day is already learned, the summary just says "Done".
 * start: 'practice' skips meeting the words (practising again) · onClose: the learner is done with it.
 */
export function CourseLearn({ c, day, words, learned, onLearn, onClose, start = 'meet' }: {
  c: CourseDetail; day: number; words: CourseWord[]; learned: boolean;
  onLearn?: () => Promise<void>; onClose: () => void; start?: 'meet' | 'practice';
}) {
  const { s, a } = useWB();
  const isSaved = useSavedWords();
  const speech = canSpeak();

  const ctx = useMemo<Ctx>(() => {
    const W: LW[] = words.map((w) => ({ ...w, label: w.vi || w.meaning, blank: blankOut(w) }));
    const others = c.days.filter((d) => d.day !== day).flatMap((d) => d.words ?? []);
    const mine = s.words;
    const base = {
      W,
      wordTiers: [W.map((w) => w.word), others.map((w) => w.word), mine.map((w) => w.word)],
      viTiers: [W.map((w) => w.vi), others.map((w) => w.vi), mine.map((w) => w.vi)],
      meaningTiers: [W.map((w) => w.meaning), others.map((w) => w.meaning), mine.map((w) => w.meaning)]
    };
    return { ...base, kinds: W.map((w) => kindsFor(w, base, speech)) };
    // The words of this day decide the practice; later vocabulary changes don't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, day, words]);
  const W = ctx.W;
  const canPractise = ctx.kinds.some((k) => k.length);

  const [phase, setPhase] = useState<Phase>(start === 'practice' && canPractise ? 'practice' : 'meet');
  const [card, setCard] = useState(0);
  const [seen, setSeen] = useState(0);
  const [run, setRun] = useState<Run>(() => newRun(ctx));
  const [answer, setAnswer] = useState('');
  /** The checked answer of the current item (match: the round is complete). */
  const [checked, setChecked] = useState<{ given: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [live, setLive] = useState('');
  /** Match round: the selected tile, pairs found, mistakes per word, the last wrong pair (to shake). */
  const [sel, setSel] = useState<{ side: 'l' | 'r'; w: number } | null>(null);
  const [paired, setPaired] = useState<number[]>([]);
  const [slips, setSlips] = useState<Record<number, number>>({});
  const [shake, setShake] = useState<{ l: number; r: number; n: number } | null>(null);

  const qHead = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const doneHead = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  const item: Item | undefined = phase === 'practice' ? run.queue[0] : undefined;
  const w = item ? W[item.ws[0]] : undefined;
  const total = run.done + run.queue.length;
  const canSaveWords = !!onLearn;
  const canFinish = !!onLearn && !learned;
  const hid = 'cl-' + day;
  const listHead = useRef<HTMLHeadingElement>(null);

  /* ---------- meet ---------- */
  const mw = W[card];
  const spokenCard = useRef('');
  useEffect(() => {
    if (phase !== 'meet' || !mw || !s.settings.autoplay) return;
    const key = day + ':' + card;
    if (spokenCard.current === key) return;
    spokenCard.current = key;
    speak(mw.word);
  }, [phase, card, day, mw, s.settings.autoplay]);

  const goCard = (k: number) => {
    const to = Math.max(0, Math.min(W.length - 1, k));
    setCard(to);
    setSeen((v) => Math.max(v, to));
    setLive('Word ' + (to + 1) + ' of ' + W.length + ': ' + W[to].word + (W[to].vi ? ' — ' + W[to].vi : '') + '.');
  };

  /* ---------- practice ---------- */
  const resetItem = () => { setAnswer(''); setChecked(null); setSel(null); setPaired([]); setSlips({}); setShake(null); setLive(''); };
  const startPractice = () => {
    resetItem();
    setRun(newRun(ctx));
    setLive('Practice started.');
    setPhase('practice');
  };

  // Audio questions play the word as soon as they appear.
  const heard = useRef(0);
  useEffect(() => {
    if (!item || !w || (item.kind !== 'listen' && item.kind !== 'dictation') || heard.current === item.id) return;
    const id = item.id;
    const t = setTimeout(() => { heard.current = id; speak(w.word); }, 250);
    return () => clearTimeout(t);
  }, [item, w]);

  const accepted = (it: Item): string[] => {
    const x = W[it.ws[0]];
    if (it.kind === 'meaning') return [x.label];
    if (it.kind === 'fill' && x.blank) return [x.word, x.blank.found];
    return [x.word];
  };
  const record = (ok: boolean, ws: number[], credit: number[]) => {
    setRun((r) => {
      const got = r.got.map((g, i) => (credit.includes(i) && item && !g.includes(item.kind) ? [...g, item.kind] : g));
      const misses = r.misses.map((m, i) => (ws.includes(i) && !credit.includes(i) ? m + 1 : m));
      return { ...r, got, misses, tries: r.tries + ws.length, right: r.right + credit.length, streak: ok ? r.streak + 1 : 0 };
    });
  };
  const check = (given = answer) => {
    if (!item || !w || checked || item.kind === 'match' || !given.trim()) return;
    const g = normalizeAnswer(given);
    const ok = !!g && accepted(item).some((x) => normalizeAnswer(x) === g);
    setAnswer(given);
    setChecked({ given, ok });
    record(ok, item.ws, ok ? item.ws : []);
    speak(w.word);
  };
  /** "I don't know": shows the answer; counts as a miss. */
  const reveal = () => {
    if (!item || !w || checked) return;
    setChecked({ given: '', ok: false });
    record(false, item.ws, []);
    speak(w.word);
  };

  const next = () => {
    if (!item || !checked) return;
    let q = run.queue.slice(1);
    if (!checked.ok && item.kind !== 'match') {
      const at = Math.min(RETRY_GAP, q.length);
      q = [...q.slice(0, at), makeItem(ctx, item.kind, item.ws), ...q.slice(at)];
    }
    if (!q.length) q = topUp(ctx, run.got);
    resetItem();
    if (!q.length) {
      setRun({ ...run, queue: [], done: run.done + 1 });
      setPhase('done');
      return;
    }
    setRun({ ...run, queue: q, done: run.done + 1 });
  };

  const pickTile = (side: 'l' | 'r', x: number) => {
    if (!item || checked || paired.includes(x)) return;
    if (!sel || sel.side === side) { setSel(sel && sel.side === side && sel.w === x ? null : { side, w: x }); return; }
    const l = side === 'l' ? x : sel.w;
    const r = side === 'r' ? x : sel.w;
    setSel(null);
    if (l === r) {
      const now = [...paired, l];
      setPaired(now);
      speak(W[l].word);
      if (now.length < item.ws.length) {
        setLive('Matched: ' + W[l].word + ' — ' + W[l].label + '.');
        // The matched tiles are disabled: keep keyboard focus on the next word to match.
        const to = item.ws.find((k) => !now.includes(k));
        window.setTimeout(() => document.getElementById(hid + '-l' + to)?.focus(), 0);
        return;
      }
      const clean = item.ws.filter((k) => !slips[k]);
      const ok = clean.length === item.ws.length;
      setChecked({ given: '', ok });
      record(ok, item.ws, clean);
      return;
    }
    setSlips((m) => ({ ...m, [l]: (m[l] ?? 0) + 1 }));
    setShake((p) => ({ l, r, n: (p?.n ?? 0) + 1 }));
    setLive('Not a match. ' + W[l].word + ' doesn’t mean ' + W[r].label + '.');
  };

  // A wrong pair flashes briefly.
  useEffect(() => {
    if (!shake) return;
    const t = setTimeout(() => setShake(null), 600);
    return () => clearTimeout(t);
  }, [shake]);

  // Focus: the question (or its input) for a new item, Continue once it's answered, the summary at the end.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (phase === 'done') { doneHead.current?.focus(); return; }
    if (phase !== 'practice' || !item) return;
    if (checked) nextBtn.current?.focus();
    else if (isTyped(item.kind)) input.current?.focus();
    else qHead.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, item?.id, !!checked]);

  // 1–4 answer, Enter goes on, Ctrl + Space replays; ← → move between cards.
  const onKey = (ev: KeyboardEvent) => {
    const tag = (ev.target as HTMLElement).tagName;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag);
    if (item && w && ev.key === ' ' && (ev.ctrlKey || ev.metaKey) && (item.kind === 'listen' || item.kind === 'dictation')) {
      ev.preventDefault(); speak(w.word); return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey || typing) return;
    if (phase === 'meet') {
      if (ev.key === 'ArrowRight' && card < W.length - 1) { ev.preventDefault(); goCard(card + 1); }
      else if (ev.key === 'ArrowLeft' && card > 0) { ev.preventDefault(); goCard(card - 1); }
      return;
    }
    if (!item) return;
    const k = Number(ev.key);
    if (!checked && isChoice(item.kind) && k >= 1 && k <= item.choices.length) { ev.preventDefault(); check(item.choices[k - 1]); }
    else if (checked && ev.key === 'Enter' && tag !== 'BUTTON') { ev.preventDefault(); next(); }
  };

  /** Marks the day learned without saving any words. */
  const finish = async () => {
    if (!onLearn) return;
    setSaving(true);
    try { await onLearn(); } finally { setSaving(false); }
  };
  const finishBtn = (cls: string) => (
    <button className={'btn ' + cls} onClick={finish} disabled={saving}>
      <Icon name="check" size="sm" />{saving ? 'Finishing…' : 'Finish'}
    </button>
  );
  const unsaved = canSaveWords ? [...new Set(W.map((x) => x.word).filter((x) => !isSaved(x)))] : [];
  const saveAll = async () => {
    setSavingAll(true);
    const ok = await a.saveCourseWords(c.id, day, unsaved);
    setSavingAll(false);
    // The button goes away once everything is saved: keep focus nearby.
    if (ok) listHead.current?.focus();
  };

  let body: ReactNode;

  if (phase === 'meet' && mw) {
    const lastCard = card === W.length - 1;
    body = (
      <>
        <div className="lmeet-top">
          <span className="qkicker">Meet the words · {card + 1} of {W.length}</span>
          <div className="ldots" role="group" aria-label="Words">
            {W.map((x, k) => (
              <button key={k} className={'ldot' + (k === card ? ' on' : k <= seen ? ' seen' : '')} onClick={() => goCard(k)}
                aria-label={'Word ' + (k + 1) + ': ' + x.word} aria-current={k === card ? 'step' : undefined} />
            ))}
          </div>
        </div>
        <div key={card} className="lmeet animA">
          <div className="badges" style={{ justifyContent: 'center' }}>
            {mw.pos && <PosBadge>{mw.pos}</PosBadge>}
            <LevelBadge level={mw.level} />
          </div>
          <h4 className="lword" id={hid + '-w'}>{mw.word}</h4>
          <div className="ipa-row">
            {mw.ipa && <span className="ipa">{mw.ipa}</span>}
            <button className="iconbtn sm" onClick={() => speak(mw.word)} aria-label={'Play pronunciation of ' + mw.word} title="Play"><Icon name="volume" /></button>
          </div>
          {mw.vi && <div className="tr-big lvi" lang="vi">{mw.vi}</div>}
          {mw.meaning && <p className="muted lmean">{mw.meaning}</p>}
          {mw.ex && (
            <div className="lex">
              <p className="quote">“{mw.ex}”</p>
              <button className="iconbtn sm" onClick={() => speak(mw.ex, 0.95)} aria-label="Play the example sentence" title="Play example"><Icon name="volume" size="sm" /></button>
            </div>
          )}
          {canSaveWords && <SaveWordButton courseId={c.id} day={day} word={mw.word} />}
        </div>
        <div className="hwnav">
          <button className="btn btn-secondary" onClick={() => goCard(card - 1)} disabled={card === 0}><Icon name="left" size="sm" />Back</button>
          {lastCard ? (
            canPractise
              ? <button className="btn btn-primary" onClick={startPractice}><Icon name="zap" size="sm" />Start practice</button>
              : canFinish ? finishBtn('btn-primary')
                : <button className="btn btn-primary" onClick={onClose}>Done</button>
          ) : (
            <button className="btn btn-primary" onClick={() => goCard(card + 1)}>Next<Icon name="right" size="sm" /></button>
          )}
        </div>
        <div className="lmeet-foot">
          <span className="keyhint">Press <span className="kbd">←</span> <span className="kbd">→</span> to move between words</span>
          {canFinish && canPractise ? (
            <button className="linkbtn" onClick={finish} disabled={saving}>{saving ? 'Finishing…' : 'Skip practice'}</button>
          ) : (
            <button className="linkbtn" onClick={onClose}>Hide words</button>
          )}
        </div>
      </>
    );
  } else if (phase === 'practice' && item && w) {
    const ok = !!checked?.ok;
    const sentence = item.kind === 'fill' && w.blank;
    let prompt: ReactNode;
    let extra: ReactNode = null;
    if (item.kind === 'listen' || item.kind === 'dictation') {
      prompt = item.kind === 'listen' ? 'Which word do you hear?' : 'Listen and type the word you hear';
      extra = (
        <div className="listen">
          <button className="playbig" onClick={() => speak(w.word)} aria-label="Play the word again"><Icon name="volume" /></button>
          <div className="stack" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => speak(w.word, 0.6)}><Icon name="clock" size="sm" />Play slowly</button>
            <span className="muted sm">{item.kind === 'dictation' ? 'Hint: ' + (w.pos ? w.pos + ' · ' : '') + plural(w.word.replace(/\s/g, '').length, 'letter') : 'Tap to replay'}</span>
          </div>
        </div>
      );
    } else if (item.kind === 'meaning') {
      prompt = <>What does “{w.word}” mean?</>;
    } else if (item.kind === 'fill' && w.blank) {
      prompt = <>{w.blank.before}<span className="blank">{checked ? (ok ? checked.given.trim() : w.blank.found) : ' '}</span>{w.blank.after}</>;
      extra = w.label && <div className="muted sm">Hint: <span lang={w.vi ? 'vi' : undefined}>{w.label}</span></div>;
    } else if (item.kind === 'recall') {
      prompt = <span lang={w.vi ? 'vi' : undefined}>{w.label}</span>;
      extra = <div className="muted sm">Type the English word · {lettersHint(w.word)}</div>;
    } else {
      prompt = 'Match each word with its meaning';
      extra = <div className="muted sm">Tap a word, then its meaning.</div>;
    }

    let answerArea: ReactNode;
    if (isChoice(item.kind)) {
      const right = accepted(item)[0];
      answerArea = (
        <>
          <div className="opts hwopts" role="group" aria-labelledby={hid + '-q'}>
            {item.choices.map((t, k) => {
              const isAns = t === right;
              const cls = !checked ? '' : isAns ? ' correct' : t === checked.given ? ' wrong' : ' dim';
              return (
                <button key={k} className={'opt' + cls} onClick={() => check(t)} disabled={!!checked} aria-pressed={checked ? t === checked.given : undefined}
                  lang={item.kind === 'meaning' && w.vi ? 'vi' : undefined}>
                  <span className="letter">{k + 1}</span>
                  <span className="grow">{t}</span>
                  {checked && isAns && <Icon name="check" size="sm" />}
                  {checked && !isAns && t === checked.given && <Icon name="x" size="sm" />}
                </button>
              );
            })}
          </div>
          {!checked && <span className="keyhint">Press <span className="kbd">1</span>–<span className="kbd">{item.choices.length}</span> to answer</span>}
        </>
      );
    } else if (isTyped(item.kind)) {
      answerArea = (
        <form className="wuform" onSubmit={(ev: FormEvent) => { ev.preventDefault(); if (checked) next(); else check(); }}>
          <input ref={input} className={'input input-lg' + (checked ? (ok ? ' ok' : ' err') : '')} placeholder="Type the word…" value={answer} aria-labelledby={hid + '-q'}
            autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={100} readOnly={!!checked}
            onChange={(ev) => setAnswer(ev.target.value)} />
          {!checked && (
            <>
              <button type="button" className="btn btn-ghost" onClick={reveal}>Show answer</button>
              <button type="submit" className="btn btn-primary" disabled={!answer.trim()}><Icon name="check" size="sm" />Check</button>
            </>
          )}
        </form>
      );
    } else {
      const tile = (side: 'l' | 'r', x: number) => {
        const done = paired.includes(x);
        const on = sel?.side === side && sel.w === x;
        const bad = shake && (side === 'l' ? shake.l : shake.r) === x;
        const cls = done ? ' correct' : bad ? ' wrong lshake' + (shake.n % 2 ? 'A' : 'B') : on ? ' picked' : '';
        const text = side === 'l' ? W[x].word : W[x].label;
        return (
          <button key={side + x} id={hid + '-' + side + x} className={'opt lmtile' + cls} onClick={() => pickTile(side, x)} disabled={done || !!checked}
            aria-pressed={on} lang={side === 'r' && W[x].vi ? 'vi' : undefined}
>
            <span className="grow">{text}</span>
            {done && <Icon name="check" size="sm" />}
          </button>
        );
      };
      answerArea = (
        <div className="lmatch">
          <div className="opts" role="group" aria-label="Words">{item.ws.map((x) => tile('l', x))}</div>
          <div className="opts" role="group" aria-label="Meanings">{item.right.map((x) => tile('r', x))}</div>
        </div>
      );
    }

    const missedPairs = item.kind === 'match' ? item.ws.filter((k) => slips[k]) : [];
    body = (
      <>
        <div className="hwbar">
          <span className="scount" aria-hidden="true">{run.done + 1} / {total}</span>
          <span className="prog" role="progressbar" aria-label="Practice" aria-valuemin={0} aria-valuemax={total} aria-valuenow={run.done}
            aria-valuetext={'Item ' + (run.done + 1) + ' of ' + total}>
            <div style={{ width: Math.round(((run.done + (checked ? 1 : 0)) / total) * 100) + '%' }} />
          </span>
          {run.streak >= 2 && <span className="badge t-orange lstreak" title="Correct in a row"><Icon name="flame" size="sm" />{run.streak}<span className="c-sr"> correct in a row</span></span>}
        </div>
        <div key={item.id} className="hwq animA">
          <span className="qkicker">{KIND[item.kind]}</span>
          <h4 ref={qHead} tabIndex={-1} className={'qtext hwprompt' + (sentence ? ' sentence' : '')} id={hid + '-q'}>{prompt}</h4>
          {extra}
          {answerArea}
          {item.kind === 'listen' || item.kind === 'dictation' ? (
            !speech && <div className="errtxt"><Icon name="alert" size="sm" />Your browser can’t play speech, so audio may not work here.</div>
          ) : null}
        </div>
        <div aria-live="polite" aria-atomic="true">
          {checked && (
            <div className={'wufb ' + (ok ? 'ok' : 'no')}>
              <b className="wufb-t"><Icon name={ok ? 'checkc' : 'alert'} size="sm" />
                {item.kind === 'match' ? (ok ? 'All matched — no mistakes!' : 'All matched.') : ok ? 'Correct!' : checked.given ? 'Not quite.' : 'Here’s the answer.'}
              </b>
              {item.kind === 'match' ? (
                missedPairs.length > 0 && <span>Mixed up: {missedPairs.map((k) => W[k].word).join(', ')}.</span>
              ) : (
                <>
                  <span className="lans">
                    <b className={ok ? 'hw-ok' : undefined}>{w.word}</b>
                    {w.ipa && <span className="ipa">{w.ipa}</span>}
                    {w.vi && <span className="muted" lang="vi">· {w.vi}</span>}
                    <button className="iconbtn sm" onClick={() => speak(w.word)} aria-label={'Play pronunciation of ' + w.word} title="Play"><Icon name="volume" size="sm" /></button>
                  </span>
                  {item.kind === 'fill' && w.blank && !ok && w.blank.found.toLowerCase() !== w.word.toLowerCase() && (
                    <span className="sm">In this sentence: <b>{w.blank.found}</b></span>
                  )}
                  {item.kind !== 'fill' && w.ex && <span className="muted sm">“{w.ex}”</span>}
                  {!ok && <span className="muted sm">You’ll see this one again in a moment.</span>}
                </>
              )}
            </div>
          )}
        </div>
        <div className="hwnav">
          <button className="btn btn-ghost" onClick={onClose}>Stop</button>
          {checked && <button ref={nextBtn} className="btn btn-primary" onClick={next}>Continue<Icon name="right" size="sm" /></button>}
        </div>
      </>
    );
  } else {
    const acc = run.tries ? Math.round((run.right / run.tries) * 100) : 100;
    const hardest = W.map((x, i) => ({ x, n: run.misses[i] })).filter((h) => h.n > 0).sort((a, b) => b.n - a.n);
    body = (
      <>
        <div className="hwresult">
          <h4 ref={doneHead} tabIndex={-1} className="qkicker" style={{ margin: 0 }}>Practice done<span className="c-sr">: {acc}% accuracy</span></h4>
          <div className="hwscore" aria-hidden="true"><b>{acc}%</b><span className="muted">accuracy</span></div>
          <span className="muted sm">
            {run.right} of {plural(run.tries, 'answer')} correct · all {plural(W.length, 'word')} practised in at least {MASTERY} ways.
          </span>
        </div>
        {hardest.length > 0 ? (
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Hardest</span>
            <div className="badges">{hardest.map((h) => <span key={h.x.word} className="badge t-red">{h.x.word}{h.n > 1 ? ' · ' + h.n + '×' : ''}</span>)}</div>
          </div>
        ) : (
          <span className="sm hw-ok"><Icon name="checkc" size="sm" style={{ verticalAlign: '-3px' }} /> No retries needed — great job!</span>
        )}
        {canSaveWords && (
          <div className="stack" style={{ gap: 6 }}>
            <h5 ref={listHead} tabIndex={-1} className="label lsave-t" id={hid + '-save'}>Save the words you want to keep</h5>
            <ul className="lsave" aria-labelledby={hid + '-save'}>
              {W.map((x, i) => (
                <li key={x.word + i}>
                  <span className="lsave-w">
                    <b>{x.word}</b>
                    {x.vi && <span className="muted sm" lang="vi">{x.vi}</span>}
                  </span>
                  <SaveWordButton courseId={c.id} day={day} word={x.word} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="dfoot">
          <button className="btn btn-secondary" onClick={startPractice}><Icon name="refresh" size="sm" />Practice again</button>
          {unsaved.length > 0 && (
            <button className="btn btn-secondary" onClick={saveAll} disabled={savingAll}>
              <Icon name="plus" size="sm" />
              {savingAll ? 'Saving…' : unsaved.length < W.length ? 'Save all remaining (' + unsaved.length + ')' : 'Save all ' + plural(unsaved.length, 'word')}
            </button>
          )}
          {canFinish ? finishBtn('btn-primary btn-lg')
            : <button className="btn btn-primary" onClick={onClose}><Icon name="check" size="sm" />Done</button>}
        </div>
      </>
    );
  }

  return (
    <section className="lcard" aria-label={'Learn day ' + day + '’s words'} onKeyDown={onKey}>
      {body}
      <div className="c-sr" aria-live="polite" aria-atomic="true">{live}</div>
    </section>
  );
}
