import { useWB } from '../state/WordbookContext';
import { EmptyState, Icon, PageHead } from '../components/ui';

export function Tags() {
  const { s, a } = useWB();
  const counts = s.tags.map((t) => ({ name: t, count: s.words.filter((w) => w.tags.includes(t)).length }));
  const max = Math.max(1, ...counts.map((c) => c.count));
  const rows = counts.sort((x, y) => y.count - x.count);
  return (
    <>
      <PageHead title="Tags" sub="Click a tag to see its words.">
        <button className="btn btn-primary" onClick={a.openNewTag}><Icon name="plus" size="sm" />Create Tag</button>
      </PageHead>
      {rows.length > 0 ? (
        <div className="card" style={{ padding: 6, maxWidth: 820 }}>
          {rows.map((t) => (
            <div key={t.name} className="tagrow">
              <button className="tagmain" onClick={() => a.showWordsWith({ tag: t.name })}>
                <span className="stat-ic t-indigo" style={{ width: 36, height: 36, margin: 0 }}><Icon name="hash" size="sm" /></span>
                <span className="tagname">#{t.name}</span>
                <span className="mini indigo tagbar"><div style={{ width: Math.round((t.count / max) * 100) + '%' }} /></span>
                <span className="muted sm" style={{ minWidth: 70, textAlign: 'right', fontWeight: 600 }}>{t.count} words</span>
              </button>
              <button className="iconbtn danger" onClick={() => a.set({ modal: { kind: 'delTag', id: t.name, title: 'Delete tag #' + t.name + '?' } })} aria-label={'Delete tag ' + t.name}>
                <Icon name="trash" size="sm" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon="tag" title="No tags yet" text="Tags like #meeting or #interview help you find words fast.">
          <button className="btn btn-primary" onClick={a.openNewTag}><Icon name="plus" size="sm" />Create Tag</button>
        </EmptyState>
      )}
    </>
  );
}
