import { Fragment, useEffect, useMemo, useState } from 'react';
import { api, type BankItem, type BankSentence, type BankWord, type CourseDetail, type Tense } from '../lib/api';
import { Icon } from '../components/ui';
import { useWB } from '../state/WordbookContext';
import { Dialog, errText } from './Courses';
import { TENSE_LABEL, TENSES } from './CourseQuestions';

type Kind = 'tense' | 'tenseChoice';
type Mode = 'mix' | Kind;
const CONTEXT_LABEL: Record<string, string> = {
  meeting: 'Meeting', email: 'Email', interview: 'Interview', chat: 'Chat', phone: 'Phone', report: 'Report', presentation: 'Presentation', customer: 'Customer', other: 'Other'
};

/** The sentence with its verb phrase highlighted (that's what the learner will fill in). */
function Marked({ s }: { s: BankSentence }) {
  const at = s.verb ? s.sentence.indexOf(s.verb) : -1;
  if (at < 0) return <>{s.sentence}</>;
  return <>{s.sentence.slice(0, at)}<mark className="sbk-verb">{s.verb}</mark>{s.sentence.slice(at + s.verb.length)}</>;
}

/** Picks `per` sentences per word: tenses the word doesn't have yet first, all different, never used ones. */
function autoPick(words: BankWord[], per: number, tenses: Tense[]): Set<string> {
  const out = new Set<string>();
  for (const w of words) {
    const free = w.sentences.filter((s) => s.canAsk && !s.used && tenses.includes(s.tense as Tense));
    const order = [...free].sort((a, b) => Number(w.has.includes(a.tense as Tense)) - Number(w.has.includes(b.tense as Tense)) || Math.random() - 0.5);
    const seen = new Set<string>();
    for (const s of order) {
      if (out.size >= 60 || [...seen].length >= per) break;
      if (seen.has(s.tense)) continue;
      seen.add(s.tense);
      out.add(s.id);
    }
  }
  return out;
}

/**
 * Pick questions for a day from the word sentence bank: each of the day's words with its checked example sentences.
 * Picked sentences become tense questions (the verb phrase is the blank), approved straight away.
 */
