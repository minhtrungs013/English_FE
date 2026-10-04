import { useWB, type Route } from '../state/WordbookContext';
import { getStats, currentStreak } from '../state/selectors';
import type { IconName } from '../lib/icons';
import { Icon } from './ui';

function useInitial() {
  const { s } = useWB();
  return (s.settings.name || '?').trim().charAt(0).toUpperCase() || '?';
}

const isVocabish = (r: Route) => r === 'vocab' || r === 'new' || r === 'detail' || r === 'edit';

export function Sidebar() {
  const { s, a } = useWB();
  const initial = useInitial();
  const { due } = getStats(s.words);
  const nav: { id: Route; label: string; icon: IconName; go: () => void; sub?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid', go: () => a.go('dashboard') },
    { id: 'library', label: 'Library', icon: 'globe', go: () => a.go('library') },
    { id: 'vocab', label: 'My Vocabulary', icon: 'book', go: () => a.go('vocab') },
    { id: 'review', label: 'Review', icon: 'refresh', go: a.startDue, sub: due > 0 },
    { id: 'practice', label: 'Practice', icon: 'pen', go: () => a.go('practice') },
    { id: 'categories', label: 'Categories', icon: 'folder', go: () => a.go('categories') },
    { id: 'tags', label: 'Tags', icon: 'tag', go: () => a.go('tags') }
  ];
  return (
    <aside className="side">
      <div className="brand">
        <span className="logo"><Icon name="book" /></span>
        <span className="brandname">Wordbook</span>
      </div>
      <nav className="nav" aria-label="Main">
        {nav.map((n) => (
          <div key={n.id} style={{ display: 'contents' }}>
            <button className={'navitem' + (n.id === s.route || (n.id === 'vocab' && isVocabish(s.route)) ? ' on' : '')} onClick={n.go} aria-label={n.label} title={n.label}>
              <Icon name={n.icon} />
              <span className="navlabel">{n.label}</span>
            </button>
            {n.sub && (
              <button className="navitem subitem" onClick={n.go}>
                <span className="navlabel">Due today</span>
                <span className="count">{due}</span>
              </button>
            )}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        <button className={'navitem' + (s.route === 'settings' ? ' on' : '')} onClick={() => a.go('settings')} aria-label="Settings" title="Settings">
          <Icon name="sliders" /><span className="navlabel">Settings</span>
        </button>
        <button className="navitem" onClick={() => a.logout()} aria-label="Log out" title="Log out">
          <Icon name="logout" /><span className="navlabel">Log out</span>
        </button>
        <div className="me">
          <span className="avatar">{initial}</span>
          <div className="me-info">
            <span className="me-name">{s.settings.name}</span>
            <span className="me-mail">{s.settings.email}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function Topbar() {
  const { s, a } = useWB();
  const initial = useInitial();
  const stats = getStats(s.words);
  const hasDue = stats.due > 0;
  const onSearch = (v: string) => {
    if (s.route !== 'vocab') a.go('vocab', { filters: { ...s.filters, q: v } });
    else a.setFilters({ q: v });
  };
  return (
    <header className="top">
      <button className="iconbtn railtoggle desk-only" onClick={() => a.set({ rail: !s.rail })} aria-label="Toggle sidebar">
        <Icon name="menu" />
      </button>
      <div className="top-brand">
        <span className="logo"><Icon name="book" /></span>
        <span className="brandname">Wordbook</span>
      </div>
      <div className="topsearch">
        <span className="inicon"><Icon name="search" size="sm" /></span>
        <input className="input withicon" type="search" placeholder="Search words, meanings, tags…" value={s.filters.q} onChange={(e) => onSearch(e.target.value)} aria-label="Search vocabulary" />
      </div>
      <div className="spacer" />
      <div style={{ position: 'relative' }}>
        <button className="iconbtn" onClick={() => a.set({ notif: !s.notif, account: false, menu: null })} aria-label="Notifications" aria-expanded={s.notif}>
          <Icon name="bell" />
          {hasDue && <span className="dot" />}
        </button>
        {s.notif && (
          <div className="drop">
            <div className="drop-h">Notifications</div>
            {hasDue && (
              <button className="nrow" onClick={a.startDue}>
                <span className="stat-ic t-indigo"><Icon name="clock" size="sm" /></span>
                <span className="ntext"><b>{stats.due} words are due for review</b><span>Start a quick session to keep them fresh</span></span>
              </button>
            )}
            <button className="nrow" onClick={() => a.go('dashboard')}>
              <span className="stat-ic t-orange"><Icon name="flame" size="sm" /></span>
              <span className="ntext"><b>You're on a {currentStreak(s.progress)}-day streak</b><span>Review today to keep it going</span></span>
            </button>
            <button className="nrow" onClick={() => a.go('vocab')}>
              <span className="stat-ic t-green"><Icon name="layers" size="sm" /></span>
              <span className="ntext"><b>{stats.week} new words this week</b><span>Nice progress on your collection</span></span>
            </button>
          </div>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <button className="avbtn" onClick={() => a.set({ account: !s.account, notif: false, menu: null })} aria-label="Account menu" aria-expanded={s.account}>
          <span className="avatar">{initial}</span>
        </button>
        {s.account && (
          <div className="menu right" style={{ minWidth: 230 }}>
            <div className="me" style={{ padding: '8px 10px 10px' }}>
              <span className="avatar">{initial}</span>
              <div className="me-info"><span className="me-name">{s.settings.name}</span><span className="me-mail">{s.settings.email}</span></div>
            </div>
            <div className="msep" />
            <button className="mitem mob-only" onClick={() => a.go('library')}><Icon name="globe" size="sm" />Library</button>
            <button className="mitem mob-only" onClick={() => a.go('categories')}><Icon name="folder" size="sm" />Categories</button>
            <button className="mitem mob-only" onClick={() => a.go('tags')}><Icon name="tag" size="sm" />Tags</button>
            <button className="mitem" onClick={() => a.go('settings')}><Icon name="sliders" size="sm" />Settings</button>
            <div className="msep" />
            <button className="mitem danger" onClick={() => a.logout()}>
              <Icon name="logout" size="sm" />Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export function BottomNav() {
  const { s, a } = useWB();
  const cls = (id: Route) => 'bitem' + (id === s.route || (id === 'vocab' && isVocabish(s.route)) ? ' on' : '');
  return (
    <nav className="bnav" aria-label="Mobile">
      <button className={cls('dashboard')} onClick={() => a.go('dashboard')}><Icon name="grid" />Home</button>
      <button className={cls('vocab')} onClick={() => a.go('vocab')}><Icon name="book" />Words</button>
      <button className="badd" onClick={a.goNew} aria-label="Add vocabulary"><Icon name="plus" size="lg" /></button>
      <button className={cls('review')} onClick={a.startDue}><Icon name="refresh" />Review</button>
      <button className={cls('practice')} onClick={() => a.go('practice')}><Icon name="pen" />Practice</button>
    </nav>
  );
}
