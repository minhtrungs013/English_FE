import { useEffect, useState } from 'react';
import { api, type Phrase, type PhraseBrief, type PhraseKind } from '../lib/api';
import { FUNCTION_LABEL, REGISTER_LABEL, patternParts } from '../lib/phrases';
import { speak } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { EmptyState, Icon, LevelBadge, PageHead } from '../components/ui';
import { useWide } from '../components/UsagePanel';
import { Dialog, errText } from './Courses';
import { TopicBadge } from './Library';

const KINDS: { id: PhraseKind | ''; label: string }[] = [
  { id: '', label: 'All' }, { id: 'slot', label: 'With a slot' }, { id: 'fixed', label: 'Conversation' }
];

/** "S + run out of + X" as chips, the open places marked. */
export function PatternChips({ pattern }: { pattern: string }) {
  return (
    <span className="ph-pattern" aria-label={'Pattern: ' + pattern}>
      {patternParts(pattern).map((p, i) => (
        <span key={i} className={'ph-part' + (p.slot ? ' slot' : '')}>{p.text === 'X' ? '…' : p.text}</span>
      ))}
    </span>
  );
}

const Speak = ({ text, label }: { text: string; label: string }) => (
  <button className="iconbtn sm" onClick={() => speak(text)} aria-label={label} title="Play"><Icon name="volume" size="sm" /></button>
);

