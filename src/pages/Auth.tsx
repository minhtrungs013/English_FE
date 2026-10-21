import { useState, type FormEvent } from 'react';
import { useWB } from '../state/WordbookContext';
import { Icon } from '../components/ui';
import { api } from '../lib/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PasswordInput(props: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pwwrap">
      <input id={props.id} className={'input' + (props.invalid ? ' err' : '')} type={show ? 'text' : 'password'} value={props.value}
        onChange={(e) => props.onChange(e.target.value)} autoComplete={props.autoComplete} placeholder={props.placeholder} />
      <button type="button" className="iconbtn sm" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
        <Icon name={show ? 'eyeOff' : 'eye'} size="sm" />
      </button>
    </div>
  );
}

/** Login, sign-up (with an emailed code) and password reset, shown whenever nobody is signed in. */
type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

const TITLES: Record<Mode, [string, string]> = {
  login: ['Welcome back', 'Log in to keep learning your words.'],
  register: ['Create your account', 'Start building your personal vocabulary collection.'],
  verify: ['Check your email', ''],
  forgot: ['Forgot your password?', 'Enter your email and we’ll send you a 6-digit code.'],
  reset: ['Set a new password', '']
};

const LABELS: Record<Mode, [string, string]> = {
  login: ['Log in', 'Logging in…'],
  register: ['Create account', 'Sending code…'],
  verify: ['Verify email', 'Checking…'],
  forgot: ['Send code', 'Sending…'],
  reset: ['Save new password', 'Saving…']
};

export function AuthPage() {
  const { a } = useWB();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const isReg = mode === 'register';
  const newPw = mode === 'register' || mode === 'reset';
  const codeSent = mode === 'verify' || mode === 'reset';

  const go = (m: Mode) => { setMode(m); setErr(''); setNote(''); setPassword(''); setConfirm(''); setCode(''); };

  const validate = (): string => {
    if (isReg && !name.trim()) return 'Please enter your name.';
    if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.';
    if (codeSent && !/^\d{6}$/.test(code.trim())) return 'Please enter the 6-digit code from the email.';
    if (mode === 'verify' || mode === 'forgot') return '';
    if (!password) return 'Please enter your password.';
    if (newPw && password.length < 8) return 'Password must be at least 8 characters.';
    if (newPw && password !== confirm) return 'Passwords don’t match.';
    return '';
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Something went wrong.'); }
    setBusy(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(''); setNote('');
    const em = email.trim();
    await run(async () => {
      if (mode === 'login') await a.login(em, password);
      else if (mode === 'register') { await a.register(name.trim(), em, password); go('verify'); }
      else if (mode === 'verify') await a.verifyRegister(em, code.trim());
      else if (mode === 'forgot') { await api.forgotPassword(em); go('reset'); }
      else await a.resetPassword(em, code.trim(), password);
    });
  };

  const resend = () => run(async () => {
    setErr('');
    if (mode === 'verify') await api.registerResend(email.trim());
    else await api.forgotPassword(email.trim());
    setNote('We sent a new code.');
  });

  const [title, sub] = TITLES[mode];
  const linkStyle = { fontSize: 14 };

  return (
    <main className="auth">
      <div className="card authcard">
        <div className="brand">
          <span className="logo"><Icon name="book" /></span>
          <span className="brandname">Wordbook</span>
        </div>
        <div>
          <h1>{title}</h1>
          <p className="sub">{codeSent ? <>We sent a 6-digit code to <b>{email.trim()}</b>. It works for 10 minutes; check your spam folder too.</> : sub}</p>
        </div>
        <form onSubmit={submit} noValidate>
          {err && <div className="formerr" role="alert"><Icon name="alert" size="sm" />{err}</div>}
          {note && !err && <p className="sub" role="status">{note}</p>}
          {isReg && (
            <div className="field">
              <label className="label" htmlFor="a-name">Name</label>
              <input id="a-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Trung" autoFocus />
            </div>
          )}
          {!codeSent && (
            <div className="field">
              <label className="label" htmlFor="a-email">Email</label>
              <input id="a-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" autoFocus={!isReg} />
            </div>
          )}
          {codeSent && (
            <div className="field">
              <label className="label" htmlFor="a-code">Code</label>
              <input id="a-code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} autoFocus placeholder="123456"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ letterSpacing: 6, fontSize: 20, fontWeight: 700 }} />
            </div>
          )}
          {mode !== 'verify' && mode !== 'forgot' && (
            <div className="field">
              <label className="label" htmlFor="a-pw">{mode === 'reset' ? 'New password' : 'Password'}</label>
              <PasswordInput id="a-pw" value={password} onChange={setPassword} autoComplete={newPw ? 'new-password' : 'current-password'} placeholder={newPw ? 'At least 8 characters' : ''} />
              {mode === 'login' && <button type="button" className="linkbtn" style={{ fontSize: 13.5, alignSelf: 'flex-end' }} onClick={() => go('forgot')}>Forgot password?</button>}
            </div>
          )}
          {newPw && (
            <div className="field">
              <label className="label" htmlFor="a-pw2">Confirm password</label>
              <PasswordInput id="a-pw2" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? <span className="spin" /> : null}
            {LABELS[mode][busy ? 1 : 0]}
          </button>
        </form>
        <p className="authalt">
          {codeSent ? (
            <>No email? <button type="button" className="linkbtn" style={linkStyle} onClick={resend} disabled={busy}>Send a new code</button>
              {' · '}<button type="button" className="linkbtn" style={linkStyle} onClick={() => go(mode === 'verify' ? 'register' : 'forgot')}>Change email</button></>
          ) : mode === 'forgot' ? (
            <button type="button" className="linkbtn" style={linkStyle} onClick={() => go('login')}>Back to log in</button>
          ) : (
            <>{isReg ? 'Already have an account? ' : 'New to Wordbook? '}
              <button type="button" className="linkbtn" style={linkStyle} onClick={() => go(isReg ? 'login' : 'register')}>{isReg ? 'Log in' : 'Create an account'}</button></>
          )}
        </p>
      </div>
    </main>
  );
}
