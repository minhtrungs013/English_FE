import { useState } from 'react';
import type { Topic } from '../lib/api';
import { fmtAgo, fmtDate, fmtNext, type Word } from '../lib/data';
import { speak } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { Icon, LevelBadge, PosBadge, StatusBadge } from '../components/ui';
import { TOPIC_LABEL } from './Library';

/** Shows whether the word is in the shared library, and lets the user share it if not. */
function ShareCard({ w }: { w: Word }) {
  const { s, a } = useWB();
  const [topic, setTopic] = useState<Topic>(w.tags.includes('interview') ? 'interview' : 'it');
  const [busy, setBusy] = useState(false);
  const inLibrary = s.shared.includes(w.word.toLowerCase());
  return (
    <div className="card pad sharebox">
      <span className="sec-t">Vocabulary library</span>
      {inLibrary ? (
        <>
          <p className="muted sm" style={{ margin: 0 }}>This word is in the shared library, so everyone can find and save it.</p>
          <button className="btn btn-secondary" onClick={() => a.go('library')}><Icon name="globe" size="sm" />Open the library</button>
        </>
      ) : (
        <>
          <p className="muted sm" style={{ margin: 0 }}>Not in the library yet. Share it so other learners can save it too — your name is shown as the author.</p>
          <label className="label" htmlFor="share-topic">Topic</label>
          <select id="share-topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value as Topic)}>
            {(Object.keys(TOPIC_LABEL) as Topic[]).map((t) => <option key={t} value={t}>{TOPIC_LABEL[t]}</option>)}
          </select>
          <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); await a.shareWord(w, topic); setBusy(false); }}>
            <Icon name="globe" size="sm" />{busy ? 'Sharing…' : 'Share to library'}
          </button>
        </>
      )}
    </div>
  );
}

export function VocabDetail() {
  const { s, a } = useWB();
  const w = s.words.find((x) => x.id === s.sel);
  const back = <button className="back" onClick={() => a.go('vocab')}><Icon name="left" size="sm" />Back to Vocabulary</button>;

  if (!w) {
    return (
      <>
        {back}
        <div className="card empty">
          <h3>Word not found</h3>
          <p>It may have been deleted.</p>
          <button className="btn btn-secondary" onClick={() => a.go('vocab')}>Back to Vocabulary</button>
        </div>
      </>
    );
  }

  const cat = s.cats.find((c) => c.id === w.cat);
  return (
    <>
      {back}
      <div className="detail">
        <div className="card">
          <div className="wordhero">
            <div className="badges"><PosBadge>{w.pos}</PosBadge><LevelBadge level={w.level} /><StatusBadge status={w.status} /></div>
            <h1 className="word-big">{w.word}</h1>
            <div className="ipa-row">
              <span className="ipa">{w.ipa}</span>
              <button className="iconbtn sm" onClick={() => speak(w.word)} aria-label="Play pronunciation"><Icon name="volume" /></button>
            </div>
          </div>
          <div className="sec">
            <div className="tr-big">{w.vi}</div>
            <div style={{ fontSize: 16 }}>{w.meaning}</div>
          </div>
          {w.ex && <div className="sec"><span className="sec-t">Example</span><p className="quote">“{w.ex}”</p></div>}
          {(w.syn.length > 0 || w.ant.length > 0) && (
            <div className="sec">
              <div className="form2" style={{ gap: 16 }}>
                <div className="stack" style={{ gap: 10 }}>
                  <span className="sec-t">Synonyms</span>
                  <div className="badges">{w.syn.length ? w.syn.map((x) => <span key={x} className="pill">{x}</span>) : <span className="muted sm">—</span>}</div>
                </div>
                <div className="stack" style={{ gap: 10 }}>
                  <span className="sec-t">Antonyms</span>
                  <div className="badges">{w.ant.length ? w.ant.map((x) => <span key={x} className="pill">{x}</span>) : <span className="muted sm">—</span>}</div>
                </div>
              </div>
            </div>
          )}
          {w.notes && <div className="sec"><span className="sec-t">My notes</span><p className="note">{w.notes}</p></div>}
          <div className="sec">
            <span className="sec-t">Tags</span>
            <div className="badges">
              {w.tags.length
                ? w.tags.map((t) => <button key={t} className="hashtag" onClick={() => a.showWordsWith({ tag: t })}>#{t}</button>)
                : <span className="muted sm">No tags yet</span>}
            </div>
          </div>
        </div>

        <div className="sidecol">
          <div className="card pad stack" style={{ gap: 10 }}>
            <button className="btn btn-primary btn-lg btn-block" onClick={() => a.startReview([w.id], 'Review · ' + w.word)}><Icon name="refresh" />Review This Word</button>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => a.openEdit(w.id)}><Icon name="edit" size="sm" />Edit</button>
              <button className="btn btn-danger-soft" onClick={() => a.askDeleteWord(w.id)}><Icon name="trash" size="sm" />Delete</button>
            </div>
          </div>
          <ShareCard w={w} />
          <div className="card pad stack" style={{ gap: 12 }}>
            <div className="rowb"><span className="sec-t">Details</span></div>
            <div className="rowb sm">
              <span className="muted">Category</span>
              <button className="linkbtn" style={{ fontSize: 14 }} onClick={() => (cat ? a.showWordsWith({ cat: cat.id }) : a.go('categories'))}>{cat ? cat.name : 'Uncategorized'}</button>
            </div>
            <div className="rowb sm"><span className="muted">Next review</span><b>{fmtNext(w.dueAt)}</b></div>
            <div className="rowb sm"><span className="muted">Added</span><b>{fmtAgo(w.addedAt)}</b></div>
          </div>
          <div className="card pad stack" style={{ gap: 6 }}>
            <span className="sec-t" style={{ marginBottom: 4 }}>Review history</span>
            {w.hist.length ? (
              <div className="hist">
                {w.hist.slice(0, 8).map((h, i) => (
                  <div key={i} className="hrow">
                    <Icon name="check" size="sm" style={{ color: 'var(--success)' }} />
                    <span className="hdate">{fmtDate(h.at)}</span>
                    <b className={'r-' + h.r}>{h.r}</b>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted sm" style={{ margin: 0 }}>Not reviewed yet. Start a review to begin tracking this word.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
