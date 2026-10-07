import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type NoteType } from '../lib/api';
import type { Accent, Settings as SettingsData, Theme } from '../lib/data';
import { canSpeak, speak, useEnglishVoices } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { Icon, PageHead } from '../components/ui';
import { NOTE_GROUPS, NOTE_META } from '../components/Notifications';
import { PasswordInput } from './Auth';

const THEMES: [Theme, string][] = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']];

function ChangePassword() {
  const { a } = useWB();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cur) { setErr('Please enter your current password.'); return; }
    if (next.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    setErr('');
    setBusy(true);
    try {
      await api.changePassword(cur, next);
      setCur(''); setNext('');
      a.showToast('Password changed.');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card pad stack" style={{ gap: 16 }} onSubmit={submit} noValidate>
      <h2 className="h2">Password</h2>
      {err && <div className="formerr" role="alert"><Icon name="alert" size="sm" />{err}</div>}
      <div className="form2">
        <div className="field"><label className="label" htmlFor="s-cur">Current password</label><PasswordInput id="s-cur" value={cur} onChange={setCur} autoComplete="current-password" /></div>
        <div className="field"><label className="label" htmlFor="s-new">New password</label><PasswordInput id="s-new" value={next} onChange={setNext} autoComplete="new-password" placeholder="At least 8 characters" /></div>
      </div>
      <button type="submit" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  );
}

const ACCENTS: [Accent, string, string][] = [
  ['indigo', 'Indigo', '#5847D6'], ['blue', 'Blue', '#2563EB'], ['teal', 'Teal', '#0E7490'],
  ['green', 'Green', '#15803D'], ['orange', 'Orange', '#C2410C'], ['rose', 'Rose', '#BE185D']
];
const SAMPLE = 'Could you clarify the requirements before the deadline?';

