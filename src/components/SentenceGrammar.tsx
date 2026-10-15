import { Fragment, useId, useState, type ReactNode } from 'react';
import type { GrammarView } from '../lib/api';
import { useWB } from '../state/WordbookContext';
import { Icon } from './ui';

type Role = GrammarView['parts'][number]['role'];
const ROLE: Record<Role, string> = {
  S: 'Subject', V: 'Verb', O: 'Object', C: 'Complement', time: 'Time', place: 'Place', adv: 'Adverb', clause: 'Clause', other: ''
};
/** Lessons without drills (nothing to practise). */
const NO_PRACTICE = new Set(['aux-cheatsheet']);

/** The sentence with its time clues highlighted (used when it hasn't been split into parts). */
function Highlighted({ text, marks }: { text: string; marks: string[] }) {
  if (!marks.length) return <>{text}</>;
  const re = new RegExp('(' + marks.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i} className="sg-mark">{p}</mark> : <Fragment key={i}>{p}</Fragment>))}</>;
}

/** "S + will ('ll) + V" → pieces: S and V tinted like the sentence parts, helping words in bold, notes in brackets smaller. */
function Formula({ text }: { text: string }) {
  const pieces = text.split(/\s\+\s/);
  return (
    <div className="sg-formula">
      <span className="c-sr">{text}</span>
      {pieces.map((raw, i) => {
        const p = raw.trim();
        const kind = /^S\b/.test(p) ? 'S' : /^V/.test(p) ? 'V' : 'aux';
        const m = /^(.*?)(\s*\(.*\))?$/.exec(p)!;
        const node: ReactNode = <>{m[1]}{m[2] && <small>{m[2]}</small>}</>;
        return (
          <Fragment key={i}>
            {i > 0 && <span className="sg-plus" aria-hidden="true">+</span>}
            <span className={'sg-tok k-' + kind} aria-hidden="true">{node}</span>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * "Grammar" for one sentence: a toggle that opens a card with the tense, the sentence split into parts (or with its
 * time clues highlighted), the formula, the explanation and the lesson. Only given sentences the learner may see the
 * answer of. `practice`: show "Practise" (not inside a study session, which it would leave).
 */
export function SentenceGrammar({ g, practice = true }: { g: GrammarView | null | undefined; practice?: boolean }) {
  const { a } = useWB();
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!g) return null;
  const notes = [...(g.explain ? [g.explain] : []), ...g.notes.map((n) => n.text)];
  return (
    <div className="sg">
      <button className={'sg-toggle' + (open ? ' on' : '')} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Icon name="type" size="sm" />Grammar<Icon name="down" size="sm" className="sg-chev" />
      </button>
      {open && (
        <section id={id} className="sg-card" aria-label="Grammar of this sentence">
          {g.lesson && (
            <header className="sg-head">
              <span className="sg-tense"><Icon name="clock" size="sm" />{g.lesson.name}</span>
              <span className="sg-vi" lang="vi">{g.lesson.vi}</span>
              {g.level === 'basic' && <span className="sg-auto" title="Found from the sentence pattern">Auto</span>}
            </header>
          )}

          {g.parts.length ? (
            <ol className="sg-parts" aria-label="Sentence structure">
              {g.parts.map((p, i) => (
                <li key={i} className={'sg-part r-' + p.role}>
                  <span className="sg-text">{p.text}</span>
                  {ROLE[p.role] ? <span className="sg-role">{ROLE[p.role]}</span> : <span className="sg-role" aria-hidden="true">&nbsp;</span>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="sg-sentence"><Highlighted text={g.text} marks={g.signals} /></p>
          )}

          {g.formula && (
            <div className="sg-block">
              <span className="sg-label">Formula</span>
              <Formula text={g.formula} />
            </div>
          )}

          {g.signals.length && g.parts.length ? (
            <div className="sg-block">
              <span className="sg-label">Time clues</span>
              <div className="sg-clues">{g.signals.map((s) => <span key={s} className="sg-clue">{s}</span>)}</div>
            </div>
          ) : null}

          {notes.length ? (
            <div className="sg-tip" lang="vi">
              <span className="sg-tip-ic" aria-hidden="true">💡</span>
              <div>{notes.map((n, i) => <p key={i}>{n}</p>)}</div>
            </div>
          ) : null}

          {g.lesson && (
            <footer className="sg-foot">
              <button className="btn btn-primary btn-sm" onClick={() => a.openGrammar(g.lesson!.id)}><Icon name="book" size="sm" />Open lesson</button>
              {practice && !NO_PRACTICE.has(g.lesson.id) && (
                <button className="btn btn-secondary btn-sm" onClick={() => a.startGrammarPractice(g.lesson!.id)}><Icon name="zap" size="sm" />Practise 10</button>
              )}
            </footer>
          )}
        </section>
      )}
    </div>
  );
}
