import { useEffect } from 'react';
import { CAT_ICONS } from '../lib/data';
import { useWB } from '../state/WordbookContext';
import { Icon } from './ui';

const CONFIRM_BODY = {
  delWord: 'This action cannot be undone.',
  delCat: 'The words in this category won’t be deleted — they’ll just become uncategorized.',
  delTag: 'The tag will be removed from every word that uses it.',
  delAll: 'This permanently removes all of your vocabulary, categories and tags. Your account stays. This action cannot be undone.',
  delAccount: 'This permanently deletes your account and all of your vocabulary. This action cannot be undone.'
};

export function Modals() {
  const { s, a } = useWB();
  const m = s.modal;

  useEffect(() => {
    if (!m) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') a.closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [m, a]);

  if (!m) return null;
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); a.submitModal(); } };

  let body;
  if (m.kind === 'cat') {
    const title = m.id ? 'Edit Category' : 'Create Category';
    body = (
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={onEnter}>
        <h2>{title}</h2>
        <div className="field">
          <label className="label" htmlFor="m-cat">Name</label>
          <input id="m-cat" className="input" placeholder="Technology" value={m.name} onChange={(e) => a.patchModal({ name: e.target.value, err: '' })} autoFocus />
        </div>
        <div className="field">
          <span className="label">Icon</span>
          <div className="iconpick">
            {CAT_ICONS.map(([icon, label]) => (
              <button key={icon} className={'ipick' + (m.icon === icon ? ' on' : '')} onClick={() => a.patchModal({ icon })} aria-label={label} aria-pressed={m.icon === icon}>
                <Icon name={icon} />
              </button>
            ))}
          </div>
        </div>
        {m.err && <span className="errtxt">{m.err}</span>}
        <div className="mfoot">
          <button className="btn btn-secondary" onClick={a.closeModal}>Cancel</button>
          <button className="btn btn-primary" onClick={a.submitModal}>{m.id ? 'Save' : 'Create'}</button>
        </div>
      </div>
    );
  } else if (m.kind === 'tag') {
    body = (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Create tag" onKeyDown={onEnter}>
        <h2>Create Tag</h2>
        <div className="field">
          <label className="label" htmlFor="m-tag">Tag name</label>
          <div style={{ position: 'relative' }}>
            <span className="inicon" style={{ fontWeight: 800 }}>#</span>
            <input id="m-tag" className="input withicon" style={{ paddingLeft: 30 }} placeholder="frontend" value={m.name} onChange={(e) => a.patchModal({ name: e.target.value, err: '' })} autoFocus />
          </div>
          <span className="hint">Lowercase letters, numbers and dashes.</span>
        </div>
        {m.err && <span className="errtxt">{m.err}</span>}
        <div className="mfoot">
          <button className="btn btn-secondary" onClick={a.closeModal}>Cancel</button>
          <button className="btn btn-primary" onClick={a.submitModal}>Create</button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="modal" role="dialog" aria-modal="true" aria-label={m.title}>
        <div className="empty-ic t-red" style={{ width: 48, height: 48, borderRadius: 14, margin: 0 }}><Icon name="trash" size="lg" /></div>
        <h2>{m.title}</h2>
        <p>{CONFIRM_BODY[m.kind]}</p>
        <div className="mfoot">
          <button className="btn btn-secondary" onClick={a.closeModal}>Cancel</button>
          <button className="btn btn-danger" onClick={a.confirmModal} autoFocus>{m.kind === 'delAll' ? 'Delete all data' : m.kind === 'delAccount' ? 'Delete account' : 'Delete'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <button className="backdrop" onClick={a.closeModal} aria-label="Close dialog" tabIndex={-1} />
      {body}
    </div>
  );
}

export function ToastView() {
  const { s } = useWB();
  const t = s.toast;
  if (!t) return null;
  return (
    <div className="toast" role="status">
      <Icon name={t.kind === 'bad' ? 'alert' : 'checkc'} className={t.kind === 'bad' ? 'bad' : 'ok'} />
      {t.msg}
    </div>
  );
}