function VoiceSettings() {
  const { s, a } = useWB();
  const st = s.settings;
  const voices = useEnglishVoices();
  const supported = canSpeak();
  const missing = !!st.voice && voices.length > 0 && !voices.some((v) => v.voiceURI === st.voice);
  return (
    <div className="card pad">
      <h2 className="h2" style={{ marginBottom: 6 }}>Pronunciation voice</h2>
      {!supported ? (
        <p className="muted sm" style={{ margin: '10px 0 0' }}>This browser can’t play speech, so voice settings aren’t available here.</p>
      ) : (
        <>
          <div className="setrow">
            <div className="setlbl"><b>Voice</b><span className="muted sm">{voices.length ? voices.length + ' English voices on this device' : 'Loading voices…'}</span></div>
            <select className="input" value={missing ? '' : st.voice} onChange={(e) => a.setSettings({ voice: e.target.value })} aria-label="Voice">
              <option value="">Default English voice</option>
              {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
            </select>
          </div>
          {missing && <p className="hint" style={{ margin: '0 0 8px' }}>Your saved voice isn’t installed on this device, so the default voice is used.</p>}
          <div className="setrow">
            <div className="setlbl"><b>Speed</b><span className="muted sm">How fast words and sentences are read</span></div>
            <div className="rangerow">
              <input type="range" min={0.5} max={1.5} step={0.05} value={st.rate} onChange={(e) => a.setSettings({ rate: Number(e.target.value) })} aria-label="Speech speed" />
              <span className="rangeval">{st.rate.toFixed(2)}×</span>
            </div>
          </div>
          <div className="setrow">
            <div className="setlbl"><b>Pitch</b><span className="muted sm">Lower or higher voice</span></div>
            <div className="rangerow">
              <input type="range" min={0.5} max={1.5} step={0.05} value={st.pitch} onChange={(e) => a.setSettings({ pitch: Number(e.target.value) })} aria-label="Speech pitch" />
              <span className="rangeval">{st.pitch.toFixed(2)}</span>
            </div>
          </div>
          <div className="setrow">
            <div className="setlbl"><b>Try it</b><span className="muted sm">“{SAMPLE}”</span></div>
            <div className="actions">
              <button className="btn btn-ghost btn-sm" onClick={() => a.setSettings({ voice: '', rate: 0.9, pitch: 1 })}>Reset</button>
              <button className="btn btn-secondary" onClick={() => speak(SAMPLE, 1, { voice: st.voice, rate: st.rate, pitch: st.pitch })}><Icon name="volume" size="sm" />Play sample</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return <button className={'switch' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={onToggle} />;
}

/** A switch per notification type; turned-off types are saved in `mute`. */
function NotificationSettings() {
  const { s, a } = useWB();
  const mute = s.settings.mute;
  // Toggles build on the latest list, so quick clicks before a re-render aren't lost.
  const latest = useRef(mute);
  useEffect(() => { latest.current = mute; }, [mute]);
  const toggle = (t: NoteType) => {
    const m = latest.current;
    latest.current = m.includes(t) ? m.filter((x) => x !== t) : [...m, t];
    a.setSettings({ mute: latest.current });
  };
  return (
    <div className="card pad">
      <h2 className="h2" style={{ marginBottom: 6 }}>Notifications</h2>
      <p className="muted sm" style={{ margin: 0 }}>Choose what shows up under the bell. Turning one off stops new ones; existing ones stay.</p>
      {NOTE_GROUPS.map((g) => (
        <section key={g.title} className="nset" aria-labelledby={'nset-' + g.types[0]}>
          <h3 id={'nset-' + g.types[0]} className="nset-h">{g.title}</h3>
          {g.types.map((t) => (
            <div key={t} className="setrow">
              <div className="setlbl"><b>{NOTE_META[t].label}</b><span className="muted sm">{NOTE_META[t].desc}</span></div>
              <Switch on={!mute.includes(t)} label={NOTE_META[t].label} onToggle={() => toggle(t)} />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function Settings() {
  const { s, a } = useWB();
  const st = s.settings;
  const initial = (st.name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <>
      <PageHead title="Settings" sub="Manage your profile and how you learn." />
      <div className="setgrid">
        <div className="card pad">
          <h2 className="h2" style={{ marginBottom: 18 }}>Profile</h2>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="avatar lg">{initial}</span>
            <div className="form2" style={{ flexGrow: 1, minWidth: 240 }}>
              <div className="field"><label className="label" htmlFor="s-name">Name</label><input id="s-name" className="input" value={st.name} onChange={(e) => a.setSettings({ name: e.target.value })} /></div>
              <div className="field"><label className="label" htmlFor="s-mail">Email</label><input id="s-mail" className="input" type="email" value={st.email} readOnly aria-describedby="s-mail-hint" style={{ color: 'var(--muted)' }} /><span id="s-mail-hint" className="hint">Used to log in; can’t be changed.</span></div>
            </div>
          </div>
        </div>

        <div className="card pad">
          <h2 className="h2" style={{ marginBottom: 6 }}>Learning preferences</h2>
          <div className="setrow">
            <div className="setlbl"><b>Daily review goal</b><span className="muted sm">The most words one review session will show</span></div>
            <select className="input" value={st.goal} onChange={(e) => a.setSettings({ goal: e.target.value })} aria-label="Daily review goal">
              {['10', '20', '30', '50'].map((g) => <option key={g} value={g}>{g} words</option>)}
            </select>
          </div>
          <div className="setrow">
            <div className="setlbl"><b>Default review direction</b><span className="muted sm">What appears on the front of a flashcard</span></div>
            <select className="input" value={st.dir} onChange={(e) => a.setSettings({ dir: e.target.value as SettingsData['dir'] })} aria-label="Default review direction">
              <option value="en-vi">English → Vietnamese</option>
              <option value="vi-en">Vietnamese → English</option>
            </select>
          </div>
          <div className="setrow">
            <div className="setlbl"><b>Auto-play pronunciation</b><span className="muted sm">Speak each word when a flashcard appears</span></div>
            <Switch on={st.autoplay} label="Auto-play pronunciation" onToggle={() => a.setSettings({ autoplay: !st.autoplay })} />
          </div>
          <div className="setrow">
            <div className="setlbl"><b>Show example sentence</b><span className="muted sm">Include the example on the back of each card</span></div>
            <Switch on={st.showEx} label="Show example sentence" onToggle={() => a.setSettings({ showEx: !st.showEx })} />
          </div>
        </div>

        <div className="card pad">
          <h2 className="h2" style={{ marginBottom: 16 }}>Appearance</h2>
          <span className="label" style={{ display: 'block', marginBottom: 10 }}>Theme</span>
          <div className="radios" role="radiogroup" aria-label="Theme">
            {THEMES.map(([v, label]) => (
              <label key={v} className={'radio' + (st.theme === v ? ' on' : '')}>
                <input type="radio" name="theme" checked={st.theme === v} onChange={() => a.setSettings({ theme: v })} />
                {label}
              </label>
            ))}
          </div>
          <span className="label" style={{ display: 'block', margin: '22px 0 10px' }}>Accent color</span>
          <div className="swatches" role="radiogroup" aria-label="Accent color">
            {ACCENTS.map(([v, label, hex]) => (
              <button key={v} type="button" role="radio" aria-checked={st.accent === v} className={'swatch' + (st.accent === v ? ' on' : '')} onClick={() => a.setSettings({ accent: v })}>
                <span className="dotc" style={{ background: hex }}>{st.accent === v && <Icon name="check" size="sm" />}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        <VoiceSettings />

        <NotificationSettings />

        <div className="card pad">
          <h2 className="h2" style={{ marginBottom: 6 }}>Data</h2>
          <div className="setrow">
            <div className="setlbl"><b>Export vocabulary</b><span className="muted sm">Download all {s.words.length} words as a JSON file</span></div>
            <button className="btn btn-secondary" onClick={a.exportData}><Icon name="download" size="sm" />Export Vocabulary</button>
          </div>
          <div className="setrow">
            <div className="setlbl"><b>Delete all data</b><span className="muted sm">Remove every word, category and tag but keep your account</span></div>
            <button className="btn btn-danger-soft" onClick={() => a.set({ modal: { kind: 'delAll', title: 'Delete all data?' } })}><Icon name="trash" size="sm" />Delete All Data</button>
          </div>
        </div>

        <ChangePassword />

        <div className="card pad">
          <h2 className="h2" style={{ marginBottom: 6 }}>Account</h2>
          <div className="setrow">
            <div className="setlbl"><b>Log out</b><span className="muted sm">Signed in as {st.email}</span></div>
            <button className="btn btn-secondary" onClick={() => a.logout()}><Icon name="logout" size="sm" />Log Out</button>
          </div>
          <div className="setrow">
            <div className="setlbl"><b>Delete account</b><span className="muted sm">Permanently remove your account and all of your words</span></div>
            <button className="btn btn-danger-soft" onClick={() => a.set({ modal: { kind: 'delAccount', title: 'Delete your account?' } })}><Icon name="trash" size="sm" />Delete Account</button>
          </div>
        </div>
      </div>
    </>
  );
}
