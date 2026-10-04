import { useEffect, useRef, useState } from 'react';
import { api, type LibraryPage, type LibraryQuery, type LibraryWord, type Topic } from '../lib/api';
import { LEVELS, fmtDate } from '../lib/data';
import { speak } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { EmptyState, Icon, LevelBadge, PageHead, PosBadge } from '../components/ui';

export const TOPIC_LABEL: Record<Topic, string> = {
  it: 'IT', interview: 'Interview', customer: 'Customer meetings', leader: 'Leader meetings', toeic: 'TOEIC', other: 'Other'
};
const TOPIC_TINT: Record<Topic, string> = { it: 't-blue', interview: 't-indigo', customer: 't-green', leader: 't-orange', toeic: 't-red', other: 't-amber' };
const SOURCES: [LibraryQuery['source'] | '', string][] = [['', 'All'], ['builtin', 'Built-in'], ['community', 'Community'], ['me', 'Shared by me']];
const PAGE_SIZE = 30;

export const TopicBadge = ({ topic }: { topic: Topic }) => <span className={'badge ' + (TOPIC_TINT[topic] ?? 't-amber')}>{TOPIC_LABEL[topic] ?? topic}</span>;

function useAuthor() {
  const { s } = useWB();
  return (w: LibraryWord) => (w.authorId === '' ? 'Wordbook' : w.authorId === s.userId ? 'You' : w.authorName);
}

/** The Save button / "In my words" state for one library word. */
function SaveButton({ w, small }: { w: LibraryWord; small?: boolean }) {
  const { s, a } = useWB();
  const [busy, setBusy] = useState(false);
  const mine = s.words.find((x) => x.word.toLowerCase() === w.word.toLowerCase());
  if (mine) {
    return (
      <button className={'btn btn-ghost' + (small ? ' btn-sm' : '')} onClick={() => a.go('detail', { sel: mine.id })} title="Open in my vocabulary">
        <Icon name="check" size="sm" style={{ color: 'var(--success)' }} />In my words
      </button>
    );
  }
  return (
    <button className={'btn btn-secondary' + (small ? ' btn-sm' : '')} disabled={busy} aria-label={'Save ' + w.word + ' to my vocabulary'}
      onClick={async () => { setBusy(true); await a.saveFromLibrary(w); setBusy(false); }}>
      <Icon name="plus" size="sm" />{busy ? 'Saving…' : 'Save'}
    </button>
  );
}

function LibraryDetail({ w, onClose, onRemoved }: { w: LibraryWord; onClose: () => void; onRemoved: () => void }) {
  const { s, a } = useWB();
  const author = useAuthor();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const remove = async () => {
    setBusy(true);
    try {
      await api.unshare(w.id);
      a.set((prev) => ({ shared: prev.shared.filter((x) => x !== w.word.toLowerCase()) }));
      a.showToast('Removed “' + w.word + '” from the library.');
      onRemoved();
    } catch (e) {
      a.showToast(e instanceof Error ? e.message : 'Something went wrong.', 'bad');
      setBusy(false);
    }
  };
  return (
    <div className="overlay">
      <button className="backdrop" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="modal libmodal" role="dialog" aria-modal="true" aria-label={w.word}>
        <div className="rowb" style={{ alignItems: 'flex-start' }}>
          <div className="badges"><PosBadge>{w.pos}</PosBadge><LevelBadge level={w.level} /><TopicBadge topic={w.topic} /></div>
          <button className="iconbtn sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div>
          <h2 className="word-big" style={{ fontSize: 38 }}>{w.word}</h2>
          <div className="ipa-row">
            <span className="ipa">{w.ipa}</span>
            <button className="iconbtn sm" onClick={() => speak(w.word)} aria-label="Play pronunciation"><Icon name="volume" /></button>
          </div>
        </div>
        <div>
          <div className="tr-big">{w.vi}</div>
          <div style={{ fontSize: 16, marginTop: 4 }}>{w.meaning}</div>
        </div>
        {w.ex && <p className="quote">“{w.ex}”</p>}
        {(w.syn.length > 0 || w.ant.length > 0) && (
          <div className="form2" style={{ gap: 14 }}>
            <div className="stack" style={{ gap: 8 }}><span className="sec-t">Synonyms</span><div className="badges">{w.syn.length ? w.syn.map((x) => <span key={x} className="pill">{x}</span>) : <span className="muted sm">—</span>}</div></div>
            <div className="stack" style={{ gap: 8 }}><span className="sec-t">Antonyms</span><div className="badges">{w.ant.length ? w.ant.map((x) => <span key={x} className="pill">{x}</span>) : <span className="muted sm">—</span>}</div></div>
          </div>
        )}
        <div className="libmeta">
          <span className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{author(w).charAt(0)}</span>
          <span>Added by <b>{author(w)}</b>{w.authorId ? ' · ' + fmtDate(w.sharedAt) : ''} · saved {w.saves} {w.saves === 1 ? 'time' : 'times'}</span>
        </div>
        <div className="mfoot" style={{ justifyContent: 'space-between' }}>
          {w.authorId && w.authorId === s.userId
            ? <button className="btn btn-danger-soft" onClick={remove} disabled={busy}><Icon name="trash" size="sm" />Remove from library</button>
            : <span />}
          <SaveButton w={w} />
        </div>
      </div>
    </div>
  );
}

