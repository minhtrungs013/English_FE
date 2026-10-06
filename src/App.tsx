import { useEffect, useState } from 'react';
import { useWB } from './state/WordbookContext';
import { BottomNav, Sidebar, Topbar } from './components/Layout';
import { Modals, ToastView } from './components/Overlays';
import { Dashboard } from './pages/Dashboard';
import { Vocabulary } from './pages/Vocabulary';
import { VocabForm } from './pages/VocabForm';
import { VocabDetail } from './pages/VocabDetail';
import { Practice } from './pages/Practice';
import { Categories } from './pages/Categories';
import { Tags } from './pages/Tags';
import { Settings } from './pages/Settings';
import { Session } from './sessions/Session';
import { setVoicePrefs } from './lib/speech';
import { EmptyState, Icon } from './components/ui';
import { AuthPage } from './pages/Auth';
import { Library } from './pages/Library';
import { Courses } from './pages/Courses';
import { CoursePage } from './pages/Course';
import { CourseEdit } from './pages/CourseEdit';
import { CourseStudy } from './pages/CourseStudy';

function useSystemDark() {
  const [dark, setDark] = useState(() => {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
  });
  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const h = (e: MediaQueryListEvent) => setDark(e.matches);
      mq.addEventListener('change', h);
      return () => mq.removeEventListener('change', h);
    } catch {
      return undefined;
    }
  }, []);
  return dark;
}

function LoadingSkeleton() {
  const statCard = (
    <div className="card stat">
      <div className="sk" style={{ width: 38, height: 38, marginBottom: 14 }} />
      <div className="sk" style={{ width: 70, height: 30, marginBottom: 8 }} />
      <div className="sk" style={{ width: 110, height: 14 }} />
    </div>
  );
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="sk" style={{ width: 280, height: 34, marginBottom: 36 }} />
      <div className="grid4">{statCard}{statCard}{statCard}{statCard}</div>
      <div className="dash2">
        <div className="sk" style={{ height: 300, borderRadius: 18 }} />
        <div className="sk" style={{ height: 300, borderRadius: 16 }} />
      </div>
      <div className="sk" style={{ height: 280, borderRadius: 16 }} />
    </div>
  );
}

function Page() {
  const { s, a } = useWB();
  if (s.status === 'loading') return <LoadingSkeleton />;
  if (s.status === 'error') {
    return (
      <EmptyState icon="alert" tint="t-red" title="Can’t load your vocabulary" text={s.loadError}>
        <button className="btn btn-primary" onClick={a.reload}><Icon name="refresh" size="sm" />Try again</button>
      </EmptyState>
    );
  }
  switch (s.route) {
    case 'library': return <Library key={s.libraryQ} />;
    case 'courses': return <Courses />;
    case 'course': return <CoursePage key={s.courseId} />;
    case 'courseEdit': return <CourseEdit key={s.courseId} />;
    case 'vocab': return <Vocabulary />;
    case 'new':
    case 'edit': return <VocabForm />;
    case 'detail': return <VocabDetail />;
    case 'practice': return <Practice />;
    case 'categories': return <Categories />;
    case 'tags': return <Tags />;
    case 'settings': return <Settings />;
    default: return <Dashboard />;
  }
}

export default function App() {
  const { s, a } = useWB();
  const sysDark = useSystemDark();
  const dark = s.settings.theme === 'dark' || (s.settings.theme === 'system' && sysDark);
  const inSession = (s.route === 'review' && !!s.review) || (s.route === 'practice' && !!s.practice);
  /** A course day's study session: full screen too, once the app has loaded. */
  const inStudy = s.route === 'courseStudy' && !!s.study && s.status === 'ready';

  const { voice, rate, pitch, accent } = s.settings;
  useEffect(() => { setVoicePrefs({ voice, rate, pitch }); }, [voice, rate, pitch]);

  useEffect(() => {
    document.body.style.background = dark ? '#111318' : '#F5F6F8';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }, [dark]);

  return (
    <div className="shell">
      <div className={'app accent-' + (accent || 'indigo') + (dark ? ' dark' : '') + (s.rail ? ' rail' : '')}>
        {s.status === 'auth' ? <AuthPage /> : inSession ? <Session /> : inStudy ? <CourseStudy key={s.courseId + ':' + s.study!.day} /> : (
          <>
            <Sidebar />
            <div className="mainwrap">
              <Topbar />
              <main className="main"><Page /></main>
            </div>
            <BottomNav />
          </>
        )}
        {(s.menu || s.notif || s.account) && <button className="scrim" onClick={a.closeMenus} aria-label="Close menu" tabIndex={-1} />}
        <Modals />
        <ToastView />
      </div>
    </div>
  );
}
