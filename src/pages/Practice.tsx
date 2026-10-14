import { useMemo } from 'react';
import type { IconName } from '../lib/icons';
import { hasWordform } from '../lib/wordform';
import { useWB, type PracticeMode } from '../state/WordbookContext';
import { Icon, PageHead } from '../components/ui';

/** The skill cards: a practice mode, or 'dictation' (opens the Dictation hub). */
const MODES: [PracticeMode | 'flash' | 'dictation', string, string, IconName, string][] = [
  ['flash', 'Flashcards', 'Review your words with flip cards.', 'cards', 't-indigo'],
  ['mc', 'Multiple Choice', 'Choose the right meaning for each word.', 'listcheck', 't-green'],
  ['fill', 'Fill in the Blank', 'Complete sentences with the missing word.', 'type', 't-orange'],
  ['wordform', 'Word forms', 'Use the right form of the word: decide → decision, decisive, decisively.', 'layers', 't-indigo'],
  ['trans', 'Translation', 'Translate Vietnamese into English.', 'globe', 't-blue'],
  ['listen', 'Listening', 'Hear a word and type what you hear.', 'volume', 't-red'],
  ['dictation', 'Dictation', 'Listen to sentences and type them — Nghe – chép.', 'headphones', 't-amber']
];

/** Word forms needs at least this many of my words with a usable word family. */
const WORDFORM_MIN = 3;

export function Practice() {
  const { s, a } = useWB();
  const familyWords = useMemo(() => s.words.filter((w) => hasWordform(w.family)).length, [s.words]);
  return (
    <>
      <PageHead title="Practice" sub="Choose how you want to practice." />
      <div className="pgrid">
        {MODES.map(([mode, title, desc, icon, tint]) => {
          const locked = mode === 'wordform' && familyWords < WORDFORM_MIN;
          const noteId = 'pnote-' + mode;
          return (
            <div key={mode} className={'card pcard' + (locked ? ' locked' : '')}>
              <span className={'stat-ic ' + tint}><Icon name={icon} size="lg" /></span>
              <h3>{title}</h3>
              <p>{desc}</p>
              {locked && (
                <p className="pnote sm" id={noteId}><Icon name="lock" size="sm" />Save words that have a word family first (look for “+N forms”).</p>
              )}
              <button className="btn btn-secondary" disabled={locked} aria-describedby={locked ? noteId : undefined}
                onClick={() => (mode === 'dictation' ? a.go('dictation') : a.startPractice(mode))}>
                Start<span className="c-sr"> {title.toLowerCase()}</span><Icon name="right" size="sm" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
