import { useEffect, useState } from 'react';
import { api, type LibraryWord } from '../lib/api';
import { LEVELS, POS_LIST, type FormData } from '../lib/data';
import { LOOKUP_STEPS, useWB } from '../state/WordbookContext';
import { Dropdown, Icon, LevelBadge, PageHead } from '../components/ui';
import { TopicBadge } from './Library';

/** While adding a word: the library's entry for exactly that word (if any), checked as you type. */
function useLibraryMatch(word: string, enabled: boolean): LibraryWord | null {
  const [match, setMatch] = useState<{ key: string; w: LibraryWord | null } | null>(null);
  const key = word.trim().toLowerCase();
  useEffect(() => {
    if (!enabled || !key) return;
    let alive = true;
    const t = setTimeout(() => {
      api.findInLibrary(key).then((r) => { if (alive) setMatch({ key, w: r.word }); }).catch(() => { /* offline: just don't suggest */ });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [key, enabled]);
  return enabled && key && match?.key === key ? match.w : null;
}

function ChipInput({ id, field }: { id: string; field: 'syn' | 'ant' }) {
  const { s, a } = useWB();
  const f = s.route === 'edit' ? s.editForm : s.form;
  const inKey = field === 'syn' ? 'synIn' : 'antIn';
  const list = f[field];
  return (
    <div className="taginput">
      {list.map((t, i) => (
        <span key={t + i} className="tchip">
          {t}
          <button onClick={() => a.setF({ [field]: list.filter((_, j) => j !== i) })} aria-label={'Remove ' + t}><Icon name="x" size="sm" /></button>
        </span>
      ))}
      <input
        id={id} placeholder="Type and press Enter" value={f[inKey]}
        onChange={(e) => a.setF({ [inKey]: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); a.addChip(field); }
          else if (e.key === 'Backspace' && !f[inKey] && list.length) a.setF({ [field]: list.slice(0, -1) });
        }}
        onBlur={() => a.addChip(field)}
      />
    </div>
  );
}

export function VocabForm() {
  const { s, a } = useWB();
  const isEdit = s.route === 'edit';
  const typed = (isEdit ? s.editForm : s.form).word.trim().toLowerCase();
  const libMatch = useLibraryMatch(typed, !isEdit);
  // Already in my words? (the server would also refuse it on save)
  const mineMatch = !isEdit && typed ? s.words.find((w) => w.word.toLowerCase() === typed) : undefined;
  const [usingLib, setUsingLib] = useState(false);
  const useLibraryWord = async () => {
    if (!libMatch || usingLib) return;
    setUsingLib(true);
    const w = await a.saveFromLibrary(libMatch);
    setUsingLib(false);
    if (w) { a.setF({ word: '' }); a.go('detail', { sel: w.id }); }
  };
  const f = isEdit ? s.editForm : s.form;
  const text = (field: keyof FormData) => ({
    value: f[field] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => a.setF({ [field]: e.target.value })
  });
  const formCat = s.cats.find((c) => c.id === f.cat);

  return (
    <>
      <button className="back" onClick={a.formCancel}><Icon name="left" size="sm" />{isEdit ? 'Back to word' : 'Back'}</button>
      <PageHead title={isEdit ? 'Edit Vocabulary' : 'Add Vocabulary'} sub={isEdit ? 'Update the details for “' + f.word + '”.' : 'Save a new word to your collection.'} />
      <div className="card" style={{ maxWidth: 880 }} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); a.save(); } }}>
        <div className="formcard">
          <div className="quick">
            <div className="field">
              <label className="label" htmlFor="f-word">Word <span className="req">*</span></label>
              <input id="f-word" className={'input input-xl' + (s.formErr ? ' err' : '')} placeholder="e.g. maintain" autoComplete="off" autoFocus={!isEdit}
                {...text('word')}
                onKeyDown={(e) => { if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); a.generate(); } }} />
              {s.formErr && <span className="errtxt"><Icon name="alert" size="sm" />{s.formErr}</span>}
              {mineMatch ? (
                <div className="matchbox">
                  <div className="matchhead"><Icon name="checkc" size="sm" />You already have “{mineMatch.word}” in your vocabulary.</div>
                  <button className="btn btn-secondary btn-sm" onClick={() => a.go('detail', { sel: mineMatch.id })}>Open it<Icon name="right" size="sm" /></button>
                </div>
              ) : libMatch ? (
                <div className="matchbox" role="status">
                  <div className="matchhead"><Icon name="globe" size="sm" />“{libMatch.word}” is already in the library — save it instead of typing it again.</div>
                  <div className="matchword">
                    <b>{libMatch.word}</b> <span className="ipa">{libMatch.ipa}</span>
                    <div className="vi">{libMatch.vi}</div>
                    <div className="muted sm">{libMatch.meaning}</div>
                    <div className="badges" style={{ marginTop: 6 }}><TopicBadge topic={libMatch.topic} /><LevelBadge level={libMatch.level} /></div>
                  </div>
                  <button className="btn btn-primary" onClick={useLibraryWord} disabled={usingLib}><Icon name="plus" size="sm" />{usingLib ? 'Saving…' : 'Save from library'}</button>
                </div>
              ) : null}
            </div>
            <div className="field" style={{ flexGrow: 0, justifyContent: 'flex-end' }}>
              <span className="label desk-only" style={{ visibility: 'hidden' }}>Auto</span>
              <button className="btn btn-primary btn-lg" style={{ minHeight: 60 }} onClick={a.generate} disabled={s.aiBusy}>
                <Icon name="sparkle" />{s.aiBusy ? 'Looking up…' : 'Auto-fill details'}
              </button>
            </div>
          </div>

          {s.aiBusy ? (
            <div className="aipanel" aria-live="polite">
              <div className="aihead"><span className="spin" />Finding vocabulary information…</div>
              <div className="steps">
                {LOOKUP_STEPS.map((label, i) => (
                  <div key={label} className={'step' + (s.aiStep > i ? ' done' : s.aiStep === i ? ' active' : '')}>
                    {s.aiStep > i ? <Icon name="check" size="sm" /> : s.aiStep === i ? <span className="spin" /> : <span className="ring" />}
                    {label}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="sparkle" size="sm" style={{ color: 'var(--primary)' }} />
              Auto-fill is optional — every field below can be filled in or edited by hand.
            </div>
          )}

          <div className="form2">
            <div className="field">
              <label className="label" htmlFor="f-ipa">Pronunciation</label>
              <input id="f-ipa" className="input ipa" style={{ color: 'var(--text)' }} placeholder="/mənˈteɪn/" {...text('ipa')} />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-pos">Part of speech</label>
              <select id="f-pos" className="input" {...text('pos')}>
                {POS_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="field span2">
              <label className="label" htmlFor="f-meaning">Meaning</label>
              <textarea id="f-meaning" className="input" placeholder="To keep something in good condition…" {...text('meaning')} />
            </div>
            <div className="field span2">
              <label className="label" htmlFor="f-vi">Vietnamese translation</label>
              <textarea id="f-vi" className="input" style={{ minHeight: 60 }} placeholder="duy trì, bảo trì" {...text('vi')} />
            </div>
            <div className="field span2">
              <label className="label" htmlFor="f-ex">Example sentence</label>
              <textarea id="f-ex" className="input" placeholder="We need to maintain the system regularly." {...text('ex')} />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-syn">Synonyms</label>
              <ChipInput id="f-syn" field="syn" />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-ant">Antonyms</label>
              <ChipInput id="f-ant" field="ant" />
            </div>
            <div className="field">
              <span className="label">Level</span>
              <div className="chips levelchips">
                {LEVELS.map((l) => (
                  <button key={l} className={'chip' + (f.level === l ? ' on' : '')} onClick={() => a.setF({ level: l })} aria-pressed={f.level === l}>{l}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="label">Category</span>
              <Dropdown id="formcat" full icon={formCat ? formCat.icon : 'folder'} label={formCat ? formCat.name : 'No category'} value={f.cat}
                items={[{ value: '', label: 'No category', icon: 'x' }, ...s.cats.map((c) => ({ value: c.id, label: c.name, icon: c.icon }))]}
                onPick={(v) => a.setF({ cat: v })}
                footer={<>
                  <div className="msep" />
                  <button className="mitem" style={{ color: 'var(--primary-ink)' }} onClick={a.openNewCat}><Icon name="plus" size="sm" />New category</button>
                </>} />
            </div>
            <div className="field span2">
              <span className="label">Tags</span>
              <div className="chips">
                {s.tags.map((t) => {
                  const on = f.tags.includes(t);
                  return (
                    <button key={t} className={'chip soft' + (on ? ' on' : '')} aria-pressed={on}
                      onClick={() => a.setF({ tags: on ? f.tags.filter((x) => x !== t) : [...f.tags, t] })}>#{t}</button>
                  );
                })}
                <button className="chip" style={{ borderStyle: 'dashed' }} onClick={a.openNewTag}><Icon name="plus" size="sm" />New tag</button>
              </div>
            </div>
            <div className="field span2">
              <label className="label" htmlFor="f-notes">Personal notes</label>
              <textarea id="f-notes" className="input" placeholder="Why do I want to remember this word?" {...text('notes')} />
            </div>
          </div>
        </div>
        <div className="formfoot">
          <button className="btn btn-secondary" onClick={a.formCancel}>Cancel</button>
          <div className="actions">
            <span className="hint kbdhint"><span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> to save</span>
            {libMatch && !mineMatch
              ? <button className="btn btn-primary" onClick={useLibraryWord} disabled={usingLib}><Icon name="plus" size="sm" />Save from library</button>
              : <button className="btn btn-primary" onClick={a.save} disabled={s.saving}><Icon name="check" size="sm" />{isEdit ? 'Save Changes' : 'Save Vocabulary'}</button>}
          </div>
        </div>
      </div>
    </>
  );
}
