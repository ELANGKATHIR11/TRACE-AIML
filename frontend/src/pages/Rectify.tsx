import { useEffect, useState } from 'react';
import { api, Application, Doc, Flag, label, fmtDate } from '../api';
import { useApp, Card, PageHead, Empty, Notice, StatusBadge, Badge, FilePick, Spinner } from '../ui';

const NEEDS_ACTION = ['EXPIRED', 'MISMATCH', 'MANUAL_REVIEW_REQUIRED', 'SOURCE_UNAVAILABLE'];

export default function Rectify() {
  const { token, user, selectedAppId, openApp, toast } = useApp();
  const [apps, setApps] = useState<Application[]>([]);
  const [app, setApp] = useState<Application | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [files, setFiles] = useState<Record<number, File | null>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => { api<Application[]>('/applications', token).then(setApps).catch(() => {}); }, [token]);
  useEffect(() => {
    if (selectedAppId == null && apps.length) {
      const first = apps.find(a => ['RECTIFICATION_REQUESTED', 'DEFICIENCY_FLAGGED'].includes(a.status)) ?? apps[0];
      openApp(first.id);
    }
  }, [apps, selectedAppId, openApp]);

  function load(id: number) {
    api<Application>(`/applications/${id}`, token).then(setApp).catch(() => {});
    api<Doc[]>(`/documents/application/${id}`, token).then(setDocs).catch(() => {});
    api<Flag[]>(`/applications/${id}/flags`, token).then(setFlags).catch(() => {});
  }
  useEffect(() => { if (selectedAppId != null) { setLog([]); setEdits({}); load(selectedAppId); } }, [selectedAppId]);

  async function replace(d: Doc) {
    const f = files[d.id];
    if (!f) return;
    setBusy(d.id);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('rectification_notes', 'Replacement submitted by institution');
      const r = await api<{ verification_status: string; message: string }>(`/documents/${d.id}/rectify`, token, { method: 'POST', body: fd });
      setLog(l => [`${d.filename}: ${r.message}`, ...l]);
      toast(`Replacement checked: ${r.verification_status}`, r.verification_status === 'VERIFIED' ? 'success' : 'info');
      setFiles(p => ({ ...p, [d.id]: null }));
      if (selectedAppId != null) load(selectedAppId);
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(null); }
  }

  async function amend() {
    if (!app) return;
    const changed: Record<string, any> = {};
    for (const [k, v] of Object.entries(edits)) {
      if (v.trim() === '' || v === String(app.declared_data[k])) continue;
      changed[k] = typeof app.declared_data[k] === 'number' ? Number(v) : v;
    }
    if (!Object.keys(changed).length) { toast('No figures were changed', 'info'); return; }
    setSaving(true);
    try {
      const r = await api<{ new_status: string }>(
        `/applications/${app.id}/submit-rectification?${new URLSearchParams({ applicant_notes: 'Declared figures amended by institution' })}`,
        token, { method: 'POST', body: JSON.stringify(changed) },
      );
      setLog(l => [`Declared figures amended (${Object.keys(changed).join(', ')}). Application is now ${label(r.new_status)}.`, ...l]);
      toast('Figures updated and re-checked', 'success');
      setEdits({}); load(app.id);
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  if (!apps.length) return <div className="page"><PageHead title="Rectification" /><Empty>No applications yet.</Empty></div>;
  if (!app) return <div className="page"><Spinner /></div>;

  const deficient = docs.filter(d => NEEDS_ACTION.includes(d.verification_status));
  const missing = (app.applicable_checklist ?? []).filter(c => c.is_mandatory && !c.uploaded);
  const openFlags = flags.filter(f => !f.is_resolved);
  const clean = deficient.length === 0 && missing.length === 0;
  const isApplicant = user.role === 'applicant';

  return (
    <div className="page">
      <PageHead title="Rectification">Fix flagged documents and figures. Each replacement is checked again straight away.</PageHead>

      <div className="row" style={{ marginBottom: 14 }}>
        <label className="f" htmlFor="rapp" style={{ margin: 0 }}>Application</label>
        <select id="rapp" style={{ width: 'auto', minWidth: 320 }} value={selectedAppId ?? ''} onChange={e => openApp(Number(e.target.value))}>
          {apps.map(a => <option key={a.id} value={a.id}>{a.application_number} · {label(a.status)}</option>)}
        </select>
        <StatusBadge value={app.status} />
      </div>

      {!isApplicant && <Notice>Officers can review this page, but replacements are normally submitted by the institution.</Notice>}
      {clean && <Notice tone="good">Nothing needs correcting on this application right now.</Notice>}

      {missing.length > 0 && (
        <Card title="Missing mandatory documents" sub="Upload these from the Dossiers page">
          <ul style={{ paddingLeft: 18 }}>{missing.map(m => <li key={m.rule_id}>{m.rule_name} <span className="mono muted">({m.document_type})</span></li>)}</ul>
          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => openApp(app.id, 'dossiers')}>Go to documents</button>
        </Card>
      )}

      {deficient.map(d => {
        const ds = flags.filter(f => f.document_id === d.id && !f.is_resolved);
        const auth = d.verification_details?.authority_verification;
        return (
          <Card key={d.id} title={d.filename} sub={label(d.document_type)} actions={<StatusBadge value={d.verification_status} />}>
            {auth?.comparison_summary && <p style={{ marginBottom: 10 }}>{auth.comparison_summary}</p>}
            {ds.length > 0 && (
              <div className="stack" style={{ marginBottom: 12 }}>
                {ds.map(f => (
                  <div className="flag high" key={f.id}>
                    <div className="why">{f.reason}</div>
                    {f.evidence_snippet && <div className="ev">{f.evidence_snippet}</div>}
                    {f.reviewer_notes && <div className="small">Officer note: {f.reviewer_notes}</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="grid g2">
              <FilePick file={files[d.id] ?? null} onFile={f => setFiles(p => ({ ...p, [d.id]: f }))} accept=".pdf,.png,.jpg,.jpeg" hint="Upload the corrected document" />
              <div>
                <button className="btn primary" disabled={!files[d.id] || busy === d.id} onClick={() => replace(d)}>
                  {busy === d.id ? 'Checking…' : 'Replace and re-check'}
                </button>
                <p className="small muted" style={{ marginTop: 6 }}>Other documents keep their existing verification results.</p>
              </div>
            </div>
          </Card>
        );
      })}

      <Card title="Declared figures" sub="Correct a figure if it was entered wrongly. The application is re-validated after saving.">
        <div className="grid g3">
          {Object.entries(app.declared_data).filter(([, v]) => typeof v !== 'object').map(([k, v]) => (
            <div className="field" key={k}>
              <label className="f" htmlFor={`e-${k}`}>{label(k)}</label>
              <input id={`e-${k}`} type="text" defaultValue={String(v)} onChange={e => setEdits({ ...edits, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <button className="btn" disabled={saving || Object.keys(edits).length === 0} onClick={amend}>{saving ? 'Saving…' : 'Save changes and re-check'}</button>
      </Card>

      {log.length > 0 && (
        <Card title="This session">
          <ul style={{ paddingLeft: 18 }}>{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </Card>
      )}

      <p className="small muted">
        {openFlags.length} open finding{openFlags.length === 1 ? '' : 's'} · Last updated {fmtDate((app as any).updated_at ?? app.created_at)} · <Badge>{label(app.status)}</Badge>
      </p>
    </div>
  );
}
