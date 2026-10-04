import type { IconName } from '../lib/icons';
import { useWB, type PracticeMode } from '../state/WordbookContext';
import { Icon, PageHead } from '../components/ui';

const MODES: [PracticeMode | 'flash', string, string, IconName, string][] = [
  ['flash', 'Flashcards', 'Review your words with flip cards.', 'cards', 't-indigo'],
  ['mc', 'Multiple Choice', 'Choose the right meaning for each word.', 'listcheck', 't-green'],
  ['fill', 'Fill in the Blank', 'Complete sentences with the missing word.', 'type', 't-orange'],
  ['trans', 'Translation', 'Translate Vietnamese into English.', 'globe', 't-blue'],
  ['listen', 'Listening', 'Hear a word and type what you hear.', 'volume', 't-red']
];

export function Practice() {
  const { a } = useWB();
  return (
    <>
      <PageHead title="Practice" sub="Choose how you want to practice." />
      <div className="pgrid">
        {MODES.map(([mode, title, desc, icon, tint]) => (
          <div key={mode} className="card pcard">
            <span className={'stat-ic ' + tint}><Icon name={icon} size="lg" /></span>
            <h3>{title}</h3>
            <p>{desc}</p>
            <button className="btn btn-secondary" onClick={() => a.startPractice(mode)}>Start<Icon name="right" size="sm" /></button>
          </div>
        ))}
      </div>
    </>
  );
}
