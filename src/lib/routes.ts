/**
 * The app's routes as URLs, so a reload (F5), a shared link or Back / Forward keep the page.
 * Sessions that live only in memory (a review, a practice set, a study day, a dictation or grammar set) use the URL
 * of the page they were started from, so a reload lands on that page instead of an empty session.
 */
import type { CourseTab, Route } from '../state/WordbookContext';

export interface RouteState {
  route: Route; prevRoute: Route; sel: string | null; courseId: string; courseTab: CourseTab | ''; grammarId: string; libraryQ: string;
}

const enc = encodeURIComponent;
const TABS: CourseTab[] = ['today', 'map', 'board', 'members'];

export function pathOf(s: RouteState): string {
  switch (s.route) {
    case 'dashboard': return '/';
    case 'library': return '/library' + (s.libraryQ.trim() ? '?q=' + enc(s.libraryQ.trim()) : '');
    case 'vocab': return '/vocab';
    case 'new': return '/vocab/new';
    case 'detail': return s.sel ? '/vocab/' + enc(s.sel) : '/vocab';
    case 'edit': return s.sel ? '/vocab/' + enc(s.sel) + '/edit' : '/vocab';
    case 'practice': return '/practice';
    case 'writeSentence': return '/practice/write';
    case 'mistakes': return '/practice/mistakes';
    case 'dictation': case 'dictationPractice': return '/dictation';
    case 'categories': return '/categories';
    case 'tags': return '/tags';
    case 'settings': return '/settings';
    case 'notifications': return '/notifications';
    case 'admin': return '/admin';
    case 'courses': return '/courses';
    case 'course': case 'courseStudy': return s.courseId ? '/courses/' + enc(s.courseId) + (s.route === 'course' && s.courseTab ? '?tab=' + s.courseTab : '') : '/courses';
    case 'courseEdit': return s.courseId ? '/courses/' + enc(s.courseId) + '/edit' : '/courses';
    case 'grammar': case 'grammarPractice': return '/grammar';
    case 'grammarLesson': return s.grammarId ? '/grammar/' + enc(s.grammarId) : '/grammar';
    // A review session isn't in the URL: keep the page it was started from.
    case 'review': return pathOf({ ...s, route: s.prevRoute === 'review' ? 'dashboard' : s.prevRoute });
    default: return '/';
  }
}

/** The route for a URL; unknown paths go to the dashboard. */
export function routeOf(pathname: string, search: string): Partial<RouteState> {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const q = new URLSearchParams(search);
  const [a, b, c] = parts;
  switch (a) {
    case undefined: return { route: 'dashboard' };
    case 'library': return { route: 'library', libraryQ: q.get('q') ?? '' };
    case 'vocab':
      if (!b) return { route: 'vocab' };
      if (b === 'new') return { route: 'new', prevRoute: 'vocab' };
      return { route: c === 'edit' ? 'edit' : 'detail', sel: b, prevRoute: 'vocab' };
    case 'practice': return { route: b === 'write' ? 'writeSentence' : b === 'mistakes' ? 'mistakes' : 'practice' };
    case 'dictation': return { route: 'dictation' };
    case 'categories': return { route: 'categories' };
    case 'tags': return { route: 'tags' };
    case 'settings': return { route: 'settings' };
    case 'notifications': return { route: 'notifications' };
    case 'admin': return { route: 'admin' };
    case 'courses': {
      if (!b) return { route: 'courses' };
      const tab = q.get('tab') as CourseTab | null;
      return { route: c === 'edit' ? 'courseEdit' : 'course', courseId: b, courseTab: tab && TABS.includes(tab) ? tab : '' };
    }
    case 'grammar': return b ? { route: 'grammarLesson', grammarId: b } : { route: 'grammar' };
    default: return { route: 'dashboard' };
  }
}
