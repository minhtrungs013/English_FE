import { useState, type FormEvent } from 'react';
import { useWB } from '../state/WordbookContext';
import { Icon } from '../components/ui';

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

/** Login and sign-up screen, shown whenever nobody is signed in. */
export function AuthPage() {
  const { a } = useWB();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const isReg = mode === 'register';

  const switchMode = () => { setMode(isReg ? 'login' : 'register'); setErr(''); setPassword(''); setConfirm(''); };

  const validate = (): string => {
    if (isReg && !name.trim()) return 'Please enter your name.';
    if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.';
    if (!password) return 'Please enter your password.';
    if (isReg && password.length < 8) return 'Password must be at least 8 characters.';
    if (isReg && password !== confirm) return 'Passwords don’t match.';
    return '';
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = validate();
    if (v) { setErr(v); return; }
    setErr('');
    setBusy(true);
    try {
      if (isReg) await a.register(name.trim(), email.trim(), password);
      else await a.login(email.trim(), password);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="card authcard">
        <div className="brand">
          <span className="logo"><Icon name="book" /></span>
          <span className="brandname">Wordbook</span>
        </div>
        <div>
          <h1>{isReg ? 'Create your account' : 'Welcome back'}</h1>
          <p className="sub">{isReg ? 'Start building your personal vocabulary collection.' : 'Log in to keep learning your words.'}</p>
        </div>
        <form onSubmit={submit} noValidate>
          {err && <div className="formerr" role="alert"><Icon name="alert" size="sm" />{err}</div>}
          {isReg && (
            <div className="field">
              <label className="label" htmlFor="a-name">Name</label>
              <input id="a-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Trung" autoFocus />
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="a-email">Email</label>
            <input id="a-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" autoFocus={!isReg} />
          </div>
          <div className="field">
            <label className="label" htmlFor="a-pw">Password</label>
            <PasswordInput id="a-pw" value={password} onChange={setPassword} autoComplete={isReg ? 'new-password' : 'current-password'} placeholder={isReg ? 'At least 8 characters' : ''} />
          </div>
          {isReg && (
            <div className="field">
              <label className="label" htmlFor="a-pw2">Confirm password</label>
              <PasswordInput id="a-pw2" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? <span className="spin" /> : null}
            {isReg ? (busy ? 'Creating account…' : 'Create account') : (busy ? 'Logging in…' : 'Log in')}
          </button>
        </form>
        <p className="authalt">
          {isReg ? 'Already have an account? ' : 'New to Wordbook? '}
          <button type="button" className="linkbtn" style={{ fontSize: 14 }} onClick={switchMode}>{isReg ? 'Log in' : 'Create an account'}</button>
        </p>
      </div>
    </main>
  );
}
