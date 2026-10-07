import { useEffect, useRef, useState } from 'react';
import { api, type Note, type NoteType } from '../lib/api';
import { fmtAgo } from '../lib/data';
import type { IconName } from '../lib/icons';
import { useWB } from '../state/WordbookContext';
import { Icon } from './ui';

/** How each notification type looks, and how it's described in Settings. */
export const NOTE_META: Record<NoteType, { icon: IconName; tint: string; label: string; desc: string }> = {
  day_open: { icon: 'calendar', tint: 't-indigo', label: 'A new course day opens', desc: 'When today’s words are ready in a course you take' },
  homework_due: { icon: 'clock', tint: 't-amber', label: 'Homework due tonight', desc: 'An evening reminder when today’s homework isn’t handed in' },
  homework_late: { icon: 'alert', tint: 't-red', label: 'Late homework', desc: 'Homework from earlier days that’s still waiting' },
  streak_risk: { icon: 'flame', tint: 't-orange', label: 'Streak about to end', desc: 'When your on-time homework streak ends tonight' },
  course_start: { icon: 'cap', tint: 't-blue', label: 'Course starting', desc: 'The day before a course you joined starts' },
  member_removed: { icon: 'logout', tint: 't-red', label: 'Removed from a course', desc: 'When a course owner removes you' },
  member_joined: { icon: 'users', tint: 't-green', label: 'New members', desc: 'When someone joins a course you own' },
  owner_pending: { icon: 'listcheck', tint: 't-amber', label: 'Items to approve', desc: 'Questions or dialogues waiting for your approval' },
  owner_empty_day: { icon: 'edit', tint: 't-orange', label: 'Days without words', desc: 'When a learner is about to reach a day with no words' },
  words_due: { icon: 'refresh', tint: 't-indigo', label: 'Words due for review', desc: 'When words in My Vocabulary are due' },
  library_saved: { icon: 'heart', tint: 't-green', label: 'Your shared words saved', desc: 'When someone saves a word you shared to the library' }
};
/** The groups shown in Settings. */
export const NOTE_GROUPS: { title: string; types: NoteType[] }[] = [
  { title: 'Courses — learner', types: ['day_open', 'homework_due', 'homework_late', 'streak_risk', 'course_start', 'member_removed'] },
  { title: 'Courses — owner', types: ['member_joined', 'owner_pending', 'owner_empty_day'] },
  { title: 'Vocabulary & library', types: ['words_due', 'library_saved'] }
];
const metaOf = (t: string) => NOTE_META[t as NoteType] ?? { icon: 'bell' as IconName, tint: 't-indigo' };

/** "9+" past nine. */
const badgeCount = (n: number) => (n > 9 ? '9+' : String(n));

/** One notification: opens it on click; the ✕ (shown on hover/focus) deletes it. */
function NoteItem({ n, onOpen, onDelete }: { n: Note; onOpen: (n: Note) => void; onDelete: (n: Note) => void }) {
  const m = metaOf(n.type);
  return (
    <li className={'nitem' + (n.read ? '' : ' unread')}>
      <button className="nrow" onClick={() => onOpen(n)}>
        <span className={'stat-ic ' + m.tint}><Icon name={m.icon} size="sm" /></span>
        <span className="ntext">
          <b className="ntitle">{!n.read && <span className="c-sr">Unread: </span>}{n.title}</b>
          {n.body && <span className="nbody">{n.body}</span>}
          <span className="ntime">{fmtAgo(n.at)}</span>
        </span>
        {!n.read && <span className="nunread" aria-hidden="true" />}
      </button>
      <button className="iconbtn sm ndel" onClick={() => onDelete(n)} aria-label={'Delete notification: ' + n.title} title="Delete">
        <Icon name="x" size="sm" />
      </button>
    </li>
  );
}

/**
 * Notifications loaded `limit` at a time while `active`, with open / delete / mark-all handling
 * (items are marked read in the list right away; the server's unread count follows).
 */
