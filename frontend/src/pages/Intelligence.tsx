import { useEffect, useState } from 'react';
import { api, Application, label, fmtDate } from '../api';
import { useApp, Card, PageHead, Notice, Badge, Empty, Spinner } from '../ui';

type Tab = 'handbook' | 'models' | 'review' | 'rules';

export default function Intelligence() {
  const [tab, setTab] = useState<Tab>('handbook');
  return (
    <div className="page">
      <PageHead title="AI and models">Search the handbook, inspect the trained models, and run the AI advisory review.</PageHead>
      <div className="tabs" role="tablist">
        {([['handbook', 'Handbook search'], ['models', 'Models'], ['review', 'AI review'], ['rules', 'Checklist rules']] as [Tab, string][]).map(([id, t]) => (
          <button key={id} role="tab" className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{t}</button>
        ))}
      </div>
      {tab === 'handbook' && <Handbook />}
      {tab === 'models' && <Models />}
      {tab === 'review' && <Review />}
      {tab === 'rules' && <Rules />}
    </div>
  );
}

/* ------------------------------------------------------------ handbook */
const EXAMPLES = [
  'Minimum land area for an engineering college',
  'Student faculty ratio and cadre ratio',
  'Fire safety certificate validity',
  'Built-up area per student',
];

function Handbook() {
  const { token, toast } = useApp();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ query: string; clauses: any[] } | null>(null);

  async function search(text = q) {
    if (text.trim().length < 3) return;
    setBusy(true);
    try { setRes(await api('/rag/search', token, { method: 'POST', body: JSON.stringify({ query: text, top_k: 3 }) })); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Card title="Search the Approval Process Handbook" sub="Results are the most relevant indexed clauses, each with its citation">
        <form className="row" onSubmit={e => { e.preventDefault(); search(); }}>
          <input type="search" aria-label="Handbook query" style={{ flex: 1, minWidth: 260 }} value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. What land is required in an urban area?" />
          <button className="btn primary" disabled={busy || q.trim().length < 3}>{busy ? 'Searching…' : 'Search'}</button>
        </form>
        <div className="row small" style={{ marginTop: 8 }}>
          <span className="muted">Try:</span>
          {EXAMPLES.map(e => <a key={e} href="#" onClick={ev => { ev.preventDefault(); setQ(e); search(e); }}>{e}</a>)}
        </div>
      </Card>

      {res && (res.clauses.length === 0 ? <Empty>No matching clauses.</Empty> : (
        <div className="stack">
          {res.clauses.map(c => (
            <Card key={c.id} title={c.metadata?.statutory_citation ?? c.id} actions={<Badge>{c.metadata?.domain}</Badge>}>
              <div className="quote">{c.text}</div>
            </Card>
          ))}
          <p className="small muted">The handbook index currently holds a small set of clauses seeded with the system; it is not the complete handbook.</p>
        </div>
      ))}
    </>
  );
}

