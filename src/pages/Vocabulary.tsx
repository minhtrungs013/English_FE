import { LEVELS, POS_SHORT, fmtNext, isDue, type Word } from '../lib/data';
import { useWB } from '../state/WordbookContext';
import { Dropdown, EmptyState, Icon, LevelBadge, PageHead, StatusBadge } from '../components/ui';

const STATUS_CHIPS: [string, string][] = [['all', 'All'], ['new', 'New'], ['learning', 'Learning'], ['mastered', 'Mastered']];

function NextReview({ w }: { w: Word }) {
  return <span className={'next' + (isDue(w) ? ' due' : '')}>{fmtNext(w.dueAt)}</span>;
}

export function Vocabulary() {
  const { s, a } = useWB();
  const f = s.filters;
  const total = s.words.length;
  const q = f.q.trim().toLowerCase();
  const rows = s.words.filter((w) => {
    if (f.level !== 'all' && w.level !== f.level) return false;
    if (f.status !== 'all' && w.status !== f.status) return false;
    if (f.cat !== 'all' && w.cat !== f.cat) return false;
    if (f.tag !== 'all' && !w.tags.includes(f.tag)) return false;
    if (q) {
      const hay = [w.word, w.meaning, w.vi, w.ex, w.tags.map((t) => '#' + t).join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((x, y) => y.addedAt - x.addedAt);
  const anyFilter = !!q || f.level !== 'all' || f.status !== 'all' || f.cat !== 'all' || f.tag !== 'all';
  const curCat = s.cats.find((c) => c.id === f.cat);
  const open = (w: Word) => a.go('detail', { sel: w.id });

  return (
    <>
      <PageHead title="My Vocabulary" sub={total + ' words you are learning'}>
        <button className="btn btn-primary" onClick={a.goNew}><Icon name="plus" size="sm" />Add Vocabulary</button>
      </PageHead>

      <div className="search-wrap">
        <span className="inicon"><Icon name="search" /></span>
        <input className="input input-lg withicon" type="search" placeholder="Search vocabulary…" value={f.q} onChange={(e) => a.setFilters({ q: e.target.value })} aria-label="Search vocabulary by word, meaning, translation, example or tag" />
      </div>

      <div className="filters">
        <div className="fgroup">
          <span className="flabel">Level</span>
          <div className="chips">
            {['all', ...LEVELS].map((l) => (
              <button key={l} className={'chip' + (f.level === l ? ' on' : '')} onClick={() => a.setFilters({ level: l })} aria-pressed={f.level === l}>{l === 'all' ? 'All' : l}</button>
            ))}
          </div>
        </div>
        <div className="fgroup">
          <span className="flabel">Status</span>
          <div className="chips">
            {STATUS_CHIPS.map(([v, label]) => (
              <button key={v} className={'chip' + (f.status === v ? ' on' : '')} onClick={() => a.setFilters({ status: v })} aria-pressed={f.status === v}>{label}</button>
            ))}
          </div>
        </div>
        <div className="fmenus" style={{ display: 'flex', gap: 10 }}>
          <div className="fgroup">
            <span className="flabel">Category</span>
            <Dropdown id="fcat" icon="folder" label={curCat ? curCat.name : 'All Categories'} active={f.cat !== 'all'} value={f.cat}
              items={[{ value: 'all', label: 'All Categories' }, ...s.cats.map((c) => ({ value: c.id, label: c.name }))]}
              onPick={(v) => a.setFilters({ cat: v })} />
          </div>
          <div className="fgroup">
            <span className="flabel">Tag</span>
            <Dropdown id="ftag" icon="hash" label={f.tag === 'all' ? 'All Tags' : '#' + f.tag} active={f.tag !== 'all'} value={f.tag}
              items={[{ value: 'all', label: 'All Tags' }, ...s.tags.map((t) => ({ value: t, label: '#' + t }))]}
              onPick={(v) => a.setFilters({ tag: v })} />
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="resbar">
            <span>Showing {rows.length} of {total} words</span>
            {anyFilter && <button className="linkbtn" onClick={a.clearFilters}>Clear filters</button>}
          </div>
          <div className="card tbl">
            <div className="trow thead">
              <span>Word</span><span>Meaning</span><span className="c-type">Type</span><span>Level</span><span>Status</span><span>Next review</span><span style={{ textAlign: 'right' }}>Actions</span>
            </div>
            {rows.map((w) => (
              <div key={w.id} className="trow">
                <div className="cellword"><button className="wordlink" onClick={() => open(w)}>{w.word}</button><span className="ipa xs">{w.ipa}</span></div>
                <div className="cellmean"><span className="vi clamp">{w.vi}</span><span className="muted xs clamp">{w.meaning}</span></div>
                <span className="muted sm c-type">{POS_SHORT[w.pos] ?? w.pos}</span>
                <span><LevelBadge level={w.level} /></span>
                <span><StatusBadge status={w.status} /></span>
                <NextReview w={w} />
                <div className="rowact">
                  <button className="iconbtn sm" onClick={() => open(w)} aria-label={'View ' + w.word} title="View"><Icon name="eye" size="sm" /></button>
                  <button className="iconbtn sm" onClick={() => a.openEdit(w.id)} aria-label={'Edit ' + w.word} title="Edit"><Icon name="edit" size="sm" /></button>
                  <button className="iconbtn sm danger" onClick={() => a.askDeleteWord(w.id)} aria-label={'Delete ' + w.word} title="Delete"><Icon name="trash" size="sm" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="vcards">
            {rows.map((w) => (
              <div key={w.id} className="card vcard">
                <div className="vcard-top">
                  <div className="cellword"><button className="wordlink" style={{ fontSize: 18 }} onClick={() => open(w)}>{w.word}</button><span className="ipa xs">{w.ipa}</span></div>
                  <div className="rowact">
                    <button className="iconbtn" onClick={() => a.openEdit(w.id)} aria-label={'Edit ' + w.word}><Icon name="edit" size="sm" /></button>
                    <button className="iconbtn danger" onClick={() => a.askDeleteWord(w.id)} aria-label={'Delete ' + w.word}><Icon name="trash" size="sm" /></button>
                  </div>
                </div>
                <div><div className="vi">{w.vi}</div><div className="muted sm">{w.meaning}</div></div>
                <div className="rowb">
                  <div className="badges"><span className="badge pos">{POS_SHORT[w.pos] ?? w.pos}</span><LevelBadge level={w.level} /><StatusBadge status={w.status} /></div>
                  <NextReview w={w} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {total > 0 && rows.length === 0 && (
        <EmptyState icon="search" tint="t-blue" title="No words match your search" text="Try a different keyword or clear the filters to see all your vocabulary.">
          <button className="btn btn-secondary" onClick={a.clearFilters}>Clear filters</button>
        </EmptyState>
      )}
      {total === 0 && (
        <EmptyState icon="book" title="No vocabulary yet." text="Save words from the shared library, or add your own.">
          <div className="actions" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => a.go('library')}><Icon name="globe" size="sm" />Browse the Library</button>
            <button className="btn btn-secondary" onClick={a.goNew}><Icon name="plus" size="sm" />Add Your Own Word</button>
          </div>
        </EmptyState>
      )}
    </>
  );
}
