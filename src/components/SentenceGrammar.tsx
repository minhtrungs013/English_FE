import { useId, useState } from 'react';
import type { GrammarView } from '../lib/api';
import { useWB } from '../state/WordbookContext';
import { Icon } from './ui';

const ROLE: Record<GrammarView['parts'][number]['role'], string> = {
  S: 'Subject', V: 'Verb', O: 'Object', C: 'Complement', time: 'Time', place: 'Place', adv: 'Adverb', clause: 'Clause', other: ''
};
/** Lessons without drills (nothing to practise). */
const NO_PRACTICE = new Set(['aux-cheatsheet']);

/**
 * "Grammar" for one sentence: a toggle that opens its structure (subject / verb / object…), the tense with its formula
 * and time clues, the explanation and the lesson. Only given sentences the learner may see the answer of.
 * `practice`: show "Practise" (not inside a study session, which it would leave).
 */
export function SentenceGrammar({ g, practice = true }: { g: GrammarView | null | undefined; practice?: boolean }) {
  const { a } = useWB();
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!g) return null;
  return (
    <div className="sg">
      <button className="linkbtn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Icon name="type" size="sm" />{open ? 'Hide grammar' : 'Grammar'}
      </button>
      {open && (
        <div id={id} className="sg-panel">
          {g.parts.length ? (
            <ol className="sg-parts" aria-label="Sentence structure">
              {g.parts.map((p, i) => (
                <li key={i} className={'sg-part r-' + p.role}>
                  <span className="sg-text">{p.text}</span>
                  {ROLE[p.role] && <span className="sg-role">{ROLE[p.role]}</span>}
                </li>
              ))}
            </ol>
          ) : null}
          {g.lesson && (
            <div className="sg-tense">
              <span className="badge t-blue"><Icon name="clock" size="sm" />{g.lesson.name}</span>
              <span className="muted sm" lang="vi">{g.lesson.vi}</span>
            </div>
          )}
          {g.formula && <code className="sg-formula">{g.formula}</code>}
          {g.signals.length ? (
            <div className="sg-row"><span className="muted xs">Time clues</span>{g.signals.map((s) => <span key={s} className="chip sm">{s}</span>)}</div>
          ) : null}
          {g.explain && <p className="sm sg-explain" lang="vi">{g.explain}</p>}
          {g.notes.map((n, i) => <p key={i} className="sm sg-note" lang="vi"><span aria-hidden="true">💡 </span>{n.text}</p>)}
          {g.level === 'basic' && g.lesson && <p className="muted xs">Tense found automatically from the sentence pattern.</p>}
          {g.lesson && (
            <div className="sg-row">
              <button className="btn btn-secondary btn-sm" onClick={() => a.openGrammar(g.lesson!.id)}><Icon name="book" size="sm" />Open lesson: {g.lesson.name}</button>
              {practice && !NO_PRACTICE.has(g.lesson.id) && (
                <button className="btn btn-ghost btn-sm" onClick={() => a.startGrammarPractice(g.lesson!.id)}>Practise 10 questions</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