function useNotes(limit: number, active: boolean) {
  const { s, a } = useWB();
  const [items, setItems] = useState<Note[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [err, setErr] = useState('');
  const [more, setMore] = useState(false);
  /** The unread count the list matches; a different count (a newer check found something) reloads it. */
  const shownUnread = useRef(-1);

  const load = () => {
    setErr('');
    api.notifications(limit)
      .then((r) => { setItems(r.items); setHasMore(r.hasMore); shownUnread.current = r.unread; a.setUnread(r.unread); })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Can’t load notifications.'));
  };
  useEffect(() => {
    if (!active) { shownUnread.current = -1; return; }
    if (shownUnread.current === s.unread) return;
    shownUnread.current = s.unread;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, s.unread]);

  const loadOlder = async () => {
    const last = items?.[items.length - 1];
    if (!last || more) return;
    setMore(true);
    try {
      const r = await api.notifications(limit, last.at);
      setItems((prev) => [...(prev ?? []), ...r.items.filter((x) => !prev?.some((p) => p.id === x.id))]);
      setHasMore(r.hasMore);
    } catch (e) {
      a.showToast(e instanceof Error ? e.message : 'Can’t load notifications.', 'bad');
    } finally {
      setMore(false);
    }
  };
  const markLocal = (pred: (n: Note) => boolean) => setItems((prev) => prev && prev.map((x) => (pred(x) ? { ...x, read: true } : x)));
  const open = (n: Note) => {
    markLocal((x) => x.id === n.id);
    // The server count follows; keep the effect above from reloading the list for our own change.
    if (!n.read) shownUnread.current = Math.max(0, s.unread - 1);
    a.openNote(n);
  };
  const remove = async (n: Note) => {
    if (!n.read) shownUnread.current = Math.max(0, s.unread - 1);
    if (await a.deleteNote(n)) setItems((prev) => prev && prev.filter((x) => x.id !== n.id));
  };
  const markAll = async () => {
    shownUnread.current = 0;
    if (await a.markNotesRead('all')) markLocal(() => true);
  };
  return { items, hasMore, err, more, load, loadOlder, open, remove, markAll };
}

/** The bell in the top bar: unread badge and a panel with the latest notifications. */
export function NotificationBell() {
  const { s, a } = useWB();
  const open = s.notif;
  const notes = useNotes(15, open);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const label = 'Notifications' + (s.unread ? ', ' + s.unread + ' unread' : '');

  // Move focus into the panel when it opens; Escape closes it and returns focus to the bell.
  useEffect(() => {
    if (!open) return undefined;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      a.closeMenus();
      btn.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div style={{ position: 'relative' }}>
      <button ref={btn} className="iconbtn" onClick={() => a.set({ notif: !open, account: false, menu: null })} aria-label={label} title="Notifications" aria-expanded={open} aria-controls={open ? 'notif-panel' : undefined}>
        <Icon name="bell" />
        {s.unread > 0 && <span className="nbadge" aria-hidden="true">{badgeCount(s.unread)}</span>}
      </button>
      {open && (
        <div ref={panel} className="drop npanel" id="notif-panel" role="dialog" aria-labelledby="notif-panel-h" tabIndex={-1}>
          <div className="npanel-h">
            <h2 id="notif-panel-h" className="drop-h">Notifications</h2>
            <button className="btn btn-ghost btn-sm" onClick={notes.markAll} disabled={!s.unread}>Mark all as read</button>
            <button className="iconbtn sm mob-only" onClick={() => { a.closeMenus(); btn.current?.focus(); }} aria-label="Close notifications"><Icon name="x" size="sm" /></button>
          </div>
          <NoteList notes={notes} />
          <button className="nfoot" onClick={() => a.go('notifications')}>See all notifications<Icon name="right" size="sm" /></button>
        </div>
      )}
    </div>
  );
}

/** The list (with its loading, error and empty states) shared by the bell's panel and the page. */
function NoteList({ notes, unreadOnly = false, page = false }: { notes: ReturnType<typeof useNotes>; unreadOnly?: boolean; page?: boolean }) {
  const { items, err } = notes;
  if (err && !items) {
    return (
      <div className="nempty" role="alert">
        <span>{err}</span>
        <button className="btn btn-secondary btn-sm" onClick={notes.load}><Icon name="refresh" size="sm" />Try again</button>
      </div>
    );
  }
  if (!items) return <div className="nempty" aria-busy="true"><span className="spin" aria-label="Loading notifications" /></div>;
  const shown = unreadOnly ? items.filter((n) => !n.read) : items;
  if (!shown.length) {
    return (
      <div className={'nempty' + (page ? ' card' : '')}>
        <span className="stat-ic t-green"><Icon name="checkc" /></span>
        <b>You’re all caught up</b>
        <span className="muted sm">{unreadOnly && items.length ? 'No unread notifications.' : 'New notifications will show up here.'}</span>
      </div>
    );
  }
  return (
    <ul className={'nlist' + (page ? ' card' : '')} aria-label={unreadOnly ? 'Unread notifications' : 'Notifications'}>
      {shown.map((n) => <NoteItem key={n.id} n={n} onOpen={notes.open} onDelete={notes.remove} />)}
    </ul>
  );
}

/** The full Notifications page: All / Unread, and older ones a page at a time. */
export function NotificationsPage() {
  const { s } = useWB();
  const notes = useNotes(30, true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  return (
    <>
      <div className="ph">
        <div>
          <h1 className="h1">Notifications</h1>
          <p className="sub">{s.unread ? s.unread + ' unread' : 'Course days, homework, reviews and more.'}</p>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={notes.markAll} disabled={!s.unread}><Icon name="check" size="sm" />Mark all as read</button>
        </div>
      </div>
      <div className="seg nfilter" role="group" aria-label="Show">
        {(['all', 'unread'] as const).map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : 'Unread'}</button>
        ))}
      </div>
      <NoteList notes={notes} unreadOnly={filter === 'unread'} page />
      {notes.items && notes.hasMore && (
        <div className="nmore">
          <button className="btn btn-secondary" onClick={notes.loadOlder} disabled={notes.more}>{notes.more ? 'Loading…' : 'Load older'}</button>
        </div>
      )}
    </>
  );
}
