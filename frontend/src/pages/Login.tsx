import { useState } from 'react';
import { User } from '../api';

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (body: Record<string, any>) => Promise<void>;
}

const DEMO = [
  { label: 'Institution applicant', email: 'applicant@apexedu.ac.in' },
  { label: 'AICTE scrutiny officer', email: 'official@aicte-india.org' },
  { label: 'System administrator', email: 'admin@aicte-india.org' },
];

export default function Login({ onLogin, onRegister }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [f, setF] = useState({ email: '', password: '', full_name: '', institution_id: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'login') await onLogin(f.email, f.password);
      else {
        await onRegister({
          email: f.email, password: f.password, full_name: f.full_name, role: 'applicant',
          institution_id: f.institution_id ? parseInt(f.institution_id, 10) : null,
        });
        setMode('login');
      }
    } catch (x: any) { setErr(x.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1>AICTE TRACE</h1>
        <p className="sub">Application validation and document verification</p>
        {err && <div className="notice bad">{err}</div>}

        {mode === 'register' && (
          <div className="field">
            <label className="f" htmlFor="fn">Full name</label>
            <input id="fn" type="text" required value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} />
          </div>
        )}
        <div className="field">
          <label className="f" htmlFor="em">Email</label>
          <input id="em" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
        </div>
        <div className="field">
          <label className="f" htmlFor="pw">Password</label>
          <input id="pw" type="password" required minLength={6} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
        </div>
        {mode === 'register' && (
          <div className="field">
            <label className="f" htmlFor="ii">Institution ID (optional)</label>
            <input id="ii" type="number" value={f.institution_id} onChange={e => setF({ ...f, institution_id: e.target.value })} />
            <div className="hint">Link the account to an existing registered institution.</div>
          </div>
        )}
        <button className="btn primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create applicant account'}
        </button>
        <p className="small" style={{ marginTop: 12, textAlign: 'center' }}>
          {mode === 'login' ? 'Applicant without an account? ' : 'Already registered? '}
          <a href="#" onClick={e => { e.preventDefault(); setErr(''); setMode(mode === 'login' ? 'register' : 'login'); }}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </a>
        </p>

        {mode === 'login' && (
          <div className="demo">
            <b>Prototype accounts</b> <span className="muted">(password: password123)</span>
            {DEMO.map(d => (
              <button type="button" key={d.email} onClick={() => setF({ ...f, email: d.email, password: 'password123' })}>
                {d.label} <span className="muted">· {d.email}</span>
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}

export type { User };