/* -------------------------------------------------------------- models */
function Models() {
  const { token, toast } = useApp();
  const [reg, setReg] = useState<any>(null);
  const [text, setText] = useState('');
  const [cls, setCls] = useState<any>(null);
  const [f, setF] = useState({ ela_std_error: 5, font_count: 3, time_delta_hours: 0, has_editing_software: false, text_char_entropy: 4 });
  const [risk, setRisk] = useState<any>(null);

  useEffect(() => { api('/models/metrics', token).then(setReg).catch(() => setReg({ metrics: {}, artifacts: {} })); }, [token]);

  // Re-score whenever an input changes.
  useEffect(() => {
    if (!reg?.artifacts?.forgery_detector) return;
    const t = setTimeout(() => {
      api('/models/predict-forgery', token, { method: 'POST', body: JSON.stringify(f) }).then(setRisk).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [f, reg, token]);

  async function classify() {
    try { setCls(await api('/models/predict-document', token, { method: 'POST', body: JSON.stringify({ text }) })); }
    catch (e: any) { toast(e.message, 'error'); }
  }

  if (!reg) return <Spinner />;
  const m = reg.metrics ?? {};
  const rows: [string, any][] = [['Document classifier', m.document_classifier], ['Tampering detector', m.forgery_detector]];

  const slider = (k: keyof typeof f, l: string, min: number, max: number, step = 1) => (
    <div className="slider-row">
      <label htmlFor={`s-${k}`}>{l}</label>
      <input id={`s-${k}`} type="range" min={min} max={max} step={step} value={Number(f[k])} onChange={e => setF({ ...f, [k]: Number(e.target.value) })} />
      <span className="mono">{Number(f[k])}</span>
    </div>
  );

  return (
    <>
      <Card title="Trained models" sub="Figures are those saved when each model was trained" flush>
        <table>
          <thead><tr><th>Model</th><th>Type</th><th>Trained</th><th>Train / test samples</th><th>Accuracy</th><th>F1</th></tr></thead>
          <tbody>
            {rows.map(([n, x]) => (
              <tr key={n}>
                <td>{n}</td>
                {x ? (
                  <>
                    <td className="small">{x.model_type}</td><td className="small">{fmtDate(x.trained_at)}</td>
                    <td>{x.train_samples} / {x.test_samples}</td><td>{(x.accuracy * 100).toFixed(1)}%</td><td>{x.f1_score.toFixed(2)}</td>
                  </>
                ) : <td colSpan={5} className="muted">Not trained</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Notice tone="warn">
        These models were trained on very small datasets (tens of samples), so the 100% test scores are not evidence of real-world accuracy.
        Treat their output as a weak signal that needs human confirmation, and retrain on a larger labelled set before relying on it.
      </Notice>

      <div className="grid g2">
        <Card title="Try the document classifier" sub="Paste some document text">
          <div className="field"><textarea aria-label="Document text" value={text} onChange={e => setText(e.target.value)} placeholder="Paste text from a certificate…" /></div>
          <button className="btn" disabled={text.trim().length < 3 || !reg.artifacts.document_classifier} onClick={classify}>Classify</button>
          {cls && (
            <p style={{ marginTop: 10 }}>
              {cls.predicted_type ? <>Predicted: <b>{label(cls.predicted_type)}</b> · confidence {(cls.confidence * 100).toFixed(0)}%</> : cls.status}
            </p>
          )}
          {m.document_classifier?.classes && <p className="small muted" style={{ marginTop: 6 }}>Knows only: {m.document_classifier.classes.map(label).join(', ')}.</p>}
        </Card>

        <Card title="Try the tampering detector" sub="Adjust the signals and watch the score change">
          {!reg.artifacts.forgery_detector ? <span className="muted">Model not trained.</span> : (
            <>
              {slider('ela_std_error', 'Compression error (ELA)', 0, 40, 0.5)}
              {slider('font_count', 'Distinct fonts', 1, 15)}
              {slider('time_delta_hours', 'Hours between creation and edit', 0, 3000, 10)}
              {slider('text_char_entropy', 'Text entropy', 0, 8, 0.1)}
              <label className="row" style={{ marginBottom: 12 }}>
                <input type="checkbox" checked={f.has_editing_software} onChange={e => setF({ ...f, has_editing_software: e.target.checked })} />
                Editing software named in metadata
              </label>
              {risk && (
                <>
                  <div className="row between small"><span>Tampering likelihood</span><b>{(risk.tamper_probability * 100).toFixed(0)}%</b></div>
                  <div className="meter"><i className={risk.is_tampered ? 'hot' : ''} style={{ width: `${risk.tamper_probability * 100}%` }} /></div>
                </>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- review */
function Review() {
  const { token, selectedAppId, toast } = useApp();
  const [apps, setApps] = useState<Application[]>([]);
  const [appId, setAppId] = useState(selectedAppId ? String(selectedAppId) : '');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);

  useEffect(() => { api<Application[]>('/applications', token).then(a => { setApps(a); if (!appId && a.length) setAppId(String(a[0].id)); }).catch(() => {}); }, [token]);

  async function run() {
    setBusy(true); setRes(null);
    try { setRes(await api(`/applications/${appId}/agent-review`, token, { method: 'POST' })); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Card title="AI advisory review" sub="Three roles review the application's real findings in turn: forensic auditor, regulatory officer, evidence compiler">
        <div className="row">
          <select aria-label="Application" style={{ width: 'auto', minWidth: 300 }} value={appId} onChange={e => { setAppId(e.target.value); setRes(null); }}>
            {apps.map(a => <option key={a.id} value={a.id}>{a.application_number}</option>)}
          </select>
          <button className="btn primary" disabled={!appId || busy} onClick={run}>{busy ? 'Reviewing… (can take a minute)' : 'Run review'}</button>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          Runs on the local language model only. It reads this application's recorded findings and the handbook clauses retrieved for them, and its output is advisory.
        </p>
      </Card>

      {res && res.available === false && <Notice tone="warn">{res.reason}</Notice>}
      {res && res.available && res.steps.length === 0 && <Notice>{res.reason}</Notice>}
      {res?.steps?.map((s: any, i: number) => (
        <Card key={i} title={`${i + 1}. ${s.role}`} actions={<Badge tone={s.ok ? 'green' : 'red'}>{s.ok ? 'Completed' : 'Failed'}</Badge>}>
          {s.ok ? <div style={{ whiteSpace: 'pre-wrap' }}>{s.output}</div> : <Notice tone="bad">{s.error}</Notice>}
        </Card>
      ))}
      {res?.grounding && (
        <p className="small muted">
          Based on {res.grounding.flags_considered} findings, {res.grounding.documents_considered} documents and {res.grounding.handbook_clauses} handbook clauses · model {res.model}. Recorded in the audit log.
        </p>
      )}
    </>
  );
}

/* --------------------------------------------------------------- rules */
function Rules() {
  const { token, user, toast } = useApp();
  const [rules, setRules] = useState<any[] | null>(null);
  const load = () => api<any[]>('/rules?active_only=false', token).then(setRules).catch(() => setRules([]));
  useEffect(() => { load(); }, []);

  async function toggle(r: any) {
    try { await api(`/rules/${r.id}`, token, { method: 'PATCH', body: JSON.stringify({ is_active: !r.is_active }) }); load(); }
    catch (e: any) { toast(e.message, 'error'); }
  }

  if (!rules) return <Spinner />;
  return (
    <Card title="Checklist rules" sub="Configurable requirements by application category. Administrators can switch rules on or off." flush>
      <table>
        <thead><tr><th>Rule</th><th>Category</th><th>Document</th><th>Mandatory</th><th>Checks</th><th>Active</th></tr></thead>
        <tbody>
          {rules.map(r => (
            <tr key={r.id}>
              <td>{r.rule_name}<div className="small muted">{r.description}</div></td>
              <td className="small">{label(r.category)}</td>
              <td className="mono">{r.document_type}</td>
              <td>{r.is_mandatory ? 'Yes' : 'No'}</td>
              <td className="small">{[r.check_expiry && 'expiry', r.required_fields?.length && `${r.required_fields.length} fields`, Object.keys(r.consistency_targets || {}).length && 'cross-checks', Object.keys(r.infrastructure_thresholds || {}).length && 'thresholds'].filter(Boolean).join(', ') || '-'}</td>
              <td>
                {user.role === 'admin'
                  ? <button className="btn sm" onClick={() => toggle(r)}>{r.is_active ? 'On' : 'Off'}</button>
                  : <Badge tone={r.is_active ? 'green' : ''}>{r.is_active ? 'On' : 'Off'}</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
