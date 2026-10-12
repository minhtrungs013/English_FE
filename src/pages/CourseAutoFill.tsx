import { useId, useState } from 'react';
import { api, type CourseDetail, type Topic } from '../lib/api';
import { LEVELS, type Level } from '../lib/data';
import { useWB } from '../state/WordbookContext';
import { Icon } from '../components/ui';
import { Dialog, errText } from './Courses';

export type AutoFillMode = 'empty' | 'replace';
export interface AutoFillResult { added: number; missing: number; course: CourseDetail }

export const AUTOFILL_TOPICS: { id: Topic; label: string }[] = [
  { id: 'it', label: 'IT' }, { id: 'interview', label: 'Interviews' }, { id: 'customer', label: 'Customers' },
  { id: 'leader', label: 'Leadership' }, { id: 'toeic', label: 'TOEIC/office' }, { id: 'other', label: 'Everyday' },
];

export function autoFill(id: string, levels: Level[], topics: Topic[], mode: AutoFillMode = 'empty') {
  return api.autoFillCourse(id, { levels: levels.length ? levels : undefined, topics: topics.length ? topics : undefined, mode });
}

export function autoFillToast(r: AutoFillResult): string {
  return 'Added ' + r.added + ' ' + (r.added === 1 ? 'word' : 'words') + '.' +
    (r.missing > 0 ? ' ' + r.missing + (r.missing === 1 ? ' place' : ' places') + ' still empty — try more levels or topics.' : '');
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Level + topic chips (none picked = any). */
export function AutoFillOptions({ levels, setLevels, topics, setTopics }: {
  levels: Level[]; setLevels: (l: Level[]) => void; topics: Topic[]; setTopics: (t: Topic[]) => void;
}) {
  const id = useId();
  return (
    <>
      <div className="field">
        <span className="label" id={id + 'lv'}>Levels <span className="muted xs">(none = any)</span></span>
        <div className="chips afchips" role="group" aria-labelledby={id + 'lv'}>
          {LEVELS.map((l) => (
            <button key={l} type="button" className={'chip soft' + (levels.includes(l) ? ' on' : '')} aria-pressed={levels.includes(l)} onClick={() => setLevels(toggle(levels, l))}>{l}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label" id={id + 'tp'}>Topics <span className="muted xs">(none = any)</span></span>
        <div className="chips afchips" role="group" aria-labelledby={id + 'tp'}>
          {AUTOFILL_TOPICS.map((t) => (
            <button key={t.id} type="button" className={'chip soft' + (topics.includes(t.id) ? ' on' : '')} aria-pressed={topics.includes(t.id)} onClick={() => setTopics(toggle(topics, t.id))}>{t.label}</button>
          ))}
        </div>
      </div>
    </>
  );
}

export function AutoFillDialog({ c, onDone, onClose }: { c: CourseDetail; onDone: (c: CourseDetail) => void; onClose: () => void }) {
  const { a } = useWB();
  const id = useId();
  const [levels, setLevels] = useState<Level[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [mode, setMode] = useState<AutoFillMode>('empty');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hasMembers = c.members > 0;
  const free = c.days.reduce((n, d) => n + Math.max(0, c.wordsPerDay - d.count), 0);
  const total = c.wordsPerDay * c.totalDays;
  const upTo = mode === 'replace' ? total : free;
  const nothing = mode === 'empty' && free === 0;

  const fill = async () => {
    setBusy(true); setErr('');
    try {
      const r = await autoFill(c.id, levels, topics, mode);
      onDone(r.course);
      a.showToast(autoFillToast(r));
      onClose();
    } catch (e) {
      setErr(errText(e, 'Couldn’t fill the days.'));
      setBusy(false);
    }
  };

  return (
    <Dialog label="Auto-fill days" onClose={onClose} wide>
      <h2>Auto-fill days</h2>
      <p className="muted sm" style={{ marginTop: 0 }}>Picks random words from the built-in library — easier levels on earlier days, never the same word twice.</p>
      <AutoFillOptions levels={levels} setLevels={setLevels} topics={topics} setTopics={setTopics} />
      <div className="field">
        <span className="label" id={id + 'md'}>What to fill</span>
        <div className="radios afmodes" role="radiogroup" aria-labelledby={id + 'md'}>
          <label className={'radio' + (mode === 'empty' ? ' on' : '')}>
            <input type="radio" name={id + 'mode'} checked={mode === 'empty'} onChange={() => setMode('empty')} />Fill empty places (keep my words)
          </label>
          <label className={'radio' + (mode === 'replace' ? ' on' : '') + (hasMembers ? ' disabled' : '')} aria-disabled={hasMembers || undefined}>
            <input type="radio" name={id + 'mode'} checked={mode === 'replace'} disabled={hasMembers} onChange={() => setMode('replace')} />Replace all words
          </label>
        </div>
        {hasMembers && <span className="hint">Replacing is off because people have already joined this course.</span>}
      </div>
      <p className="sm" aria-live="polite" style={{ fontWeight: 700, margin: 0 }}>
        {nothing ? 'Every day is already full.' : 'Will add up to ' + upTo + ' words (' + c.wordsPerDay + ' words × ' + c.totalDays + ' days).'}
      </p>
      {err && <span className="errtxt" role="alert"><Icon name="alert" size="sm" />{err}</span>}
      <div className="mfoot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={fill} disabled={busy || nothing}>{busy ? 'Filling…' : 'Fill'}</button>
      </div>
    </Dialog>
  );
}
