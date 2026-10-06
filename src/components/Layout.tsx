import { useEffect, useState } from 'react';
import { useWB, type Route } from '../state/WordbookContext';
import { getStats, currentStreak } from '../state/selectors';
import { api, type LibraryWord } from '../lib/api';
import type { IconName } from '../lib/icons';
import { SaveButton, TopicBadge } from '../pages/Library';
import { Icon, LevelBadge } from './ui';

function useInitial() {
  const { s } = useWB();
  return (s.settings.name || '?').trim().charAt(0).toUpperCase() || '?';
}

const isVocabish = (r: Route) => r === 'vocab' || r === 'new' || r === 'detail' || r === 'edit';
const isCoursish = (r: Route) => r === 'courses' || r === 'course' || r === 'courseEdit' || r === 'courseStudy';

export function Sidebar() {
  const { s, a } = useWB();
  const initial = useInitial();
  const { due } = getStats(s.words);
  const nav: { id: Route; label: string; icon: IconName; go: () => void; sub?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid', go: () => a.go('dashboard') },
    { id: 'library', label: 'Library', icon: 'globe', go: () => a.go('library', { libraryQ: '' }) },
    { id: 'courses', label: 'Courses', icon: 'cap', go: () => a.go('courses') },
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
            <button className={'navitem' + (n.id === s.route || (n.id === 'vocab' && isVocabish(s.route)) || (n.id === 'courses' && isCoursish(s.route)) ? ' on' : '')} onClick={n.go} aria-label={n.label} title={n.label}>
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

/**
 * Header search: shows matches from my words and, below, library words I don't have yet
 * (with a Save button), so a word can be found even before it's in my collection.
 */
function HeaderSearch() {
  const { s, a } = useWB();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ term: string; items: LibraryWord[]; total: number } | null>(null);
  const [libLoading, setLibLoading] = useState(false);
  const term = q.trim().toLowerCase();
  const open = s.menu === 'search' && !!term;
  // Only show library results for what's typed now (not the previous search).
  const lib = res && res.term === term ? res : null;
  const searching = libLoading || (!!term && !lib);

  // Search the library once typing pauses.
  useEffect(() => {
    if (!term) return;
    let alive = true;
    const t = setTimeout(() => {
      setLibLoading(true);
      api.library({ q: term, limit: 12 })
        .then((r) => { if (alive) setRes({ term, items: r.items, total: r.total }); })
        .catch(() => { if (alive) setRes({ term, items: [], total: 0 }); })
        .finally(() => { if (alive) setLibLoading(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [term]);

  const matches = term
    ? s.words.filter((w) => [w.word, w.meaning, w.vi, w.tags.join(' ')].join(' ').toLowerCase().includes(term))
      .sort((x, y) => Number(!x.word.toLowerCase().startsWith(term)) - Number(!y.word.toLowerCase().startsWith(term)) || x.word.localeCompare(y.word))
    : [];
  const mine = new Set(s.words.map((w) => w.word.toLowerCase()));
  const fromLib = (lib?.items ?? []).filter((w) => !mine.has(w.word.toLowerCase())).slice(0, 5);

  const close = () => a.setMenu(null);
  const seeMine = () => { close(); a.showWordsWith({ q: q.trim() }); };
  const seeLibrary = () => { close(); a.go('library', { libraryQ: q.trim() }); };

  return (
    <div className="topsearch">
      <span className="inicon"><Icon name="search" size="sm" /></span>
      <input
        className="input withicon" type="search" placeholder="Search my words and the library…" value={q}
        aria-label="Search my words and the library" aria-expanded={open} aria-controls="header-search-results" autoComplete="off"
        onChange={(e) => { setQ(e.target.value); a.setMenu('search'); }}
        onFocus={() => { if (term) a.setMenu('search'); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
          else if (e.key === 'Enter' && term) { e.preventDefault(); if (matches.length) seeMine(); else seeLibrary(); }
        }}
      />
      {open && (
        <div className="searchdrop" id="header-search-results" role="region" aria-label="Search results">
          <div className="sd-h"><span>My words</span>{matches.length > 0 && <span>{matches.length}</span>}</div>
          {matches.length ? matches.slice(0, 5).map((w) => (
            <button key={w.id} className="sd-row sd-btn" onClick={() => { close(); a.go('detail', { sel: w.id }); }}>
              <span className="sd-main"><span className="sd-word">{w.word}</span><span className="sd-vi">{w.vi || w.meaning}</span></span>
              <LevelBadge level={w.level} />
            </button>
          )) : <div className="sd-empty">None of your words match “{q.trim()}”.</div>}
          {matches.length > 5 && <button className="sd-more" onClick={seeMine}>See all {matches.length} in My Vocabulary<Icon name="right" size="sm" /></button>}

          <div className="sd-h" style={{ marginTop: 6 }}><span>From the library</span>{searching && <span className="spin" aria-label="Searching" />}</div>
          {fromLib.length ? fromLib.map((w) => (
            <div key={w.id} className="sd-row">
              <button className="sd-main sd-btn" onClick={seeLibrary} title="Open in the library">
                <span className="sd-word">{w.word}</span><span className="sd-vi">{w.vi || w.meaning}</span>
              </button>
              <TopicBadge topic={w.topic} />
              <SaveButton w={w} small />
            </div>
          )) : !searching && <div className="sd-empty">{lib && lib.total > 0 ? 'You already have every library match.' : 'No library words match.'}</div>}
          {lib && lib.total > 0 && <button className="sd-more" onClick={seeLibrary}>Search the library for “{q.trim()}” ({lib.total})<Icon name="right" size="sm" /></button>}
        </div>
      )}
    </div>
  );
}

export function Topbar() {
  const { s, a } = useWB();
  const initial = useInitial();
  const stats = getStats(s.words);
  const hasDue = stats.due > 0;
  return (
    <header className="top">
      <button className="iconbtn railtoggle desk-only" onClick={() => a.set({ rail: !s.rail })} aria-label="Toggle sidebar">
        <Icon name="menu" />
      </button>
      <div className="top-brand">
        <span className="logo"><Icon name="book" /></span>
        <span className="brandname">Wordbook</span>
      </div>
      <HeaderSearch />
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
            <button className="mitem mob-only" onClick={() => a.go('library', { libraryQ: '' })}><Icon name="globe" size="sm" />Library</button>
            <button className="mitem mob-only" onClick={() => a.go('courses')}><Icon name="cap" size="sm" />Courses</button>
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