export function Library() {
  const { a } = useWB();
  const author = useAuthor();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<Topic | ''>('');
  const [level, setLevel] = useState('');
  const [source, setSource] = useState<LibraryQuery['source'] | ''>('');
  const [data, setData] = useState<LibraryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<LibraryWord | null>(null);
  const reqId = useRef(0);

  // Wait until typing pauses before searching.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const fetchPage = async (page: number) => {
    const id = ++reqId.current;
    const params: LibraryQuery = { q: query || undefined, topic: topic || undefined, level: level || undefined, source: source || undefined, page, limit: PAGE_SIZE };
    try {
      const res = await api.library(params);
      if (id !== reqId.current) return; // a newer search has started
      setData((prev) => (page > 1 && prev ? { ...res, items: [...prev.items, ...res.items] } : res));
    } catch (e) {
      if (id === reqId.current) a.showToast(e instanceof Error ? e.message : 'Couldn’t load the library.', 'bad');
    } finally {
      if (id === reqId.current) { setLoading(false); setMore(false); }
    }
  };

  useEffect(() => {
    setLoading(true);
    void fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, topic, level, source]);

  const loadMore = () => { if (!data) return; setMore(true); void fetchPage(data.page + 1); };
  const anyFilter = !!q || !!topic || !!level || !!source;
  const clear = () => { setQ(''); setTopic(''); setLevel(''); setSource(''); };
  const items = data?.items ?? [];
  const topics: Topic[] = ['it', 'interview', 'customer', 'leader', 'toeic', 'other'];

  return (
    <>
      <PageHead title="Vocabulary Library" sub="Words for IT work, interviews, meetings and TOEIC — shared by everyone. Save the ones you want to learn.">
        <button className="btn btn-primary" onClick={a.goNew}><Icon name="plus" size="sm" />Add Your Own Word</button>
      </PageHead>

      <div className="search-wrap">
        <span className="inicon"><Icon name="search" /></span>
        <input className="input input-lg withicon" type="search" placeholder="Search the library: word, meaning or Vietnamese…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the library" />
      </div>

      <div className="filters">
        <div className="fgroup">
          <span className="flabel">Topic</span>
          <div className="chips">
            <button className={'chip' + (topic === '' ? ' on' : '')} onClick={() => setTopic('')} aria-pressed={topic === ''}>All{data ? ' · ' + data.all : ''}</button>
            {topics.filter((t) => t !== 'other' || (data?.topics.other ?? 0) > 0 || topic === 'other').map((t) => (
              <button key={t} className={'chip' + (topic === t ? ' on' : '')} onClick={() => setTopic(t)} aria-pressed={topic === t}>
                {TOPIC_LABEL[t]}{data ? ' · ' + data.topics[t] : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="fgroup">
          <span className="flabel">Level</span>
          <div className="chips">
            {['', ...LEVELS].map((l) => (
              <button key={l || 'all'} className={'chip' + (level === l ? ' on' : '')} onClick={() => setLevel(l)} aria-pressed={level === l}>{l || 'All'}</button>
            ))}
          </div>
        </div>
        <div className="fgroup">
          <span className="flabel">Added by</span>
          <div className="chips">
            {SOURCES.map(([v, label]) => (
              <button key={label} className={'chip' + (source === v ? ' on' : '')} onClick={() => setSource(v)} aria-pressed={source === v}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: '8px 20px' }} aria-busy="true">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 64, borderTop: i > 1 ? '1px solid var(--border)' : 'none' }}>
              <div className="sk" style={{ width: 120, height: 16 }} /><div className="sk" style={{ flexGrow: 1, height: 14 }} /><div className="sk" style={{ width: 44, height: 22 }} /><div className="sk" style={{ width: 80, height: 30 }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon="search" tint="t-blue" title="No words found" text={source === 'me' ? 'You haven’t shared any words yet. Open one of your words and choose “Share to library”.' : 'Try a different keyword or clear the filters.'}>
          {anyFilter && <button className="btn btn-secondary" onClick={clear}>Clear filters</button>}
        </EmptyState>
      ) : (
        <>
          <div className="resbar">
            <span>Showing {items.length} of {data?.total ?? 0} words</span>
            {anyFilter && <button className="linkbtn" onClick={clear}>Clear filters</button>}
          </div>
          <div className="card tbl">
            <div className="trow thead librow">
              <span>Word</span><span>Meaning</span><span className="c-type">Topic</span><span>Level</span><span className="c-type">Added by</span><span style={{ textAlign: 'right' }}>Save</span>
            </div>
            {items.map((w) => (
              <div key={w.id} className="trow librow">
                <div className="cellword"><button className="wordlink" onClick={() => setOpen(w)}>{w.word}</button><span className="ipa xs">{w.ipa}</span></div>
                <div className="cellmean"><span className="vi clamp">{w.vi}</span><span className="muted xs clamp">{w.meaning}</span></div>
                <span className="c-type"><TopicBadge topic={w.topic} /></span>
                <span><LevelBadge level={w.level} /></span>
                <span className="muted sm c-type clamp" title={'Added by ' + author(w)}>{author(w)}</span>
                <div className="rowact"><SaveButton w={w} small /></div>
              </div>
            ))}
          </div>
          <div className="vcards">
            {items.map((w) => (
              <div key={w.id} className="card vcard">
                <div className="vcard-top">
                  <div className="cellword"><button className="wordlink" style={{ fontSize: 18 }} onClick={() => setOpen(w)}>{w.word}</button><span className="ipa xs">{w.ipa}</span></div>
                  <SaveButton w={w} small />
                </div>
                <div><div className="vi">{w.vi}</div><div className="muted sm">{w.meaning}</div></div>
                <div className="rowb">
                  <div className="badges"><TopicBadge topic={w.topic} /><LevelBadge level={w.level} /></div>
                  <span className="muted xs">by {author(w)}</span>
                </div>
              </div>
            ))}
          </div>
          {data && items.length < data.total && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={loadMore} disabled={more}>{more ? 'Loading…' : 'Load more (' + (data.total - items.length) + ' left)'}</button>
            </div>
          )}
        </>
      )}

      {open && (
        <LibraryDetail
          w={open}
          onClose={() => setOpen(null)}
          onRemoved={() => { setOpen(null); setLoading(true); void fetchPage(1); }}
        />
      )}
    </>
  );
}
