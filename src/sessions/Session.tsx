import { useEffect, useRef } from 'react';
import { cap1, low1, type Rating, type Word } from '../lib/data';
import type { IconName } from '../lib/icons';
import { canSpeak, speak } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { Icon, LevelBadge, PosBadge } from '../components/ui';

const RATINGS: [Rating, string, IconName, string][] = [
  ['Again', '10 min', 'refresh', '1'], ['Hard', '1 day', 'meh', '2'], ['Good', '3 days', 'smile', '3'], ['Easy', '7 days', 'zap', '4']
];
const KEY_RATING: Record<string, Rating> = { '1': 'Again', '2': 'Hard', '3': 'Good', '4': 'Easy' };
const TITLES = { mc: 'Multiple Choice', fill: 'Fill in the Blank', trans: 'Translation', listen: 'Listening' };

function DoneCard({ title, sub, stats, children }: { title: string; sub: string; stats: [string | number, string, string?][]; children: React.ReactNode }) {
  return (
    <div className="stage">
      <div className="card done">
        <div className="empty-ic t-indigo"><Icon name="trophy" size="xl" /></div>
        <h2>{title}</h2>
        <p className="muted" style={{ margin: 0 }}>{sub}</p>
        <div className="donestats">
          {stats.map(([v, label, color]) => (
            <div key={label} className="dstat"><b style={color ? { color } : undefined}>{v}</b><span>{label}</span></div>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

function ReviewView() {
  const { s, a } = useWB();
  const R = s.review!;
  const goPractice = () => { a.set({ review: null, practice: null }); a.go('practice'); };

  const w = R.queue.length && !R.done ? s.words.find((x) => x.id === R.queue[R.i]) : undefined;
  const viFirst = s.settings.dir === 'vi-en';

  // Auto-play: the English word is spoken when it is visible (front for EN→VI, back for VI→EN).
  const spoken = useRef('');
  useEffect(() => {
    if (!w || !s.settings.autoplay) return;
    const showsEnglish = viFirst ? R.flipped : !R.flipped;
    const key = R.sid + ':' + R.i + ':' + R.flipped;
    if (showsEnglish && spoken.current !== key) { spoken.current = key; speak(w.word); }
  }, [w, R.sid, R.i, R.flipped, viFirst, s.settings.autoplay]);

  if (!R.queue.length || (!R.done && !w)) {
    return (
      <div className="stage">
        <div className="card done">
          <div className="empty-ic t-green"><Icon name="checkc" size="xl" /></div>
          <h2>You're all caught up!</h2>
          <p className="muted" style={{ margin: '0 0 12px' }}>No words need review right now.</p>
          <button className="btn btn-primary btn-lg btn-block" onClick={goPractice}>Practice More</button>
          <button className="btn btn-ghost btn-block" onClick={a.exitSession}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  if (R.done) {
    const n = R.queue.length;
    return (
      <DoneCard
        title={R.practice ? 'Practice complete!' : 'Review complete!'}
        sub={R.practice ? 'You went through ' + n + (n === 1 ? ' card.' : ' cards.') : 'You reviewed ' + n + (n === 1 ? ' word' : ' words') + ' today.'}
        stats={[[n, 'completed'], [n - R.res.again, 'remembered', 'var(--success)'], [R.res.again, 'need practice', 'var(--danger)']]}>
        {!R.practice && s.progress.streak > 0 && (
          <div className="streakpill"><Icon name="flame" />{s.progress.streak} day streak</div>
        )}
        <button className="btn btn-primary btn-lg btn-block" onClick={() => { a.set({ review: null, practice: null }); a.go('dashboard'); }}>Back to Dashboard</button>
        <button className="btn btn-secondary btn-block" onClick={goPractice}>Practice More</button>
      </DoneCard>
    );
  }

  const word = w as Word;
  return (
    <div className="stage">
      <div key={R.anim} className={'card flash ' + (R.anim % 2 ? 'animB' : 'animA')}>
        {!R.flipped ? (
          <>
            <PosBadge>{word.pos}</PosBadge>
            <h1 className="word-xl">{viFirst ? word.vi : word.word}</h1>
            {!viFirst && (
              <div className="ipa-row"><span className="ipa">{word.ipa}</span><button className="iconbtn sm" onClick={() => speak(word.word)} aria-label="Play pronunciation"><Icon name="volume" /></button></div>
            )}
            <div style={{ height: 18 }} />
            <button className="btn btn-primary btn-lg" onClick={a.flip}>Show Answer</button>
            <div className="keyhint"><span className="kbd">Space</span> to flip</div>
          </>
        ) : (
          <>
            <div className="badges" style={{ justifyContent: 'center' }}><PosBadge>{word.pos}</PosBadge><LevelBadge level={word.level} /></div>
            <h1 className="word-xl">{word.word}</h1>
            <div className="ipa-row"><span className="ipa">{word.ipa}</span><button className="iconbtn sm" onClick={() => speak(word.word)} aria-label="Play pronunciation"><Icon name="volume" /></button></div>
            <div className="divider" />
            <div className="tr-big">{word.vi}</div>
            <p className="muted" style={{ margin: 0, fontSize: 16, maxWidth: 480 }}>{word.meaning}</p>
            {s.settings.showEx && word.ex && <p className="quote">“{word.ex}”</p>}
          </>
        )}
      </div>
      {R.flipped && (
        <>
          <div className="rate">
            {RATINGS.map(([r, ivl, icon, key]) => (
              <button key={r} className={'ratebtn r-' + r} onClick={() => a.rate(r)}>
                <span className="kbd">{key}</span>
                <Icon name={icon} size="lg" />
                <span>{r}</span>
                <span className="ivl">{ivl}</span>
              </button>
            ))}
          </div>
          <div className="keyhint">Press <span className="kbd">1</span>–<span className="kbd">4</span> to rate</div>
        </>
      )}
    </div>
  );
}

function PracticeView({ ansRef }: { ansRef: React.RefObject<HTMLInputElement | null> }) {
  const { s, a } = useWB();
  const P = s.practice!;
  const n = P.qs.length;

  const q = P.qs[Math.min(P.i, n - 1)];
  const w: Word | { word: string; meaning: string; vi: string; pos: string; ex: string; ipa: string } =
    s.words.find((x) => x.id === q.id) ?? { word: q.answer ?? '', meaning: '', vi: '', pos: '', ex: '', ipa: '' };

  // Listening questions speak the word as soon as they appear.
  const heard = useRef('');
  useEffect(() => {
    if (P.mode !== 'listen' || P.done) return;
    const key = P.pid + ':' + P.i;
    if (heard.current === key) return;
    heard.current = key;
    const t = setTimeout(() => speak(w.word), 250);
    return () => clearTimeout(t);
  }, [P.mode, P.done, P.pid, P.i, w.word]);

  if (P.done) {
    const acc = Math.round((P.score / n) * 100);
    return (
      <DoneCard title={acc >= 80 ? 'Great job!' : acc >= 50 ? 'Nice work!' : 'Keep practicing!'} sub={'You answered ' + P.score + ' of ' + n + ' correctly.'}
        stats={[[n, 'questions'], [P.score, 'correct', 'var(--success)'], [acc + '%', 'accuracy']]}>
        <button className="btn btn-primary btn-lg btn-block" onClick={() => a.startPractice(P.mode)}>Practice again</button>
        <button className="btn btn-secondary btn-block" onClick={a.exitSession}>Back to Practice</button>
      </DoneCard>
    );
  }

  const explain = '“' + cap1(w.word) + '” means ' + low1((w.meaning || '').replace(/\.$/, '')) + '.';
  const fb = P.checked && (
    <div className={'fb ' + (P.correct ? 'ok' : 'no')}>
      <div className="fb-t"><Icon name={P.correct ? 'checkc' : 'alert'} />{P.correct ? 'Correct!' : P.mode === 'mc' ? 'Not quite' : 'Not quite — the answer is'}</div>
      {P.mode !== 'mc' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{w.word}</span><span className="ipa">{w.ipa}</span><span className="muted">· {w.vi}</span>
        </div>
      )}
      {w.meaning && <div>{explain}</div>}
      {P.mode === 'mc' && w.ex && <div className="muted sm">Example: “{w.ex}”</div>}
    </div>
  );
  const nextBtn = <button className="btn btn-primary btn-lg" onClick={a.pNext}>Continue<Icon name="right" /></button>;

  if (P.mode === 'mc') {
    return (
      <div className="stage">
        <div key={P.anim} className={'card qcard ' + (P.anim % 2 ? 'animB' : 'animA')}>
          <span className="qkicker">Question {P.i + 1} / {n}</span>
          <h2 className="qtext">What does “{w.word}” mean?</h2>
          <div className="opts">
            {(q.opts ?? []).map((t, i) => {
              const isAns = i === q.ans, isPicked = i === P.picked;
              const cls = 'opt' + (P.checked ? (isAns ? ' correct' : isPicked ? ' wrong' : ' dim') : '');
              return (
                <button key={i} className={cls} onClick={() => a.pPick(i)} disabled={P.checked && !isAns && !isPicked}>
                  <span className="letter">{'ABCD'.charAt(i)}</span>
                  <span className="grow">{t}</span>
                  {P.checked && isAns && <Icon name="check" style={{ color: 'var(--success)' }} />}
                  {P.checked && isPicked && !isAns && <Icon name="x" style={{ color: 'var(--danger)' }} />}
                </button>
              );
            })}
          </div>
          {fb}
          <div className="qfoot">
            <span className="muted sm">Score: {P.score} / {n}</span>
            {P.checked ? nextBtn : <span className="keyhint">Press <span className="kbd">1</span>–<span className="kbd">4</span> to answer</span>}
          </div>
        </div>
      </div>
    );
  }

  const answer = q.answer ?? '';
  return (
    <div className="stage">
      <div key={P.anim} className={'card qcard ' + (P.anim % 2 ? 'animB' : 'animA')}>
        <span className="qkicker">Question {P.i + 1} / {n}</span>
        {P.mode === 'fill' && (
          <>
            <h2 className="qtext">{q.before}<span className="blank">{P.checked ? answer : ' '}</span>{q.after}</h2>
            <div className="muted sm">Hint: {w.pos} · {w.vi}</div>
          </>
        )}
        {P.mode === 'listen' && (
          <>
            <h2 className="qtext">Listen and type the word you hear</h2>
            <div className="listen">
              <button className="playbig" onClick={() => speak(w.word)} aria-label="Play the word"><Icon name="volume" /></button>
              <div className="stack" style={{ gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => speak(w.word, 0.6)}><Icon name="clock" size="sm" />Play slowly</button>
                {w.ex && <button className="btn btn-secondary btn-sm" onClick={() => speak(w.ex, 0.95)}><Icon name="chat" size="sm" />Hear it in a sentence</button>}
              </div>
            </div>
            <div className="muted sm">Hint: {w.pos} · {answer.replace(/\s/g, '').length} letters · press <span className="kbd">Ctrl</span> + <span className="kbd">Space</span> to replay</div>
            {!canSpeak() && <div className="errtxt"><Icon name="alert" size="sm" />Your browser can’t play speech, so audio may not work here.</div>}
          </>
        )}
        {P.mode === 'trans' && (
          <>
            <div className="muted sm" style={{ fontWeight: 700 }}>Translate into English</div>
            <h2 className="qtext">{w.vi}</h2>
            <div className="muted sm">Hint: {w.pos} · starts with “{answer.charAt(0).toUpperCase()}”</div>
          </>
        )}
        <input
          ref={ansRef} className={'input input-lg' + (P.checked && !P.correct ? ' err' : '')} placeholder="Type your answer…"
          value={P.input} readOnly={P.checked} aria-label="Your answer" autoComplete="off" spellCheck={false}
          onChange={(e) => a.pUpdate({ input: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === ' ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); speak(w.word); }
            else if (e.key === 'Enter') { e.preventDefault(); if (P.checked) a.pNext(); else a.pCheck(false); }
          }}
        />
        {fb}
        <div className="qfoot">
          <span className="muted sm">Score: {P.score} / {n}</span>
          {P.checked ? nextBtn : (
            <div className="actions">
              <button className="btn btn-ghost" onClick={() => a.pCheck(true)}>Skip</button>
              <button className="btn btn-primary btn-lg" onClick={() => a.pCheck(false)} disabled={!P.input.trim()}>Check Answer</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Session() {
  const { s, a } = useWB();
  const sessRef = useRef<HTMLDivElement>(null);
  const ansRef = useRef<HTMLInputElement>(null);
  const R = s.route === 'review' ? s.review : null;
  const P = s.route === 'practice' ? s.practice : null;

  // Keep keyboard focus inside the session so shortcuts work without clicking.
  useEffect(() => {
    const typed = P && !P.done && P.mode !== 'mc';
    if (typed && ansRef.current) {
      if (document.activeElement !== ansRef.current) ansRef.current.focus({ preventScroll: true });
    } else if (sessRef.current && (!document.activeElement || document.activeElement === document.body)) {
      sessRef.current.focus({ preventScroll: true });
    }
  });

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    const tag = (e.target as HTMLElement).tagName;
    if (k === 'Escape') { e.preventDefault(); a.exitSession(); return; }
    if (tag === 'INPUT') return;
    if (R && !R.done && R.queue.length) {
      if (!R.flipped && (k === ' ' || k === 'Enter')) { if (tag === 'BUTTON') return; e.preventDefault(); a.flip(); return; }
      if (R.flipped && KEY_RATING[k]) { e.preventDefault(); a.rate(KEY_RATING[k]); }
      return;
    }
    if (P && !P.done && P.mode === 'mc') {
      if (!P.checked && ['1', '2', '3', '4'].includes(k)) { e.preventDefault(); a.pPick(Number(k) - 1); return; }
      if (P.checked && k === 'Enter' && tag !== 'BUTTON') { e.preventDefault(); a.pNext(); }
    }
  };

  let title = '', pct = 0, count = '';
  if (R) {
    const n = R.queue.length;
    title = R.title;
    if (!n) { pct = 100; count = '0 / 0'; }
    else if (R.done) { pct = 100; count = n + ' / ' + n; }
    else { pct = Math.round((R.i / n) * 100); count = (R.i + 1) + ' / ' + n; }
  } else if (P) {
    const n = P.qs.length;
    title = TITLES[P.mode];
    pct = P.done ? 100 : Math.round(((P.i + (P.checked ? 1 : 0)) / n) * 100);
    count = P.done ? n + ' / ' + n : (P.i + 1) + ' / ' + n;
  }

  return (
    <div className="session" tabIndex={-1} onKeyDown={onKey} ref={sessRef}>
      <div className="sbar">
        <span className="stitle">{title}</span>
        <div className="prog"><div style={{ width: pct + '%' }} /></div>
        <span className="scount">{count}</span>
        <button className="btn btn-ghost btn-sm" onClick={a.exitSession} aria-label="Exit session"><Icon name="x" size="sm" />Exit</button>
      </div>
      {R && <ReviewView />}
      {P && <PracticeView ansRef={ansRef} />}
    </div>
  );
}
