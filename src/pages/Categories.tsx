import { TINTS } from '../lib/data';
import { useWB } from '../state/WordbookContext';
import { EmptyState, Icon, PageHead } from '../components/ui';

export function Categories() {
  const { s, a } = useWB();
  return (
    <>
      <PageHead title="Categories" sub="Group words by the part of life you use them in.">
        <button className="btn btn-primary" onClick={a.openNewCat}><Icon name="plus" size="sm" />New Category</button>
      </PageHead>
      {s.cats.length > 0 ? (
        <div className="catgrid">
          {s.cats.map((c, i) => {
            const ws = s.words.filter((w) => w.cat === c.id);
            const pct = ws.length ? Math.round((ws.filter((w) => w.status === 'mastered').length / ws.length) * 100) : 0;
            return (
              <div key={c.id} className="card catcard">
                <div className="cat-top">
                  <span className={'cat-ic ' + TINTS[i % TINTS.length]}><Icon name={c.icon} size="lg" /></span>
                  <div className="rowact">
                    <button className="iconbtn sm" onClick={() => a.set({ modal: { kind: 'cat', id: c.id, name: c.name, icon: c.icon } })} aria-label={'Edit ' + c.name} title="Edit"><Icon name="edit" size="sm" /></button>
                    <button className="iconbtn sm danger" onClick={() => a.set({ modal: { kind: 'delCat', id: c.id, title: 'Delete “' + c.name + '”?' } })} aria-label={'Delete ' + c.name} title="Delete"><Icon name="trash" size="sm" /></button>
                  </div>
                </div>
                <span className="cat-name">{c.name}</span>
                <span className="muted sm">{ws.length} words · {pct}% mastered</span>
                <div className="catfoot">
                  <span className="mini"><div style={{ width: pct + '%' }} /></span>
                  <button className="btn btn-secondary btn-sm" onClick={() => a.showWordsWith({ cat: c.id })}>Open</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="folder" title="No categories yet" text="Create a category like Work or Travel to keep related words together.">
          <button className="btn btn-primary" onClick={a.openNewCat}><Icon name="plus" size="sm" />New Category</button>
        </EmptyState>
      )}
    </>
  );
}
