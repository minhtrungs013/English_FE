import { useEffect, useState } from 'react';
import { api, ApiError, type CourseDetail, type CourseWord, type LibraryWord, type Quota, type Topic } from '../lib/api';
import { speak } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { EmptyState, Icon, LevelBadge, PageHead } from '../components/ui';
import { TOPIC_LABEL } from './Library';
import { BackToCourses, CourseLoading, useCourse } from './Course';
import { ConfirmDialog, JoinCode, VisibilityPicker, WordsPerDayPicker, errText } from './Courses';

const TOPICS: Topic[] = ['it', 'interview', 'customer', 'leader', 'toeic', 'other'];
const SOURCE_LABEL: Record<CourseWord['source'], string> = { library: 'Library', ai: 'AI', manual: 'Manual' };

const fromLibrary = (w: LibraryWord): CourseWord => ({
  word: w.word, ipa: w.ipa, pos: w.pos, meaning: w.meaning, vi: w.vi, ex: w.ex,
  syn: w.syn, ant: w.ant, level: w.level, libraryId: w.id, source: 'library'
});

function CourseSettings({ c, onSaved, onDelete }: { c: CourseDetail; onSaved: (c: CourseDetail) => void; onDelete: () => void }) {
  const { a } = useWB();
  const [title, setTitle] = useState(c.title);
  const [description, setDescription] = useState(c.description);
  const [wpd, setWpd] = useState(c.wordsPerDay);
  const [visibility, setVisibility] = useState(c.visibility);
  const [busy, setBusy] = useState(false);
  const dirty = title.trim() !== c.title || description.trim() !== c.description || wpd !== c.wordsPerDay || visibility !== c.visibility;
  const fullest = Math.max(0, ...c.days.map((d) => d.count));
  const save = async () => {
    if (!title.trim()) { a.showToast('Please give the course a title.', 'bad'); return; }
    setBusy(true);
    try {
      const res = await api.updateCourse(c.id, { title: title.trim(), description: description.trim(), wordsPerDay: wpd, visibility });
      onSaved(res);
      a.showToast('Course details saved.');
    } catch (e) {
      a.showToast(errText(e), 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card pad cset">
      <div className="rowb" style={{ flexWrap: 'wrap' }}>
        <h2 className="h2">Course details</h2>
        {c.joinCode && <JoinCode code={c.joinCode} />}
      </div>
      <div className="form2">
        <div className="field">
          <label className="label" htmlFor="ce-title">Title</label>
          <input id="ce-title" className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <span className="label">Who can join</span>
          <VisibilityPicker value={visibility} onChange={setVisibility} />
        </div>
        <div className="field span2">
          <label className="label" htmlFor="ce-desc">Description</label>
          <textarea id="ce-desc" className="input" style={{ minHeight: 70 }} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field span2">
          <span className="label" id="ce-wpd">Words per day</span>
          <WordsPerDayPicker id="ce-wpd" value={wpd} onChange={setWpd} />
          {wpd < fullest && <span className="errtxt"><Icon name="alert" size="sm" />Some days already have {fullest} words — remove words first.</span>}
        </div>
      </div>
      <div className="rowb" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-danger-soft" onClick={onDelete}><Icon name="trash" size="sm" />Delete course</button>
        <button className="btn btn-primary" onClick={save} disabled={!dirty || busy}><Icon name="check" size="sm" />{busy ? 'Saving…' : 'Save details'}</button>
      </div>
    </div>
  );
}

/** "Add to library" for a course word that isn't in the shared library yet. */
function AddToLibrary({ c, day, index, onDone }: { c: CourseDetail; day: number; index: number; onDone: (c: CourseDetail) => void }) {
  const { a } = useWB();
  const [topic, setTopic] = useState<Topic | ''>('');
  const [busy, setBusy] = useState(false);
  const id = 'lt-' + day + '-' + index;
  const add = async () => {
    setBusy(true);
    try {
      const res = await api.addCourseWordToLibrary(c.id, day, index, topic || undefined);
      onDone(res);
      a.showToast('Added to the library. Everyone can see it now.');
    } catch (e) {
      a.showToast(errText(e), 'bad');
      setBusy(false);
    }
  };
  return (
    <div className="libadd">
      <label className="c-sr" htmlFor={id}>Library topic</label>
      <select id={id} className="input" value={topic} onChange={(e) => setTopic(e.target.value as Topic | '')}>
        <option value="">Topic (optional)</option>
        {TOPICS.map((t) => <option key={t} value={t}>{TOPIC_LABEL[t]}</option>)}
      </select>
      <button className="btn btn-secondary btn-sm" onClick={add} disabled={busy}><Icon name="globe" size="sm" />{busy ? 'Adding…' : 'Add to library'}</button>
    </div>
  );
}

function AddWord({ words, full, saving, quota, setQuota, onAdd }: {
  words: CourseWord[]; full: boolean; saving: boolean; quota: Quota | null; setQuota: (q: Quota) => void; onAdd: (w: CourseWord) => Promise<boolean>;
}) {
  const { a } = useWB();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ term: string; items: LibraryWord[] } | null>(null);
  const [gen, setGen] = useState<CourseWord | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const term = q.trim().toLowerCase();
  const lib = res && res.term === term ? res.items : null;
  const inDay = new Set(words.map((w) => w.word.toLowerCase()));
  const exact = lib?.some((w) => w.word.toLowerCase() === term);
  const left = quota ? Math.max(0, quota.limit - quota.used) : null;

  useEffect(() => {
    if (!term) return;
    let alive = true;
    const t = setTimeout(() => {
      api.library({ q: term, limit: 6 })
        .then((r) => { if (alive) setRes({ term, items: r.items.slice(0, 6) }); })
        .catch(() => { if (alive) setRes({ term, items: [] }); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [term]);

  const add = async (w: CourseWord) => {
    if (inDay.has(w.word.toLowerCase())) { a.showToast('“' + w.word + '” is already in this day.', 'bad'); return; }
    if (await onAdd(w)) { setQ(''); setGen(null); }
  };
  const generate = async () => {
    if (!term || genBusy) return;
    setGenBusy(true);
    try {
      const r = await api.courseAiWord(q.trim());
      if (r.quota) setQuota(r.quota);
      setGen(r.word);
      if (r.source === 'library') a.showToast('Found “' + r.word.word + '” in the library — no AI word used.');
    } catch (e) {
      const qb = e instanceof ApiError ? (e.body?.quota as Quota | undefined) : undefined;
      if (qb) setQuota(qb);
      else if (e instanceof ApiError && e.status === 429 && quota) setQuota({ ...quota, used: quota.limit });
      a.showToast(errText(e, 'Couldn’t find that word.'), 'bad');
    } finally {
      setGenBusy(false);
    }
  };
  const editGen = (patch: Partial<CourseWord>) => setGen((g) => (g ? { ...g, ...patch } : g));

  if (full) {
    return <div className="hint addfull"><Icon name="checkc" size="sm" style={{ color: 'var(--success)' }} />This day is full. Remove a word to add another, or pick another day.</div>;
  }

  return (
    <div className="addbox">
      <div className="rowb" style={{ flexWrap: 'wrap' }}>
        <label className="label" htmlFor="cw-add">Add a word</label>
        {left !== null && <span className="hint"><Icon name="sparkle" size="sm" style={{ color: 'var(--primary)', verticalAlign: 'middle' }} /> {left} AI {left === 1 ? 'word' : 'words'} left today</span>}
      </div>
      <div className="search-wrap" style={{ marginBottom: 0 }}>
        <span className="inicon"><Icon name="search" /></span>
        <input id="cw-add" className="input withicon" type="search" placeholder="Type a word to find it in the library…" value={q} autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setGen(null); }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const hit = lib?.find((w) => w.word.toLowerCase() === term);
            if (hit) void add(fromLibrary(hit));
            else if (lib && !exact) void generate();
          }} />
      </div>

      {term && !gen && (
        <div className="sugg" aria-live="polite">
          {!lib ? <div className="sd-empty"><span className="spin" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8 }} />Searching the library…</div> : (
            <>
              {lib.map((w) => {
                const have = inDay.has(w.word.toLowerCase());
                return (
                  <button key={w.id} className="sd-row sd-btn" onClick={() => add(fromLibrary(w))} disabled={have || saving}
                    aria-label={have ? w.word + ' is already in this day' : 'Add ' + w.word + ' to this day'}>
                    <span className="sd-main"><span className="sd-word">{w.word}</span><span className="sd-vi">{w.vi || w.meaning}</span></span>
                    <LevelBadge level={w.level} />
                    {have ? <span className="muted xs">In this day</span> : <Icon name="plus" size="sm" />}
                  </button>
                );
              })}
              {!lib.length && <div className="sd-empty">No library words match “{q.trim()}”.</div>}
              {!exact && (
                <div className="genrow">
                  <span className="muted sm">“{q.trim()}” isn’t in the library.</span>
                  <button className="btn btn-primary btn-sm" onClick={generate} disabled={genBusy || left === 0}>
                    {genBusy ? <span className="spin" /> : <Icon name="sparkle" size="sm" />}{genBusy ? 'Generating…' : left === 0 ? 'No AI words left today' : 'Generate with AI'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {gen && (
        <div className="matchbox genbox" role="region" aria-label={'Review ' + gen.word}>
          <div className="matchhead"><Icon name="sparkle" size="sm" />Review “{gen.word}” before adding it</div>
          <div className="matchword stack" style={{ gap: 10 }}>
            <div className="cwhead">
              <b className="cwword">{gen.word}</b><span className="ipa sm">{gen.ipa}</span>
              <button className="iconbtn sm" onClick={() => speak(gen.word)} aria-label={'Play pronunciation of ' + gen.word}><Icon name="volume" size="sm" /></button>
              <span className="badges" style={{ marginLeft: 'auto' }}><LevelBadge level={gen.level} /></span>
            </div>
            <div className="field">
              <label className="label" htmlFor="gen-vi">Vietnamese</label>
              <input id="gen-vi" className="input" value={gen.vi} onChange={(e) => editGen({ vi: e.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="gen-meaning">Meaning</label>
              <textarea id="gen-meaning" className="input" style={{ minHeight: 60 }} value={gen.meaning} onChange={(e) => editGen({ meaning: e.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="gen-ex">Example</label>
              <textarea id="gen-ex" className="input" style={{ minHeight: 60 }} value={gen.ex} onChange={(e) => editGen({ ex: e.target.value })} />
            </div>
          </div>
          <div className="actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setGen(null)}>Discard</button>
            <button className="btn btn-primary btn-sm" onClick={() => add({ ...gen, vi: gen.vi.trim(), meaning: gen.meaning.trim(), ex: gen.ex.trim() })} disabled={saving}><Icon name="plus" size="sm" />Add to day</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CourseEdit() {
  const { s, a } = useWB();
  const { c, setC, failed, reload } = useCourse(s.courseId);
  const [day, setDay] = useState(1);
  const [saving, setSaving] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [delBusy, setDelBusy] = useState(false);

  // Start on the first day that still needs words.
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    if (!c || picked) return;
    setPicked(true);
    const first = c.days.find((d) => d.count < c.wordsPerDay);
    if (first) setDay(first.day);
  }, [c, picked]);

  if (failed) {
    return (
      <>
        <BackToCourses />
        <EmptyState icon="alert" tint="t-red" title="Can’t open this course" text={failed}>
          <button className="btn btn-primary" onClick={reload}><Icon name="refresh" size="sm" />Try again</button>
        </EmptyState>
      </>
    );
  }
  if (!c) return <><BackToCourses /><CourseLoading /></>;
  if (!c.isOwner) {
    return (
      <>
        <BackToCourses />
        <EmptyState icon="lock" title="Only the owner can edit this course" text="You can still learn it day by day.">
          <button className="btn btn-primary" onClick={() => a.openCourse(c.id)}>Open course</button>
        </EmptyState>
      </>
    );
  }

  const d = c.days.find((x) => x.day === day) ?? c.days[0];
  const words = d.words ?? [];
  const full = words.length >= c.wordsPerDay;

  const saveDay = async (next: CourseWord[], msg: string): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await api.setCourseDay(c.id, d.day, next);
      setC(res);
      a.showToast(msg);
      return true;
    } catch (e) {
      a.showToast(errText(e, 'Couldn’t save this day.'), 'bad');
      return false;
    } finally {
      setSaving(false);
    }
  };
  const addWord = (w: CourseWord) => saveDay([...words, w], 'Added “' + w.word + '” to day ' + d.day + '.');
  const removeWord = (i: number) => void saveDay(words.filter((_, j) => j !== i), 'Removed “' + words[i].word + '” from day ' + d.day + '.');

  const del = async () => {
    setDelBusy(true);
    try {
      await api.deleteCourse(c.id);
      a.showToast('Deleted “' + c.title + '”.');
      a.go('courses');
    } catch (e) {
      a.showToast(errText(e), 'bad');
      setDelBusy(false);
      setDeleting(false);
    }
  };

  return (
    <>
      <BackToCourses />
      <PageHead title="Edit Course" sub={<>Plan what learners get each day of “{c.title}”. Changes to a day are saved right away.</>}>
        <button className="btn btn-secondary" onClick={() => a.openCourse(c.id)}><Icon name="eye" size="sm" />View as learner</button>
      </PageHead>

      <CourseSettings key={c.title + c.description + c.wordsPerDay + c.visibility} c={c} onSaved={setC} onDelete={() => setDeleting(true)} />

      <div className="card pad cdays">
        <div className="rowb" style={{ flexWrap: 'wrap' }}>
          <h2 className="h2">Days</h2>
          <span className="muted sm">{c.readyDays} of {c.totalDays} days have words · up to {c.wordsPerDay} words a day</span>
        </div>
        <div className="daypick" role="group" aria-label="Choose a day">
          {c.days.map((x) => (
            <button key={x.day} className={'dp' + (x.day === d.day ? ' on' : '') + (x.count >= c.wordsPerDay ? ' full' : x.count === 0 ? ' none' : '')}
              onClick={() => setDay(x.day)} aria-pressed={x.day === d.day} aria-label={'Day ' + x.day + ', ' + x.count + ' of ' + c.wordsPerDay + ' words'}>
              <span className="dp-n">Day {x.day}</span>
              <span className="dp-c">{x.count}/{c.wordsPerDay}</span>
            </button>
          ))}
        </div>

        <div className="dayedit">
          <div className="rowb" style={{ flexWrap: 'wrap' }}>
            <h3 className="h2">Day {d.day}</h3>
            <span className="muted sm" aria-live="polite">{saving ? 'Saving…' : words.length + ' of ' + c.wordsPerDay + ' words · saved'}</span>
          </div>
          {words.length ? (
            <div className="ewlist">
              {words.map((w, i) => (
                <div key={w.word + i} className="ewrow">
                  <div className="ewmain">
                    <div className="cwhead">
                      <b className="cwword">{w.word}</b><span className="ipa sm">{w.ipa}</span>
                      <span className={'badge ' + (w.source === 'library' ? 't-blue' : w.source === 'ai' ? 't-indigo' : 'pos')}>{SOURCE_LABEL[w.source] ?? w.source}</span>
                      <LevelBadge level={w.level} />
                    </div>
                    <span className="vi sm">{w.vi}</span>
                    {w.meaning && <span className="muted xs clamp">{w.meaning}</span>}
                  </div>
                  <div className="ewact">
                    {!w.libraryId && <AddToLibrary c={c} day={d.day} index={i} onDone={setC} />}
                    <button className="iconbtn sm danger" onClick={() => removeWord(i)} disabled={saving} aria-label={'Remove ' + w.word + ' from day ' + d.day} title="Remove"><Icon name="trash" size="sm" /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted sm" style={{ margin: 0 }}>No words for day {d.day} yet — learners will see “Coming soon”.</p>
          )}
          <AddWord key={d.day} words={words} full={full} saving={saving} quota={quota} setQuota={setQuota} onAdd={addWord} />
        </div>
      </div>

      {deleting && (
        <ConfirmDialog title={'Delete “' + c.title + '”?'} text="The course and everyone’s progress in it will be removed. Words learners already saved stay in their vocabulary. This cannot be undone."
          confirm="Delete course" danger busy={delBusy} onConfirm={del} onClose={() => setDeleting(false)} />
      )}
    </>
  );
}