export function SentenceBankPicker({ c, day, onAdded, onClose }: { c: CourseDetail; day: number; onAdded: (items: BankItem[]) => void; onClose: () => void }) {
  const { a } = useWB();
  const [words, setWords] = useState<BankWord[] | null>(null);
  const [failed, setFailed] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [tenses, setTenses] = useState<Tense[]>(TENSES);
  const [mode, setMode] = useState<Mode>('mix');
  const [per, setPer] = useState(2);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.bankSentences(c.id, day).then((r) => { if (alive) setWords(r.words); }).catch((e) => { if (alive) setFailed(errText(e, 'Couldn’t load the sentence bank.')); });
    return () => { alive = false; };
  }, [c.id, day]);

  const byId = useMemo(() => new Map((words ?? []).flatMap((w) => w.sentences.map((s) => [s.id, s] as const))), [words]);
  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleTense = (t: Tense) => setTenses((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : TENSES.filter((x) => x === t || prev.includes(x))));
  const total = (words ?? []).reduce((n, w) => n + w.sentences.length, 0);

  const add = async () => {
    if (!picked.size) return;
    setBusy(true);
    try {
      // Mix: alternate typed and multiple choice (multiple choice only where the verb has choices).
      let n = 0;
      const items = [...picked].map((id) => {
        const s = byId.get(id);
        const choice = !!s?.canChoose && (mode === 'tenseChoice' || (mode === 'mix' && n++ % 2 === 1));
        return { id, kind: (choice ? 'tenseChoice' : 'tense') as Kind };
      });
      const r = await api.addFromBank(c.id, day, items);
      onAdded(r.items);
      a.showToast('Added ' + r.added + (r.added === 1 ? ' question' : ' questions') + ' from the sentence bank' + (r.skipped ? ' · ' + r.skipped + ' skipped' : '') + '.');
      onClose();
    } catch (e) {
      a.showToast(errText(e, 'Couldn’t add the questions.'), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog label={'Pick questions from the sentence bank for day ' + day} onClose={onClose} wide className="impmodal sbk">
      <h2>Sentence bank · day {day}</h2>
      <p className="sm" style={{ margin: 0 }}>
        Checked example sentences for this day’s words. Each one you pick becomes a tense question — the <mark className="sbk-verb">highlighted verb</mark> is the blank — and is <b>approved straight away</b>.
      </p>

      <div className="sbk-tools">
        <div className="chips" role="group" aria-label="Tenses">
          {TENSES.map((t) => <button key={t} className={'chip soft' + (tenses.includes(t) ? ' on' : '')} aria-pressed={tenses.includes(t)} onClick={() => toggleTense(t)}>{TENSE_LABEL[t]}</button>)}
        </div>
        <div className="sbk-row">
          <div className="seg" role="group" aria-label="Question type">
            {(['mix', 'tense', 'tenseChoice'] as Mode[]).map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>{m === 'mix' ? 'Mix' : m === 'tense' ? 'Typed' : 'Multiple choice'}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Sentences per word for auto-pick">
            {[1, 2, 3].map((k) => <button key={k} className={per === k ? 'on' : ''} aria-pressed={per === k} onClick={() => setPer(k)}>{k} / word</button>)}
          </div>
          <button className="btn btn-secondary btn-sm" disabled={!words} onClick={() => words && setPicked(autoPick(words, per, tenses))}><Icon name="sparkle" size="sm" />Auto-pick</button>
          {picked.size > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set())}>Clear</button>}
        </div>
      </div>

      {failed ? (
        <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{failed}</span>
      ) : !words ? (
        <div className="sk" style={{ height: 160, borderRadius: 'var(--r-md)' }} aria-busy="true" aria-label="Loading sentences" />
      ) : !total ? (
        <p className="muted sm">The sentence bank has no sentences for this day’s words yet.</p>
      ) : (
        <div className="sbk-list">
          {words.map((w) => {
            const shown = w.sentences.filter((s) => !s.tense || tenses.includes(s.tense as Tense));
            return (
              <section key={w.word} className="sbk-word" aria-label={w.word}>
                <header className="sbk-whead">
                  <b>{w.word}</b>
                  <span className="muted xs">{w.has.length ? 'In this course: ' + w.has.map((t) => TENSE_LABEL[t] ?? t).join(', ') : 'No tense questions yet'}</span>
                </header>
                {!shown.length ? <p className="muted xs" style={{ margin: 0 }}>No sentences in the chosen tenses.</p> : (
                  <ul className="sbk-sents">
                    {shown.map((s) => {
                      const off = s.used || !s.canAsk;
                      const id = 'sbk-' + s.id;
                      return (
                        <li key={s.id} className={'sbk-s' + (picked.has(s.id) ? ' on' : '') + (off ? ' off' : '')}>
                          <input id={id} type="checkbox" checked={picked.has(s.id)} disabled={off} onChange={() => toggle(s.id)} />
                          <label htmlFor={id}>
                            <span className="sbk-text"><Marked s={s} /></span>
                            <span className="badges">
                              {s.tenseLabel ? <span className="badge t-blue">{s.tenseLabel}</span> : <span className="badge pos">No tense lesson</span>}
                              <span className="badge pos">{CONTEXT_LABEL[s.context] ?? s.context}</span>
                              {s.used && <span className="badge t-green"><Icon name="check" size="sm" />Added</span>}
                              {!s.used && !s.canAsk && s.tense && <span className="muted xs">Verb phrase can’t be a blank</span>}
                              {!s.used && s.canAsk && !s.canChoose && <span className="muted xs">Typed only</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="mfoot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={add} disabled={busy || !picked.size}>
          {busy ? 'Adding…' : <Fragment><Icon name="plus" size="sm" />Add {picked.size || ''} {picked.size === 1 ? 'question' : 'questions'}</Fragment>}
        </button>
      </div>
    </Dialog>
  );
}
