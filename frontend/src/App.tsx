import { useEffect, useState } from 'react';
import { api, User } from './api';
import { AppCtx, Page, Spinner } from './ui';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Dossiers from './pages/Dossiers';
import NewApplication from './pages/NewApplication';
import Intake from './pages/Intake';
import Rectify from './pages/Rectify';
import Intelligence from './pages/Intelligence';
import Audit from './pages/Audit';

const NAV: { section: string; items: { id: Page; label: string; roles?: string[] }[] }[] = [
  {
    section: 'Scrutiny',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'dossiers', label: 'Application dossiers' },
      { id: 'new', label: 'New application' },
    ],
  },
  {
    section: 'Verification',
    items: [
      { id: 'intake', label: 'Document & media intake' },
      { id: 'rectify', label: 'Rectification' },
    ],
  },
  {
    section: 'Bureau tools',
    items: [
      { id: 'intel', label: 'AI & models', roles: ['reviewer', 'official', 'admin'] },
      { id: 'audit', label: 'Audit log', roles: ['reviewer', 'official', 'admin'] },
    ],
  },
];

const TITLES: Record<Page, string> = {
  overview: 'Overview',
  dossiers: 'Application dossiers',
  new: 'New application',
  intake: 'Document & media intake',
  rectify: 'Rectification',
  intel: 'AI & models',
  audit: 'Audit log',
};

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('trace_token') ?? '');
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(Boolean(token));
  const [page, setPage] = useState<Page>('overview');
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);

  const toast = (msg: string, kind: 'info' | 'success' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  };

  useEffect(() => {
    if (!token) { setUser(null); setChecking(false); return; }
    setChecking(true);
    api<User>('/auth/me', token)
      .then(u => setUser(u))
      .catch(() => { localStorage.removeItem('trace_token'); setToken(''); })
      .finally(() => setChecking(false));
  }, [token]);

  async function onLogin(email: string, password: string) {
    const form = new URLSearchParams();
    form.append('username', email);
    form.append('password', password);
    const res = await fetch('/api/auth/login', { method: 'POST', body: form });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.detail || 'Invalid credentials');
    }
    const { access_token } = await res.json();
    localStorage.setItem('trace_token', access_token);
    setToken(access_token);
  }

  async function onRegister(body: Record<string, any>) {
    await api('/auth/register', null, { method: 'POST', body: JSON.stringify(body) });
    toast('Account created. You can sign in now.', 'success');
  }

  function logout() {
    localStorage.removeItem('trace_token');
    setToken(''); setUser(null); setPage('overview'); setSelectedAppId(null);
  }

  function openApp(id: number | null, target: Page = 'dossiers') {
    setSelectedAppId(id);
    setPage(target);
  }

  if (checking) return <div className="auth"><Spinner /></div>;
  if (!user) return <Login onLogin={onLogin} onRegister={onRegister} />;

  return (
    <AppCtx.Provider value={{ user, token, page, go: setPage, selectedAppId, openApp, toast }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            AICTE TRACE
            <small>Regulation Bureau · Decision support</small>
          </div>
          {NAV.map(sec => {
            const visible = sec.items.filter(i => !i.roles || i.roles.includes(user.role));
            if (!visible.length) return null;
            return (
              <div key={sec.section}>
                <div className="nav-section">{sec.section}</div>
                {visible.map(i => (
                  <button
                    key={i.id}
                    className={`nav-btn ${page === i.id ? 'active' : ''}`}
                    onClick={() => setPage(i.id)}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            );
          })}
          <div className="sidebar-foot">
            <div><strong style={{ color: '#fff' }}>{user.full_name}</strong></div>
            <div>{user.email} · {user.role}</div>
            <button className="btn sm" style={{ marginTop: 8, width: '100%' }} onClick={logout}>Sign out</button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <div className="crumbs">
              AICTE Regulation Bureau / <b>{TITLES[page]}</b>
            </div>
            <div className="row">
              <span className="small muted">Advisory system — final decisions rest with AICTE authorities</span>
            </div>
          </header>

          <main className="content">
            {page === 'overview' && <Overview />}
            {page === 'dossiers' && <Dossiers />}
            {page === 'new' && <NewApplication />}
            {page === 'intake' && <Intake />}
            {page === 'rectify' && <Rectify />}
            {page === 'intel' && <Intelligence />}
            {page === 'audit' && <Audit />}
          </main>
        </div>
      </div>

      {toasts.length > 0 && (
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
        </div>
      )}
    </AppCtx.Provider>
  );
}
