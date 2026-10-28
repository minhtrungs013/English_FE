import { useEffect, useMemo, useState } from 'react';
import type { IconName } from '../lib/icons';
import { api, type PracticeStats, type PracticeWordMode } from '../lib/api';
import { WEAK_MODE_LABEL } from '../lib/practice';
import { hasWordform } from '../lib/wordform';
import { useWB, type PracticeMode } from '../state/WordbookContext';
import { Icon, PageHead } from '../components/ui';
import { WordModal } from './VocabDetail';

type Tile = [PracticeMode | 'flash' | 'dictation' | 'write' | 'mistakes', string, string, IconName, string];
/** The practice tiles in two groups: a practice mode, or a page of its own (dictation, write, mistakes). */
const GROUPS: { title: string; tiles: Tile[] }[] = [
  {
    title: 'Words',
    tiles: [
      ['flash', 'Flashcards', 'Flip cards to review your words.', 'cards', 't-indigo'],
      ['mc', 'Multiple choice', 'Pick the right meaning.', 'listcheck', 't-green'],
      ['trans', 'Translation', 'Vietnamese → type the English word.', 'globe', 't-blue'],
      ['listen', 'Listening', 'Hear a word, type it.', 'volume', 't-red'],
      ['wordform', 'Word forms', 'decide → decision, decisive.', 'layers', 't-indigo']
    ]
  },
  {
    title: 'Sentences',
    tiles: [
      ['fill', 'Fill in the blank', 'Complete sentences with your words.', 'type', 't-orange'],
      ['tense', 'Verb tenses', 'Put the verb in the right tense.', 'clock', 't-amber'],
      ['dictation', 'Dictation', 'Listen and type — nghe – chép.', 'headphones', 't-amber'],
      ['write', 'Write a sentence', 'Your own sentence, scored by AI.', 'sparkle', 't-green'],
      ['mistakes', 'My mistakes', 'What you get wrong in your sentences.', 'alert', 't-red']
    ]
  }
];

/** Word forms needs at least this many of my words with a usable word family. */
const WORDFORM_MIN = 3;
/** Weak words shown before "Show all". */
const WEAK_SHOWN = 6;

const ago = (t: number) => {
  if (!t) return '';
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago';
};

/** The words I keep getting wrong in practice, the modes I get them wrong in, and this week's progress. */
function WeakWords({ st, onPeek }: { st: PracticeStats; onPeek: (id: string) => void }) {
  const { a } = useWB();
  const [all, setAll] = useState(false);
  const list = all ? st.weak : st.weak.slice(0, WEAK_SHOWN);
  const fixed = st.week.fixed;
  if (!st.weak.length) {
    return (
      <section className="card pweak" aria-labelledby="pweak-h">
        <div className="pweak-head">
          <h2 id="pweak-h"><Icon name="checkc" />Words to fix</h2>
          {fixed > 0 && <span className="muted sm">This week: {fixed} {fixed === 1 ? 'word' : 'words'} fixed</span>}
        </div>
        <p className="muted sm" style={{ margin: 0 }}>
          {st.records.length ? 'No weak words right now 🎉 Words you get wrong in practice show up here until you get them right twice in a row.'
            : 'Words you get wrong in practice show up here, so you can practise them again until you get them right twice in a row.'}
        </p>
      </section>
    );
  }
  return (
    <section className="card pweak" aria-labelledby="pweak-h">
      <div className="pweak-head">
        <h2 id="pweak-h"><Icon name="alert" />Words to fix <span className="badge t-red">{st.weak.length}</span></h2>
        <span className="muted sm">This week: {fixed} {fixed === 1 ? 'word' : 'words'} fixed · {st.week.wrong} wrong {st.week.wrong === 1 ? 'answer' : 'answers'}</span>
      </div>
      <ul className="pweak-list">
        {list.map((x) => (
          <li key={x.wordId}>
            <button className="pweak-word" onClick={() => onPeek(x.wordId)} aria-label={'Look at ' + x.word}>
              <b>{x.word}</b>{x.vi && <span className="muted sm" lang="vi">{x.vi}</span>}
            </button>
            <span className="pweak-modes">
              {x.modes.map((md) => (
                <span key={md.mode} className="badge t-amber" title={md.wrong + ' wrong in total' + (md.spelling ? ', ' + md.spelling + ' almost right (spelling)' : '')}>
                  {WEAK_MODE_LABEL[md.mode]} ×{md.errors}{md.spelling ? ' · spelling' : ''}
                </span>
              ))}
              {x.lastWrongAt > 0 && <span className="muted xs">wrong {ago(x.lastWrongAt)}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="pweak-foot">
        {st.weak.length > WEAK_SHOWN && (
          <button className="btn btn-ghost btn-sm" onClick={() => setAll(!all)} aria-expanded={all}>{all ? 'Show fewer' : 'Show all ' + st.weak.length}</button>
        )}
        <button className="btn btn-primary" onClick={() => a.startPractice('weak')}><Icon name="refresh" size="sm" />Practise {st.weak.length === 1 ? 'it' : 'these'} now</button>
      </div>
    </section>
  );
}

export function Practice() {
  const { s, a } = useWB();
  const familyWords = useMemo(() => s.words.filter((w) => hasWordform(w.family)).length, [s.words]);
  const [st, setSt] = useState<PracticeStats | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  // Fresh numbers each time the page opens (practice sessions change them).
  useEffect(() => { api.practiceStats().then(setSt).catch(() => setSt(null)); }, []);
  return (
    <>
      <PageHead title="Practice" sub="Choose how you want to practice." />
      {st && <WeakWords st={st} onPeek={setPeek} />}
      {GROUPS.map((g) => (
        <section key={g.title} className="psec" aria-labelledby={'psec-' + g.title}>
          <h2 id={'psec-' + g.title}>{g.title}</h2>
          <div className="ptiles">
            {g.tiles.map(([mode, title, desc, icon, tint]) => {
              const locked = mode === 'wordform' && familyWords < WORDFORM_MIN;
              const weak = st?.byMode[mode as PracticeWordMode] ?? 0;
              return (
                <button key={mode} className="ptile" disabled={locked}
                  onClick={() => (mode === 'dictation' ? a.go('dictation') : mode === 'write' ? a.go('writeSentence') : mode === 'mistakes' ? a.go('mistakes') : a.startPractice(mode))}>
                  <span className={'stat-ic ' + tint}><Icon name={locked ? 'lock' : icon} /></span>
                  <span className="ptile-body">
                    <span className="ptile-title">{title}{weak > 0 && <span className="badge t-amber">{weak} to fix</span>}</span>
                    <span className="ptile-desc">{locked ? 'Save at least ' + WORDFORM_MIN + ' words with a word family (“+N forms”) first.' : desc}</span>
                  </span>
                  {!locked && <Icon name="right" size="sm" className="ptile-go" />}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {peek && <WordModal id={peek} onClose={() => setPeek(null)} />}
    </>
  );
}
