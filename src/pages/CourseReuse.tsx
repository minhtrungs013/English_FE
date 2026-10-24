import { useEffect, useMemo, useState } from 'react';
import { api, type BankItem, type CourseDetail, type ReuseWord, type Tense } from '../lib/api';
import { Icon } from '../components/ui';
import { useWB } from '../state/WordbookContext';
import { Dialog, errText } from './Courses';
import { Prompt } from './CourseHomework';
import { TENSE_LABEL, TENSES } from './CourseQuestions';

/** Up to `per` questions per word, one per tense first (the chosen tenses only). */
function autoPick(words: ReuseWord[], per: number, tenses: Tense[]): Set<string> {
  const out = new Set<string>();
  for (const w of words) {
    const list = w.items.filter((q) => !q.tense || tenses.includes(q.tense as Tense));
    const byTense = new Map<string, typeof list>();
    for (const q of list) byTense.set(q.tense, [...(byTense.get(q.tense) ?? []), q]);
    let n = 0;
    while (n < per && [...byTense.values()].some((x) => x.length)) {
      for (const x of byTense.values()) { const q = x.shift(); if (q && n < per) { out.add(q.id); n++; } }
    }
  }
  return out;
}

/**
 * Approved tense questions that OTHER courses already have for this day's words: pick some to copy into the day.
 * Copies are approved straight away (they were approved there). Nothing leaves the courses.
 */
export function ReusePicker({ c, day, onAdded, onClose }: { c: CourseDetail; day: number; onAdded: (items: BankItem[]) => void; onClose: () => void }) {
  const { a } = useWB();
  const [words, setWords] = useState<ReuseWord[] | null>(null);
  const [failed, setFailed] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [tenses, setTenses] = useState<Tense[]>(TENSES);
  const [per, setPer] = useState(2);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.reuseQuestions(c.id, day).then((r) => { if (alive) setWords(r.words); }).catch((e) => { if (alive) setFailed(errText(e, 'Couldn’t load questions from other courses.')); });
    return () => { alive = false; };
  }, [c.id, day]);

  const total = useMemo(() => (words ?? []).reduce((n, w) => n + w.items.length, 0), [words]);
  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleTense = (t: Tense) => setTenses((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : TENSES.filter((x) => x === t || prev.includes(x))));

  const add = async () => {
    if (!picked.size) return;
    setBusy(true);
    try {
      const r = await api.reuseAdd(c.id, day, [...picked]);
      onAdded(r.items);
      a.showToast('Copied ' + r.added + (r.added === 1 ? ' question' : ' questions') + ' from other courses' + (r.skipped ? ' · ' + r.skipped + ' skipped' : '') + '.');
      onClose();
    } catch (e) {
      a.showToast(errText(e, 'Couldn’t copy the questions.'), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog label={'Reuse questions from other courses for day ' + day} onClose={onClose} wide className="impmodal sbk">
      <h2>Reuse from other courses · day {day}</h2>
      <p className="sm" style={{ margin: 0 }}>
        Approved tense questions that other courses already have for this day’s words. The ones you pick are copied into this course and <b>approved straight away</b> — no AI needed.
      </p>

      <div className="sbk-tools">
        <div className="chips" role="group" aria-label="Tenses">
          {TENSES.map((t) => <button key={t} className={'chip soft' + (tenses.includes(t) ? ' on' : '')} aria-pressed={tenses.includes(t)} onClick={() => toggleTense(t)}>{TENSE_LABEL[t]}</button>)}
        </div>
        <div className="sbk-row">
          <div className="seg" role="group" aria-label="Questions per word for auto-pick">
            {[1, 2, 3].map((k) => <button key={k} className={per === k ? 'on' : ''} aria-pressed={per === k} onClick={() => setPer(k)}>{k} / word</button>)}
          </div>
          <button className="btn btn-secondary btn-sm" disabled={!words || !total} onClick={() => words && setPicked(autoPick(words, per, tenses))}><Icon name="sparkle" size="sm" />Auto-pick</button>
          {picked.size > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set())}>Clear</button>}
        </div>
      </div>

      {failed ? (
        <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{failed}</span>
      ) : !words ? (
        <div className="sk" style={{ height: 160, borderRadius: 'var(--r-md)' }} aria-busy="true" aria-label="Loading questions" />
      ) : !total ? (
        <p className="muted sm">No other course has approved questions for this day’s words yet (or this course already has them all).</p>
      ) : (
        <div className="sbk-list">
          {words.map((w) => {
            const shown = w.items.filter((q) => !q.tense || tenses.includes(q.tense as Tense));
            return (
              <section key={w.word} className="sbk-word" aria-label={w.word}>
                <header className="sbk-whead">
                  <b>{w.word}</b>
                  <span className="muted xs">{w.items.length ? w.items.length + (w.items.length === 1 ? ' question' : ' questions') + ' in other courses' : 'None in other courses'}</span>
                </header>
                {!w.items.length ? null : !shown.length ? <p className="muted xs" style={{ margin: 0 }}>None in the chosen tenses.</p> : (
                  <ul className="sbk-sents">
                    {shown.map((q) => {
                      const id = 'ru-' + q.id;
                      return (
                        <li key={q.id} className={'sbk-s' + (picked.has(q.id) ? ' on' : '')}>
                          <input id={id} type="checkbox" checked={picked.has(q.id)} onChange={() => toggle(q.id)} />
                          <label htmlFor={id}>
                            <span className="sbk-text"><Prompt q={{ type: q.kind, prompt: q.prompt }} fill={q.answer} /></span>
                            <span className="badges">
                              <span className="badge pos">{q.kind === 'tenseChoice' ? 'Multiple choice' : 'Typed'}</span>
                              {q.tenseLabel && <span className="badge t-blue">{q.tenseLabel}</span>}
                              {q.course && <span className="muted xs">from “{q.course}”</span>}
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
          {busy ? 'Copying…' : <><Icon name="plus" size="sm" />Copy {picked.size || ''} {picked.size === 1 ? 'question' : 'questions'}</>}
        </button>
      </div>
    </Dialog>
  );
}
