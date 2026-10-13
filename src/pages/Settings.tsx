import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { api, type NoteType } from '../lib/api';
import type { Accent, Settings as SettingsData, Theme } from '../lib/data';
import { APP_STYLES, STYLE_UNLOCKS, isUnlocked, seasonalOn, setSeasonalOn, styleClass, unlockStreak, type AppStyle } from '../lib/appStyle';
import { canSpeak, speak, useEnglishVoices } from '../lib/speech';
import { useWB, type SettingsTab } from '../state/WordbookContext';
import { Icon, PageHead } from '../components/ui';
import type { IconName } from '../lib/icons';
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
    <form className="stack" style={{ gap: 16 }} onSubmit={submit} noValidate aria-label="Change password">
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
    <div>
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

/** Style cards: a radio group (roving tabindex, arrow keys move and select). Each preview uses that style's own tokens. */
function StylePicker() {
  const { s, a } = useWB();
  const cur = s.settings.style || 'classic';
  const sysDark = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const dark = s.settings.theme === 'dark' || (s.settings.theme === 'system' && sysDark);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const best = unlockStreak(s.progress);
  const lockMsg = (id: AppStyle) => 'Keep a ' + STYLE_UNLOCKS[id] + '-day review streak to unlock ' + (APP_STYLES.find((x) => x.id === id)?.name ?? 'this style') + '.';
  /** Locked styles only explain themselves: no request is sent. */
  const pick = (id: AppStyle) => {
    if (!isUnlocked(id, best)) { a.showToast(lockMsg(id), 'bad'); return; }
    void a.setStyle(id);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + APP_STYLES.length) % APP_STYLES.length;
    refs.current[n]?.focus();
    if (isUnlocked(APP_STYLES[n].id, best)) void a.setStyle(APP_STYLES[n].id);
  };
  return (
    <div className="stylegrid" role="radiogroup" aria-labelledby="style-lbl">
      {APP_STYLES.map((x, i) => {
        const on = cur === x.id;
        const need = STYLE_UNLOCKS[x.id];
        const locked = !isUnlocked(x.id, best);
        const prevCls = 'app' + (x.id === 'classic' ? ' accent-' + (s.settings.accent || 'indigo') : styleClass(x.id)) + (dark ? ' dark' : '');
        return (
          <button key={x.id} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            className={'stylecard' + (on ? ' on' : '') + (locked ? ' locked' : '')} onClick={() => pick(x.id)} onKeyDown={(e) => onKey(e, i)}
            aria-describedby={'sd-' + x.id + (locked ? ' sl-' + x.id : '')} aria-disabled={locked || undefined}>
            <span className="scprev" aria-hidden="true">
              <span className={prevCls}>
                <span className="sp-bar"><span className="sp-dot" /><span className="sp-line" /></span>
                <span className="sp-body">
                  <span className="sp-card">
                    <span className="sp-title">Aa Word</span>
                    <span className="sp-text">An example card</span>
                    <span className="sp-btn">Review</span>
                  </span>
                </span>
              </span>
            </span>
            <span className="sc-name">{x.name}</span>
            <span className="sc-desc" id={'sd-' + x.id}>{x.desc}</span>
            {locked && need && (
              <span className="stack" style={{ gap: 4 }} id={'sl-' + x.id}>
                <span className="sc-prog">Unlocks at a {need}-day streak · {Math.min(best, need)} / {need} days</span>
                <span className="sc-bar" aria-hidden="true"><span style={{ width: Math.round((Math.min(best, need) / need) * 100) + '%' }} /></span>
              </span>
            )}
            {locked && <span className="sc-lock" aria-hidden="true"><Icon name="lock" size="sm" /></span>}
            {on && <span className="sc-check" aria-hidden="true"><Icon name="check" size="sm" /></span>}
          </button>
        );
      })}
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
    <div>
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


const SECTIONS: { id: SettingsTab; label: string; icon: IconName; sub: string }[] = [
  { id: 'account', label: 'Account', icon: 'users', sub: 'Your profile, password and sign-in.' },
  { id: 'appearance', label: 'Appearance', icon: 'sparkle', sub: 'Style, theme, accent color and decorations.' },
  { id: 'learning', label: 'Learning', icon: 'cap', sub: 'How review sessions and flashcards work.' },
  { id: 'voice', label: 'Voice', icon: 'volume', sub: 'The voice used to read words and sentences.' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', sub: 'Choose what shows up under the bell.' },
  { id: 'data', label: 'Data & privacy', icon: 'download', sub: 'Export your words or remove your data.' }
];

/** A titled settings card; `hid` overrides the heading id (used as a label elsewhere). */
function Card({ title, desc, danger, hid, children }: { title: string; desc?: string; danger?: boolean; hid?: string; children: ReactNode }) {
  const id = hid ?? 'sc-' + title.toLowerCase().replace(/[^a-z]+/g, '-');
  return (
    <section className={'card pad setcard' + (danger ? ' danger' : '')} aria-labelledby={id}>
      <h3 className="h2" id={id}>{title}</h3>
      {desc && <p className="muted sm setcard-desc">{desc}</p>}
      {children}
    </section>
  );
}

export function Settings() {
  const { s, a } = useWB();
  const st = s.settings;
  const style = st.style || 'classic';
  const [seasonal, setSeasonal] = useState(seasonalOn);
  const initial = (st.name || '?').trim().charAt(0).toUpperCase() || '?';
  const tab: SettingsTab = SECTIONS.some((x) => x.id === s.settingsTab) ? s.settingsTab : 'account';
  const cur = SECTIONS.find((x) => x.id === tab)!;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const open = (id: SettingsTab) => a.set({ settingsTab: id });
  // Keep the active tab visible in the scrolling phone tab row.
  useEffect(() => { tabRefs.current[SECTIONS.findIndex((x) => x.id === tab)]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [tab]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? (i + 1) % SECTIONS.length
      : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? (i - 1 + SECTIONS.length) % SECTIONS.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? SECTIONS.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault();
    tabRefs.current[n]?.focus();
    open(SECTIONS[n].id);
  };

  let body: ReactNode;
  if (tab === 'account') body = (
    <>
      <Card title="Profile" desc="Your name is shown across the app.">
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="avatar lg" aria-hidden="true">{initial}</span>
          <div className="form2" style={{ flexGrow: 1, minWidth: 240 }}>
            <div className="field"><label className="label" htmlFor="s-name">Name</label><input id="s-name" className="input" value={st.name} onChange={(e) => a.setSettings({ name: e.target.value })} /></div>
            <div className="field"><label className="label" htmlFor="s-mail">Email</label><input id="s-mail" className="input" type="email" value={st.email} readOnly aria-describedby="s-mail-hint" style={{ color: 'var(--muted)' }} /><span id="s-mail-hint" className="hint">Used to log in; can’t be changed.</span></div>
          </div>
        </div>
      </Card>
      <Card title="Password" desc="Change the password you log in with."><ChangePassword /></Card>
      <Card title="Sign out">
        <div className="setrow">
          <div className="setlbl"><b>Log out</b><span className="muted sm">Signed in as {st.email}</span></div>
          <button className="btn btn-secondary" onClick={() => a.logout()}><Icon name="logout" size="sm" />Log Out</button>
        </div>
      </Card>
    </>
  );
  else if (tab === 'appearance') body = (
    <>
      <Card title="Style" hid="style-lbl" desc="The look of the whole app. Bonus styles unlock with your review streak.">
        <StylePicker />
      </Card>
      <Card title="Theme" desc="Light, dark, or follow your device.">
        <div className="radios" role="radiogroup" aria-label="Theme">
          {THEMES.map(([v, label]) => (
            <label key={v} className={'radio' + (st.theme === v ? ' on' : '')}>
              <input type="radio" name="theme" checked={st.theme === v} onChange={() => a.setSettings({ theme: v })} />
              {label}
            </label>
          ))}
        </div>
      </Card>
      <Card title="Accent color" desc="The highlight color of the Classic style.">
        {style !== 'classic' ? (
          <p className="setnote">The {APP_STYLES.find((x) => x.id === style)?.name} style has its own colors. Switch to Classic to pick an accent.</p>
        ) : (
          <div className="swatches" role="radiogroup" aria-label="Accent color">
            {ACCENTS.map(([v, label, hex]) => (
              <button key={v} type="button" role="radio" aria-checked={st.accent === v} className={'swatch' + (st.accent === v ? ' on' : '')} onClick={() => a.setSettings({ accent: v })}>
                <span className="dotc" style={{ background: hex }}>{st.accent === v && <Icon name="check" size="sm" />}</span>
                {label}
              </button>
            ))}
          </div>
        )}
      </Card>
      <Card title="Decorations">
        <div className="setrow">
          <div className="setlbl"><b>Seasonal decorations</b><span className="muted sm">Tết, Mid-Autumn and Christmas banner pictures on the dashboard (this device)</span></div>
          <Switch on={seasonal} label="Seasonal decorations" onToggle={() => { setSeasonalOn(!seasonal); setSeasonal(!seasonal); }} />
        </div>
      </Card>
    </>
  );
  else if (tab === 'learning') body = (
    <Card title="Review & flashcards" desc="These apply to every review session.">
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
    </Card>
  );
  else if (tab === 'voice') body = <Card title="Pronunciation voice" desc="Voices come from this device and browser."><VoiceSettings /></Card>;
  else if (tab === 'notifications') body = <Card title="In-app notifications" desc="Turning one off stops new ones; existing ones stay."><NotificationSettings /></Card>;
  else body = (
    <>
      <Card title="Your data">
        <div className="setrow">
          <div className="setlbl"><b>Export vocabulary</b><span className="muted sm">Download all {s.words.length} words as a JSON file</span></div>
          <button className="btn btn-secondary" onClick={a.exportData}><Icon name="download" size="sm" />Export Vocabulary</button>
        </div>
      </Card>
      <Card title="Danger zone" desc="These actions can’t be undone." danger>
        <div className="setrow">
          <div className="setlbl"><b>Delete all data</b><span className="muted sm">Remove every word, category and tag but keep your account</span></div>
          <button className="btn btn-danger-soft" onClick={() => a.set({ modal: { kind: 'delAll', title: 'Delete all data?' } })}><Icon name="trash" size="sm" />Delete All Data</button>
        </div>
        <div className="setrow">
          <div className="setlbl"><b>Delete account</b><span className="muted sm">Permanently remove your account and all of your words</span></div>
          <button className="btn btn-danger-soft" onClick={() => a.set({ modal: { kind: 'delAccount', title: 'Delete your account?' } })}><Icon name="trash" size="sm" />Delete Account</button>
        </div>
      </Card>
    </>
  );

  return (
    <>
      <PageHead title="Settings" sub="Manage your profile and how you learn." />
      <div className="setlayout">
        <nav className="setnav" aria-label="Settings sections">
          <div role="tablist" aria-orientation="vertical" className="setnav-list">
            {SECTIONS.map((x, i) => {
              const on = x.id === tab;
              return (
                <button key={x.id} ref={(el) => { tabRefs.current[i] = el; }} type="button" role="tab" id={'stab-' + x.id} aria-selected={on} aria-current={on ? 'page' : undefined}
                  aria-controls="set-panel" tabIndex={on ? 0 : -1} className={'setnav-item' + (on ? ' on' : '')} onClick={() => open(x.id)} onKeyDown={(e) => onKey(e, i)}>
                  <Icon name={x.icon} size="sm" />{x.label}
                </button>
              );
            })}
          </div>
        </nav>
        <div className="setpanel" role="tabpanel" id="set-panel" aria-labelledby={'stab-' + tab}>
          <header className="setpanel-head">
            <h2 className="h2">{cur.label}</h2>
            <p className="muted sm">{cur.sub}</p>
          </header>
          {body}
        </div>
      </div>
    </>
  );
}
