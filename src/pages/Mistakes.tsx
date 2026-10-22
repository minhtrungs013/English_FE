import { useEffect, useState } from 'react';
import { api, type MistakeDrill, type MistakeNotebook } from '../lib/api';
import { speak } from '../lib/speech';
import { EmptyState, Icon, PageHead } from '../components/ui';
import { useWB } from '../state/WordbookContext';

export const MISTAKE_LABEL: Record<string, string> = {
  tense: 'Tense', agreement: 'Subject–verb', article: 'Article (a/an/the)', preposition: 'Preposition', 'word-form': 'Word form',
  'word-meaning': 'Word meaning', collocation: 'Collocation', 'word-order': 'Word order', spelling: 'Spelling', punctuation: 'Punctuation', other: 'Other'
};
const fmtWeek = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const fmtDay = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Average sentence score per week (0–10), one bar per week; empty weeks show no bar. */
function WeekChart({ weeks }: { weeks: MistakeNotebook['weeks'] }) {
  return (
    <figure className="mk-chart">
      <figcaption className="label">Average score by week</figcaption>
      <div className="mk-plot" aria-hidden="true">
        {[10, 5, 0].map((v) => <span key={v} className="mk-grid" style={{ bottom: v * 10 + '%' }}><i>{v}</i></span>)}
        <div className="mk-bars">
          {weeks.map((w) => (
            <div key={w.week} className="mk-col" title={fmtWeek(w.week) + ': ' + (w.avg === null ? 'no sentences' : w.avg + '/10 · ' + w.attempts + ' sentence' + (w.attempts === 1 ? '' : 's') + ' · ' + w.mistakes + ' mistake' + (w.mistakes === 1 ? '' : 's'))}>
              {w.avg !== null && <span className="mk-bar" style={{ height: Math.max(2, w.avg * 10) + '%' }} />}
              {w.avg !== null && <span className="mk-tip">{w.avg}/10 · {w.attempts} sentence{w.attempts === 1 ? '' : 's'}</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="mk-x" aria-hidden="true">{weeks.map((w) => <span key={w.week}>{fmtWeek(w.week)}</span>)}</div>
      <table className="c-sr">
        <caption>Average score by week</caption>
        <thead><tr><th>Week of</th><th>Sentences</th><th>Average</th><th>Mistakes</th></tr></thead>
        <tbody>{weeks.map((w) => <tr key={w.week}><td>{fmtWeek(w.week)}</td><td>{w.attempts}</td><td>{w.avg ?? '—'}</td><td>{w.mistakes}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** Multiple-choice questions made from my own mistakes. */
function Drill({ type, onDone }: { type: string; onDone: () => void }) {
  const [items, setItems] = useState<MistakeDrill[] | null>(null);
  const [err, setErr] = useState('');
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [right, setRight] = useState(0);
  useEffect(() => { api.mistakeDrill(type).then((r) => setItems(r.items)).catch((e) => setErr(e instanceof Error ? e.message : 'Something went wrong.')); }, [type]);
  if (err) return <EmptyState icon="alert" tint="t-red" title="Can’t load the questions" text={err} />;
  if (!items) return <div className="sk" style={{ height: 220 }} />;
  if (!items.length) return <EmptyState icon="check" tint="t-green" title="Nothing to practise" text="No mistakes of this kind can be turned into questions yet." />;
  if (i >= items.length) {
    return (
      <div className="card ws-card ws-done">
        <span className="stat-ic t-green"><Icon name="check" size="lg" /></span>
        <h2>{right} of {items.length} right</h2>
        <p className="muted">These questions came from sentences you wrote. Keep writing to find new ones.</p>
        <div className="ws-actions"><button className="btn btn-primary" onClick={onDone}>Back to my mistakes</button></div>
      </div>
    );
  }
  const q = items[i];
  const parts = q.prompt.split('___');
  const answered = pick !== null;
  const choose = (c: string) => { if (answered) return; setPick(c); if (c === q.answer) setRight(right + 1); };
  return (
    <div className="card ws-card">
      <div className="ws-top"><span className="muted sm">Question {i + 1} of {items.length}</span><span className="badge t-indigo">{MISTAKE_LABEL[q.type] ?? q.type}</span></div>
      <p className="mk-q">{parts[0]}<span className={'mk-gap' + (answered ? (pick === q.answer ? ' ok' : ' bad') : '')}>{answered ? q.answer : '____'}</span>{parts.slice(1).join('___')}</p>
      <div className="mk-choices" role="group" aria-label="Choose the right words">
        {q.choices.map((c) => (
          <button key={c} className={'mk-choice' + (answered && c === q.answer ? ' ok' : answered && c === pick ? ' bad' : '')} onClick={() => choose(c)} disabled={answered} aria-pressed={pick === c}>{c}</button>
        ))}
      </div>
      {answered && (
        <div className="ws-fb" aria-live="polite">
          <b>{pick === q.answer ? 'Right!' : 'Not quite.'}</b> You once wrote “{q.wrong}”.{q.explainVi ? ' ' + q.explainVi : ''}
          <button className="iconbtn sm" style={{ marginLeft: 6, verticalAlign: 'middle' }} onClick={() => speak(q.sentence)} aria-label="Hear the sentence"><Icon name="volume" size="sm" /></button>
        </div>
      )}
      <div className="ws-actions">
        <button className="btn btn-ghost" onClick={onDone}>Stop</button>
        <button className="btn btn-primary" disabled={!answered} onClick={() => { setI(i + 1); setPick(null); }}>{i + 1 < items.length ? 'Next' : 'Finish'}<Icon name="right" size="sm" /></button>
      </div>
    </div>
  );
}

/** Practice → My mistakes: what I get wrong in my sentences, how I'm improving, and questions from my own mistakes. */
export function Mistakes() {
  const { a } = useWB();
  const [type, setType] = useState('');
  const [data, setData] = useState<MistakeNotebook | null>(null);
  const [err, setErr] = useState('');
  const [drill, setDrill] = useState(false);
  useEffect(() => { setData(null); api.mistakes(type).then(setData).catch((e) => setErr(e instanceof Error ? e.message : 'Something went wrong.')); }, [type, drill]);

  const head = (
    <PageHead title="My mistakes" sub="Mistakes from the sentences you wrote (last 8 weeks). Practise them until they’re gone.">
      <button className="btn btn-secondary" onClick={() => a.go('practice')}><Icon name="left" size="sm" />Practice</button>
    </PageHead>
  );
  if (drill) return <>{head}<Drill type={type} onDone={() => setDrill(false)} /></>;
  if (err) return <>{head}<EmptyState icon="alert" tint="t-red" title="Can’t load your mistakes" text={err} /></>;
  if (!data) return <>{head}<div className="sk" style={{ height: 300 }} /></>;
  if (!data.attempts) {
    return (
      <>{head}
        <EmptyState icon="sparkle" tint="t-indigo" title="No sentences yet" text="Write sentences with your words first; AI checks them and your mistakes show up here.">
          <button className="btn btn-primary" onClick={() => a.go('writeSentence')}>Write a sentence</button>
        </EmptyState>
      </>
    );
  }
  const trend = (t: { last7: number; prev7: number }) => (t.prev7 === 0 && t.last7 === 0 ? '' : t.last7 < t.prev7 ? '↓ ' + (t.prev7 - t.last7) + ' vs last week' : t.last7 > t.prev7 ? '↑ ' + (t.last7 - t.prev7) + ' vs last week' : 'same as last week');
  return (
    <>
      {head}
      <div className="adm-tiles">
        <div className="adm-tile"><span className="adm-tval">{data.attempts}</span><span className="adm-tlabel">Sentences checked</span><span className="muted xs">Practice and homework</span></div>
        <div className="adm-tile"><span className="adm-tval">{data.avg ?? '—'}<small className="muted">/10</small></span><span className="adm-tlabel">Average score</span><span className="muted xs">last 8 weeks</span></div>
        <div className="adm-tile"><span className="adm-tval">{data.attempts - data.withMistakes}</span><span className="adm-tlabel">Without mistakes</span><span className="muted xs">of {data.attempts} sentences</span></div>
      </div>
      <div className="card mk-card"><WeekChart weeks={data.weeks} /></div>

      {data.byType.length > 0 && (
        <div className="card mk-card">
          <div className="mk-head">
            <h3>Mistakes by kind</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setDrill(true)} disabled={!data.drillable}>
              <Icon name="sparkle" size="sm" />Practise {type ? MISTAKE_LABEL[type]?.toLowerCase() : 'these'}{data.drillable ? ' (' + Math.min(10, data.drillable) + ')' : ''}
            </button>
          </div>
          <div className="adm-chips" role="group" aria-label="Filter by kind">
            <button className={'chip' + (!type ? ' on' : '')} aria-pressed={!type} onClick={() => setType('')}>All</button>
            {data.byType.map((t) => (
              <button key={t.type} className={'chip' + (type === t.type ? ' on' : '')} aria-pressed={type === t.type} onClick={() => setType(type === t.type ? '' : t.type)}>
                {MISTAKE_LABEL[t.type] ?? t.type} <b>{t.count}</b>{trend(t) && <span className="muted xs"> · {trend(t)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mk-list">
        {data.recent.map((r) => (
          <div key={r.id} className="card mk-item">
            <div className="mk-item-top">
              <b>{r.word}</b>
              <span className="muted xs">{fmtDay(r.at)}{r.source === 'homework' ? ' · homework' : ''}</span>
              <span className={'mk-score ' + (r.score >= 9 ? 'good' : r.score >= 6 ? 'ok' : 'bad')}>{r.score}/10</span>
            </div>
            <p className="mk-wrong">{r.sentence}</p>
            {r.corrected && r.corrected !== r.sentence && <p className="mk-right"><Icon name="check" size="sm" />{r.corrected}</p>}
            <ul className="ws-mistakes">
              {r.mistakes.map((m, k) => (
                <li key={k}><span className="badge t-red">{MISTAKE_LABEL[m.type] ?? m.type}</span><span><s>{m.wrong}</s> → <b>{m.fix}</b>{m.explainVi ? <span className="muted"> · {m.explainVi}</span> : null}</span></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
