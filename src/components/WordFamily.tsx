import { useEffect, useState } from 'react';
import { api, type FamilyStatus } from '../lib/api';
import { sortFamily, type FamilyMember } from '../lib/data';
import { speak } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { Icon } from './ui';

/** Small muted "+N forms" tag for list rows; nothing when the word has no family. */
export function FamilyTag({ family }: { family?: FamilyMember[] }) {
  const n = (family?.length ?? 0) - 1;
  if (n < 1) return null;
  return <span className="famtag" title={'Word family: ' + family!.map((m) => m.word).join(', ')}>+{n} {n === 1 ? 'form' : 'forms'}</span>;
}

/** Save / "In your words" action for one family member. */
function MemberAction({ m, st }: { m: FamilyMember; st: FamilyStatus | undefined }) {
  const { s, a } = useWB();
  const [busy, setBusy] = useState(false);
  const key = m.word.toLowerCase();
  // My words in memory first (fresh after a save), then the server's answer.
  const mineId = s.words.find((w) => w.word.toLowerCase() === key)?.id ?? (st?.myWordId && s.words.some((w) => w.id === st.myWordId) ? st.myWordId : null);
  if (mineId) {
    return (
      <button className="btn btn-ghost btn-sm famact" onClick={() => a.go('detail', { sel: mineId })} aria-label={'Open “' + m.word + '” in your words'}>
        <Icon name="check" size="sm" style={{ color: 'var(--success)' }} />In your words
      </button>
    );
  }
  if (!st?.libraryId) return null;
  const id = st.libraryId;
  return (
    <button className="btn btn-secondary btn-sm famact" disabled={busy} aria-label={'Save “' + m.word + '” to my vocabulary'}
      onClick={async () => { setBusy(true); await a.saveFromLibrary({ id, word: m.word }); setBusy(false); }}>
      <Icon name="plus" size="sm" />{busy ? 'Saving…' : 'Save'}
    </button>
  );
}

/**
 * "Word family" section: the word's other forms (Verb → Noun → Adjective → Adverb → Other), each with
 * pronunciation and a Save / "In your words" action. Renders nothing for fewer than 2 members.
 */
export function WordFamily({ word, family, className }: { word: string; family?: FamilyMember[]; className?: string }) {
  const [status, setStatus] = useState<Record<string, FamilyStatus>>({});
  const list = family && family.length >= 2 ? sortFamily(family) : [];
  const cur = word.trim().toLowerCase();
  const others = list.map((m) => m.word).filter((x) => x.toLowerCase() !== cur).slice(0, 10);
  const othersKey = others.join('\n');

  // One status lookup each time the detail opens (or shows another word).
  useEffect(() => {
    setStatus({});
    if (!othersKey) return;
    let alive = true;
    api.familyStatus(othersKey.split('\n')).then((r) => {
      if (!alive) return;
      const map: Record<string, FamilyStatus> = {};
      r.items.forEach((it) => { map[it.word.toLowerCase()] = it; });
      setStatus(map);
    }).catch(() => { /* offline or older server: just no Save buttons */ });
    return () => { alive = false; };
  }, [cur, othersKey]);

  if (list.length < 2) return null;
  const hid = 'fam-' + cur.replace(/[^a-z0-9]+/g, '-');
  return (
    <section className={'family' + (className ? ' ' + className : '')} aria-labelledby={hid}>
      <span className="sec-t" id={hid}>Word family</span>
      <ul className="famlist">
        {list.map((m, i) => {
          const self = m.word.toLowerCase() === cur;
          return (
            <li key={m.word + i} className={'famrow' + (self ? ' self' : '')} aria-current={self ? 'true' : undefined}>
              <span className="badge pos fampos">{m.pos}</span>
              <div className="fammain">
                <div className="famhead">
                  <b className="famword">{m.word}</b>
                  {self && <span className="famself">this word</span>}
                  {m.note && <span className="famnote">{m.note}</span>}
                </div>
                {m.vi && <div className="famvi" lang="vi">{m.vi}</div>}
                {m.ex && <div className="famex">“{m.ex}”</div>}
              </div>
              <div className="famside">
                <button className="iconbtn sm" onClick={() => speak(m.word)} aria-label={'Play pronunciation of ' + m.word} title="Play"><Icon name="volume" size="sm" /></button>
                {!self && <MemberAction m={m} st={status[m.word.toLowerCase()]} />}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