/** A phrase's details: meaning, pattern and forms (slot) or situations, dialogue and replies (fixed), words it takes, notes. */
export function PhraseModal({ phraseKey, onClose }: { phraseKey: string; onClose: () => void }) {
  const { s, a } = useWB();
  const wide = useWide();
  const [p, setP] = useState<Phrase | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setP(null); setErr('');
    api.phrase(phraseKey).then((r) => { if (live) setP(r); }).catch((e) => { if (live) setErr(errText(e)); });
    return () => { live = false; };
  }, [phraseKey]);
  const savedId = p?.savedId || (p ? s.words.find((w) => w.word.toLowerCase() === p.phrase.toLowerCase().replace(/[?.!]+$/, ''))?.id ?? '' : '');

  const save = async () => {
    if (!p) return;
    setBusy(true);
    try {
      const r = await api.savePhrase(p.key);
      a.set((prev) => ({ words: [r.word, ...prev.words], tags: prev.tags.includes(r.tag) ? prev.tags : [...prev.tags, r.tag] }));
      setP({ ...p, savedId: r.word.id });
      a.showToast('Saved “' + p.phrase + '” to My Vocabulary.');
    } catch (e) { a.showToast(errText(e), 'bad'); } finally { setBusy(false); }
  };
  const saveWord = async (libraryId: string, word: string) => {
    const w = await a.saveFromLibrary({ id: libraryId, word });
    if (w && p) setP({ ...p, fillers: p.fillers.map((f) => (f.word === word ? { ...f, mine: true, wordId: w.id } : f)) });
  };

  return (
    <Dialog label={p?.phrase ?? 'Phrase'} onClose={onClose} wide className="phrase-modal">
      {err ? <EmptyState icon="alert" tint="t-red" title="Can’t load this phrase" text={err} card={false} /> : !p ? <div className="sk" style={{ height: 260 }} /> : (
        <>
          <div className="rowb" style={{ alignItems: 'flex-start' }}>
            <div className="badges">
              <span className="badge pos">{p.kind === 'slot' ? 'Phrase with a slot' : FUNCTION_LABEL[p.function] ?? 'Conversation'}</span>
              <LevelBadge level={p.level} />
              <span className={'badge ' + (p.register === 'informal' ? 't-amber' : p.register === 'formal' ? 't-blue' : 't-green')}>{REGISTER_LABEL[p.register] ?? p.register}</span>
              <TopicBadge topic={p.topic} />
            </div>
            <button className="iconbtn sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div>
            <h2 className="word-big ph-title">{p.phrase}</h2>
            <div className="ipa-row"><Speak text={p.phrase} label={'Play ' + p.phrase} />{p.pattern && <PatternChips pattern={p.pattern} />}</div>
          </div>
          <div className="wd-cols">
            <div className="wd-main">
              <div>
                <div className="tr-big" lang="vi">{p.vi}</div>
                <div style={{ marginTop: 4 }}>{p.meaning}</div>
              </div>
              {p.slot?.hint && <p className="sm ph-hint" lang="vi"><Icon name="sparkle" size="sm" /> <b>…</b> = {p.slot.hint}</p>}
              {p.forms.length > 0 && (
                <section className="stack" style={{ gap: 6 }}>
                  <span className="sec-t">Forms</span>
                  <ul className="ph-list">{p.forms.map((f, i) => <li key={i}><span className="muted xs" lang="vi">{f.use}</span><span className="ph-en">{f.en} <Speak text={f.en} label="Play" /></span></li>)}</ul>
                </section>
              )}
              {p.situations.length > 0 && (
                <section className="stack" style={{ gap: 6 }}>
                  <span className="sec-t">When to use it</span>
                  <ul className="ph-bullets" lang="vi">{p.situations.map((x) => <li key={x}>{x}</li>)}</ul>
                </section>
              )}
              {p.dialogue.length > 0 && (
                <section className="stack" style={{ gap: 6 }}>
                  <span className="sec-t">In a conversation</span>
                  <div className="ph-dialogue">
                    {p.dialogue.map((d, i) => (
                      <div key={i} className={'ph-line ' + (d.s === 'B' ? 'b' : 'a')}>
                        <span className="ph-who">{d.s}</span>
                        <span className="grow"><span className="ph-en">{d.en}</span><span className="muted xs" lang="vi">{d.vi}</span></span>
                        <Speak text={d.en} label="Play this line" />
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {(p.replies.good.length > 0 || p.variants.length > 0) && (
                <section className="form2" style={{ gap: 14 }}>
                  {p.replies.good.length > 0 && <div className="stack" style={{ gap: 6 }}><span className="sec-t">Natural replies</span><div className="badges">{p.replies.good.map((x) => <span key={x} className="pill">{x}</span>)}</div>
                    {p.replies.bad.length > 0 && <div className="badges ph-bad">{p.replies.bad.map((x) => <span key={x} className="pill" title="Unnatural">✗ {x}</span>)}</div>}</div>}
                  {p.variants.length > 0 && <div className="stack" style={{ gap: 6 }}><span className="sec-t">Also said</span><div className="badges">{p.variants.map((x) => <span key={x} className="pill">{x}</span>)}</div></div>}
                </section>
              )}
            </div>
            <div className="wd-side stack" style={{ gap: 14 }}>
              {p.fillers.length > 0 && (
                <section className="stack" style={{ gap: 8 }}>
                  <span className="sec-t">Words it takes <span className="muted xs">({p.fillers.filter((f) => f.mine).length} in my words)</span></span>
                  <div className="badges">
                    {p.fillers.map((f) => (
                      <span key={f.en} className={'ph-filler' + (f.mine ? ' mine' : '')} title={f.vi}>
                        {f.en}{f.mine ? <Icon name="check" size="sm" /> : f.libraryId ? <button className="linkbtn xs" onClick={() => void saveWord(f.libraryId, f.word)} aria-label={'Save ' + f.word}>+ Save</button> : null}
                      </span>
                    ))}
                  </div>
                </section>
              )}
              {p.examples.length > 0 && (
                <section className="stack" style={{ gap: 6 }}>
                  <span className="sec-t">Examples</span>
                  <ul className="ph-list">{p.examples.map((x, i) => <li key={i}><span className="ph-en">{x.en} <Speak text={x.en} label="Play" /></span><span className="muted xs" lang="vi">{x.vi}</span></li>)}</ul>
                </section>
              )}
              {p.notes.length > 0 && (
                <section className="stack" style={{ gap: 6 }}>
                  <span className="sec-t">Notes</span>
                  <ul className="ph-bullets" lang="vi">{p.notes.map((x) => <li key={x}>{x}</li>)}</ul>
                </section>
              )}
              {p.mistakes.length > 0 && (
                <section className="stack" style={{ gap: 6 }}>
                  <span className="sec-t">Common mistakes</span>
                  <ul className="ph-list">{p.mistakes.map((m, i) => <li key={i}><span className="ph-wrong">✗ {m.wrong}</span><span className="ph-right">✓ {m.right}</span><span className="muted xs" lang="vi">{m.why}</span></li>)}</ul>
                </section>
              )}
            </div>
          </div>
          <div className="mfoot" style={{ justifyContent: wide ? 'flex-end' : 'stretch', flexWrap: 'wrap' }}>
            {savedId
              ? <span className="badge t-green" style={{ alignSelf: 'center' }}><Icon name="check" size="sm" />In My Vocabulary</span>
              : <button className="btn btn-secondary" onClick={save} disabled={busy}><Icon name="plus" size="sm" />Save to My Vocabulary</button>}
            <button className="btn btn-primary" onClick={() => { onClose(); a.go('phrasePractice', { sel: p.key }); }}><Icon name="zap" size="sm" />Practise this phrase</button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** Phrases: browse the phrases (slot phrases like "run out of …" and conversation phrases), open one, practise them. */
export function PhrasesPage() {
  const { s, a } = useWB();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<PhraseKind | ''>('');
  const [items, setItems] = useState<PhraseBrief[] | null>(null);
  const [err, setErr] = useState('');
  const open = s.sel;

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api.phrases({ q: q.trim() || undefined, kind: kind || undefined })
        .then((r) => { if (live) { setItems(r.items); setErr(''); } })
        .catch((e) => { if (live) setErr(errText(e)); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, kind, open]);

  const saved = items?.filter((x) => x.saved).length ?? 0;
  return (
    <>
      <PageHead title="Phrases" sub="Phrases like “run out of …” and “How’s it going?” — learn them, then use them with your own words.">
        <button className="btn btn-primary" onClick={() => a.go('phrasePractice', { sel: null })}><Icon name="zap" size="sm" />Practise</button>
      </PageHead>
      <div className="ph-tools">
        <div className="search-wrap" style={{ marginBottom: 0 }}>
          <span className="inicon"><Icon name="search" /></span>
          <input className="input withicon" type="search" placeholder="Search a phrase or a Vietnamese meaning…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search phrases" />
        </div>
        <div className="seg" role="group" aria-label="Kind">
          {KINDS.map((k) => <button key={k.id} className={kind === k.id ? 'on' : ''} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}
        </div>
      </div>
      {items && <p className="muted sm" style={{ margin: '4px 0 12px' }}>{items.length} {items.length === 1 ? 'phrase' : 'phrases'} · {saved} in My Vocabulary</p>}
      {err ? <EmptyState icon="alert" tint="t-red" title="Can’t load the phrases" text={err} /> : !items ? <div className="sk" style={{ height: 220 }} /> : !items.length ? (
        <EmptyState icon="search" tint="t-indigo" title="No phrases found" text="Try another search." />
      ) : (
        <div className="ph-grid">
          {items.map((p) => (
            <button key={p.key} className="card ph-card" onClick={() => a.go('phrases', { sel: p.key })}>
              <span className="rowb" style={{ gap: 8 }}>
                <b className="ph-name">{p.phrase}</b>
                <span className="badges">
                  {p.saved && <span className="badge t-green" title="In My Vocabulary"><Icon name="check" size="sm" /></span>}
                  {(p.errors ?? 0) > 0 && <span className="badge t-amber">{p.errors} to fix</span>}
                  <LevelBadge level={p.level} />
                </span>
              </span>
              {p.kind === 'slot' && p.pattern ? <PatternChips pattern={p.pattern} /> : <span className="muted xs">{FUNCTION_LABEL[p.function] ?? 'Conversation'} · {REGISTER_LABEL[p.register] ?? p.register}</span>}
              <span className="sm" lang="vi">{p.vi}</span>
            </button>
          ))}
        </div>
      )}
      {open && <PhraseModal phraseKey={open} onClose={() => a.go('phrases', { sel: null })} />}
    </>
  );
}

/** Word details: the phrases this word goes into ("toothpaste" → run out of toothpaste). Nothing when there are none. */
export function PhrasesWithWord({ word, onOpen }: { word: string; onOpen?: () => void }) {
  const { a } = useWB();
  const [items, setItems] = useState<PhraseBrief[]>([]);
  useEffect(() => {
    let live = true;
    api.phrasesForWord(word).then((r) => { if (live) setItems(r.items); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [word]);
  if (!items.length) return null;
  return (
    <section className="stack ph-with" style={{ gap: 8 }}>
      <span className="sec-t">Phrases with this word</span>
      <div className="ph-with-list">
        {items.map((p) => (
          <button key={p.key} className="ph-with-item" onClick={() => { onOpen?.(); a.go('phrases', { sel: p.key }); }}>
            <b>{p.phrase}</b><span className="muted xs">{p.example || p.vi}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
