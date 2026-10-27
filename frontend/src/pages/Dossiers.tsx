import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiBlob, Application, Doc, Flag, label, fmtDate, fmtSize, DOC_TYPES, STATUS_TEXT } from '../api';
import { useApp, Card, PageHead, Spinner, StatusBadge, Empty, Notice, Badge, FilePick } from '../ui';

type Tab = 'checklist' | 'documents' | 'findings' | 'decision';

export default function Dossiers() {
  const { token, user, selectedAppId, openApp, toast } = useApp();
  const staff = user.role !== 'applicant';

  const [apps, setApps] = useState<Application[]>([]);
  const [detail, setDetail] = useState<Application | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [tab, setTab] = useState<Tab>('checklist');
  const [busy, setBusy] = useState('');
  const [inspectId, setInspectId] = useState<number | null>(null);

  const loadApps = useCallback(() => api<Application[]>('/applications', token).then(setApps).catch(() => {}), [token]);

  const loadDetail = useCallback((id: number) => {
    api<Application>(`/applications/${id}`, token).then(setDetail).catch(e => toast(e.message, 'error'));
    api<Doc[]>(`/documents/application/${id}`, token).then(setDocs).catch(() => setDocs([]));
    api<Flag[]>(`/applications/${id}/flags`, token).then(setFlags).catch(() => setFlags([]));
  }, [token, toast]);

  useEffect(() => { loadApps(); }, [loadApps]);
  useEffect(() => {
    if (selectedAppId == null && apps.length) openApp(apps[0].id);
  }, [apps, selectedAppId, openApp]);
  useEffect(() => { if (selectedAppId != null) { setInspectId(null); loadDetail(selectedAppId); } }, [selectedAppId, loadDetail]);

  async function validate() {
    if (!detail) return;
    setBusy('validate');
    try {
      await api(`/applications/${detail.id}/validate`, token, { method: 'POST' });
      toast('Validation finished', 'success');
      loadDetail(detail.id); loadApps();
      setTab('findings');
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(''); }
  }

  if (!apps.length && !detail) {
    return <div className="page"><PageHead title="Dossiers" /><Empty>No applications to show yet.</Empty></div>;
  }

  const checklist = detail?.applicable_checklist ?? [];
  const uploaded = checklist.filter(c => c.uploaded).length;
  const openFlags = flags.filter(f => !f.is_resolved).length;

  return (
    <div className="page">
      <PageHead title="Dossiers">Review an application's documents, verification results and findings.</PageHead>

      <div className="row" style={{ marginBottom: 14 }}>
        <label className="f" htmlFor="appsel" style={{ margin: 0 }}>Application</label>
        <select id="appsel" style={{ width: 'auto', minWidth: 320 }} value={selectedAppId ?? ''} onChange={e => openApp(Number(e.target.value))}>
          {apps.map(a => <option key={a.id} value={a.id}>{a.application_number} · {label(a.category)}</option>)}
        </select>
      </div>

      {!detail ? <Spinner /> : (
        <>
          <Card>
            <div className="row between">
              <div>
                <div className="row">
                  <b className="mono" style={{ fontSize: 15 }}>{detail.application_number}</b>
                  <StatusBadge value={detail.status} />
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  {label(detail.category)} · Academic year {detail.academic_year} · {uploaded} of {checklist.length} required documents uploaded · {openFlags} open finding{openFlags === 1 ? '' : 's'}
                </div>
              </div>
              <button className="btn primary" onClick={validate} disabled={busy === 'validate'}>
                {busy === 'validate' ? 'Validating…' : 'Run validation'}
              </button>
            </div>
          </Card>

          <div className="tabs" role="tablist">
            {([
              ['checklist', 'Checklist'],
              ['documents', `Documents (${docs.length})`],
              ['findings', `Findings (${flags.length})`],
              ...(staff ? [['decision', 'Officer decision']] : []),
            ] as [Tab, string][]).map(([id, t]) => (
              <button key={id} role="tab" className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{t}</button>
            ))}
          </div>

          {tab === 'checklist' && <ChecklistTab app={detail} onInspect={id => { setInspectId(id); setTab('documents'); }} />}
          {tab === 'documents' && (
            <DocumentsTab app={detail} docs={docs} flags={flags} inspectId={inspectId} setInspectId={setInspectId}
              reload={() => { loadDetail(detail.id); loadApps(); }} />
          )}
          {tab === 'findings' && <FindingsTab app={detail} flags={flags} docs={docs} staff={staff} reload={() => loadDetail(detail.id)} />}
          {tab === 'decision' && staff && <DecisionTab app={detail} flags={flags} onDone={() => { loadDetail(detail.id); loadApps(); }} />}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ checklist */
function ChecklistTab({ app, onInspect }: { app: Application; onInspect: (docId: number) => void }) {
  const list = app.applicable_checklist ?? [];
  return (
    <>
      <Card title="Required documents" sub="Checklist for this application category, taken from the configured handbook rules" flush>
        {list.length === 0 ? <Empty>No checklist rules are configured for this category.</Empty> : (
          <table>
            <thead><tr><th>Requirement</th><th>Document type</th><th>Required</th><th>Uploaded</th><th>Verification</th></tr></thead>
            <tbody>
              {list.map(i => (
                <tr key={i.rule_id} className={i.document_id ? 'click' : ''} onClick={() => i.document_id && onInspect(i.document_id)}>
                  <td>{i.rule_name}</td>
                  <td className="mono">{i.document_type}</td>
                  <td>{i.is_mandatory ? 'Mandatory' : 'Optional'}</td>
                  <td>{i.uploaded ? <Badge tone="green">Yes</Badge> : <Badge tone="red">Missing</Badge>}</td>
                  <td>{i.uploaded ? <StatusBadge value={i.verification_status} /> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid g2">
        <Card title="Declared in the application">
          {Object.keys(app.declared_data || {}).length === 0 ? <span className="muted">Nothing declared.</span> : (
            <dl className="kv">
              {Object.entries(app.declared_data).map(([k, v]) => <><dt key={k + 'k'}>{label(k)}</dt><dd key={k + 'v'}>{String(v)}</dd></>)}
            </dl>
          )}
        </Card>
        <Card title="AICTE records on file" sub="Historical baseline for this institution">
          {Object.keys(app.historical_aicte_records || {}).length === 0 ? <span className="muted">No historical record.</span> : (
            <dl className="kv">
              {Object.entries(app.historical_aicte_records!).map(([k, v]) => (
                <><dt key={k + 'k'}>{label(k)}</dt><dd key={k + 'v'}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></>
              ))}
            </dl>
          )}
        </Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ documents */
function DocumentsTab({ app, docs, flags, inspectId, setInspectId, reload }: {
  app: Application; docs: Doc[]; flags: Flag[]; inspectId: number | null; setInspectId: (id: number | null) => void; reload: () => void;
}) {
  const { token, toast } = useApp();
  const [type, setType] = useState(DOC_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('application_id', String(app.id));
      fd.append('document_type', type);
      fd.append('file', file);
      const r = await api<{ document_id: number }>('/documents/upload', token, { method: 'POST', body: fd });
      await api(`/documents/${r.document_id}/verify`, token, { method: 'POST' });
      toast('Uploaded and verified', 'success');
      setFile(null);
      reload();
      setInspectId(r.document_id);
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function reverify(id: number) {
    try { await api(`/documents/${id}/verify`, token, { method: 'POST' }); toast('Re-verified', 'success'); reload(); }
    catch (e: any) { toast(e.message, 'error'); }
  }

  const current = docs.find(d => d.id === inspectId) ?? null;

  return (
    <>
      <Card title="Uploaded documents" flush>
        {docs.length === 0 ? <Empty>No documents uploaded for this application.</Empty> : (
          <table>
            <thead><tr><th>File</th><th>Type</th><th>Size</th><th>Verification</th><th></th></tr></thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id} className={`click ${d.id === inspectId ? 'sel' : ''}`} onClick={() => setInspectId(d.id)}>
                  <td>{d.filename}<div className="mono muted">{d.sha256_hash.slice(0, 16)}…</div></td>
                  <td className="mono">{d.document_type}</td>
                  <td>{fmtSize(d.file_size_bytes)}</td>
                  <td><StatusBadge value={d.verification_status} /></td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn sm" onClick={() => reverify(d.id)}>Re-verify</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {current && <Inspector doc={current} app={app} flags={flags.filter(f => f.document_id === current.id)} />}

      <Card title="Add a document" sub="PDF, PNG or JPEG up to 35 MB. Files are encrypted at rest and checked on upload.">
        <div className="grid g2">
          <div>
            <div className="field">
              <label className="f" htmlFor="dt">Document type</label>
              <select id="dt" value={type} onChange={e => setType(e.target.value)}>
                {DOC_TYPES.map(t => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </div>
            <button className="btn primary" disabled={!file || busy} onClick={upload}>{busy ? 'Uploading…' : 'Upload and verify'}</button>
          </div>
          <FilePick file={file} onFile={setFile} accept=".pdf,.png,.jpg,.jpeg" hint="PDF, PNG or JPEG" />
        </div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ inspector */
function Inspector({ doc, app, flags }: { doc: Doc; app: Application; flags: Flag[] }) {
  const { token } = useApp();
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [marks, setMarks] = useState(0);
  const [img, setImg] = useState('');
  const [err, setErr] = useState('');

  // Values worth outlining on the page: the extracted value of every field a finding refers to.
  const terms = useMemo(() => {
    const out = new Set<string>();
    for (const f of flags) {
      const v = f.field_name ? doc.extracted_fields?.[f.field_name] : undefined;
      if (v !== undefined && v !== null && String(v).length >= 3) out.add(String(v));
    }
    return [...out];
  }, [flags, doc]);

  useEffect(() => { setPage(1); }, [doc.id]);
  useEffect(() => {
    let revoke = '';
    setErr('');
    const q = new URLSearchParams({ page: String(page) });
    terms.forEach(t => q.append('mark', t));
    apiBlob(`/documents/${doc.id}/preview?${q}`, token)
      .then(r => {
        revoke = r.url; setImg(r.url);
        setPages(Number(r.headers.get('X-Total-Pages') || 1));
        setMarks(Number(r.headers.get('X-Marked-Regions') || 0));
      })
      .catch(e => { setImg(''); setErr(e.message); });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [doc.id, page, terms, token]);

  const v = doc.verification_details ?? {};
  const auth = v.authority_verification;
  const forensics = v.forensics;
  const infra = v.infrastructure_analysis;

  // Side-by-side: what was submitted vs what the issuing authority's record says.
  const rows = useMemo(() => {
    const rec = auth?.authority_record as Record<string, any> | undefined;
    if (!rec) return [];
    const submitted = { ...app.declared_data, ...(doc.extracted_fields ?? {}) };
    return Object.keys(rec)
      .filter(k => k in submitted && !['status', 'portal_domain', 'authority_name'].includes(k))
      .map(k => {
        const a = String(submitted[k]), b = String(rec[k]);
        const na = parseFloat(a), nb = parseFloat(b);
        const same = !isNaN(na) && !isNaN(nb) ? Math.abs(na - nb) < 0.01 : a.toLowerCase() === b.toLowerCase();
        return { k, a, b, same };
      });
  }, [auth, app, doc]);

  return (
    <div className="split" style={{ marginBottom: 16 }}>
      <div>
        <div className="viewer-bar">
          <b>{doc.filename}</b>
          <span className="row">
            <button className="btn sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            <span>Page {page} of {pages}</span>
            <button className="btn sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
          </span>
        </div>
        <div className="viewer">
          {err ? <Notice tone="bad">{err}</Notice> : img ? <img src={img} alt={`Page ${page} of ${doc.filename}`} /> : <Spinner />}
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>
          {terms.length ? `${marks} region${marks === 1 ? '' : 's'} on this page outlined in red — values referred to by findings.` : 'No flagged values to outline on this document.'}
        </p>
      </div>

      <div className="stack">
        <Card title="Issuing-authority check" actions={<StatusBadge value={doc.verification_status} />}>
          {!auth ? <span className="muted">Not yet verified. Use “Re-verify”.</span> : (
            <>
              <dl className="kv">
                <dt>Source</dt><dd>{auth.authority_source}</dd>
                <dt>Reference checked</dt><dd className="mono">{auth.urn_checked ?? '-'}</dd>
                <dt>Checked at</dt><dd>{fmtDate(auth.verified_at)}</dd>
                <dt>Outcome</dt><dd>{STATUS_TEXT[auth.verification_status] ?? auth.verification_status}</dd>
                <dt>Digital signature</dt><dd>{auth.digital_signature?.has_valid_signature ? `Present (${auth.digital_signature.signature_standard})` : 'None found'}</dd>
                <dt>QR codes</dt><dd>{auth.qr_verification?.detected_count ?? 0} found{auth.qr_verification?.is_official_govt_qr ? ' (official domain)' : ''}</dd>
              </dl>
              <p className="small" style={{ marginTop: 8 }}>{auth.comparison_summary}</p>
              <p className="small muted" style={{ marginTop: 6 }}>
                Prototype note: authority lookups use a local mirror of issuing-authority records, not a live government portal.
              </p>
            </>
          )}
        </Card>

        {rows.length > 0 && (
          <Card title="Submitted vs official record" flush>
            <table className="compare">
              <thead><tr><th>Field</th><th>Submitted</th><th>Official</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.k}>
                    <td>{label(r.k)}</td>
                    <td className={r.same ? '' : 'bad'}>{r.a}</td>
                    <td>{r.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {forensics && (
          <Card title="Tampering indicators" sub="Preliminary signals — they need human verification">
            {forensics.anomalies_detected?.length ? (
              <ul style={{ paddingLeft: 18 }}>{forensics.anomalies_detected.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
            ) : <span className="muted">No metadata or font anomalies found.</span>}
            <p className="small muted" style={{ marginTop: 6 }}>
              Score {forensics.forensic_score} · Producer: {forensics.metadata_audited?.producer || 'n/a'} · Creator: {forensics.metadata_audited?.creator || 'n/a'}
            </p>
          </Card>
        )}

        {infra && (
          <Card title="Infrastructure review">
            {infra.room_measurements?.length ? (
              <table className="compare">
                <thead><tr><th>Room</th><th>Area</th><th>Minimum</th></tr></thead>
                <tbody>
                  {infra.room_measurements.map((r: any, i: number) => (
                    <tr key={i}><td>{r.room}</td><td className={r.compliant ? '' : 'bad'}>{r.area_sqm} sq m</td><td>{r.required_min_sqm} sq m</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <span className="muted">No room dimensions could be read from this document.</span>}
            {infra.evc_checklist?.length > 0 && (
              <>
                <h3 style={{ marginTop: 10 }}>Points for a physical inspection</h3>
                <ul style={{ paddingLeft: 18 }}>{infra.evc_checklist.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
              </>
            )}
          </Card>
        )}

        {flags.length > 0 && (
          <Card title={`Findings on this document (${flags.length})`}>
            <div className="stack">{flags.map(f => <FlagCard key={f.id} f={f} />)}</div>
          </Card>
        )}
      </div>
    </div>
  );
}

function FlagCard({ f }: { f: Flag }) {
  const high = f.severity === 'CRITICAL' || f.severity === 'HIGH';
  return (
    <div className={`flag ${high ? 'high' : ''}`}>
      <div className="row">
        <Badge tone={high ? 'red' : 'amber'}>{label(f.severity)}</Badge>
        <Badge>{label(f.flag_category)}</Badge>
        {f.is_resolved && <Badge tone="green">Resolved: {label(f.reviewer_action || 'done')}</Badge>}
      </div>
      <div className="why">{f.reason}</div>
      {f.evidence_snippet && <div className="ev">{f.evidence_snippet}</div>}
      {f.reviewer_notes && <div className="small" style={{ marginTop: 4 }}>Officer note: {f.reviewer_notes}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ findings */
function FindingsTab({ app, flags, docs, staff, reload }: {
  app: Application; flags: Flag[]; docs: Doc[]; staff: boolean; reload: () => void;
}) {
  const { token, toast } = useApp();
  const summary = app.validation_summary ?? {};
  const evc: string[] = summary.evc_inspection_checklist ?? [];

  async function resolve(id: number, action: string) {
    const note = window.prompt('Note for the record (optional):') ?? '';
    try {
      await api(`/flags/${id}/resolve?${new URLSearchParams({ reviewer_action: action, reviewer_notes: note })}`, token, { method: 'POST' });
      toast('Finding updated', 'success'); reload();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  const docName = (id?: number | null) => docs.find(d => d.id === id)?.filename;

  return (
    <>
      <Notice>
        Findings are advisory. They point to items that need attention; they are not conclusions of forgery or non-compliance,
        and any adverse action requires an authorised AICTE officer.
      </Notice>

      {summary.overall_status && (
        <Card title="Latest validation">
          <div className="row">
            <Badge tone={summary.overall_status === 'FULLY_COMPLIANT' ? 'green' : 'amber'}>{label(summary.overall_status)}</Badge>
            <span className="muted small">Run {fmtDate(summary.timestamp)}</span>
          </div>
        </Card>
      )}

      {flags.length === 0 ? <Empty>No findings. Run validation if documents have changed.</Empty> : (
        <div className="stack">
          {flags.map(f => (
            <div key={f.id}>
              <FlagCard f={f} />
              <div className="row small muted" style={{ marginTop: 4 }}>
                {f.document_id && <span>Document: {docName(f.document_id)}</span>}
                {staff && !f.is_resolved && (
                  <>
                    <button className="btn sm" onClick={() => resolve(f.id, 'CONFIRMED_DEFICIENCY')}>Confirm deficiency</button>
                    <button className="btn sm" onClick={() => resolve(f.id, 'DISMISSED_FALSE_POSITIVE')}>Dismiss as false positive</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {evc.length > 0 && (
        <Card title="Suggested points for a physical inspection">
          <ul style={{ paddingLeft: 18 }}>{evc.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </Card>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ decision */
function DecisionTab({ app, flags, onDone }: { app: Application; flags: Flag[]; onDone: () => void }) {
  const { token, toast } = useApp();
  const [action, setAction] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const open = flags.filter(f => !f.is_resolved).length;

  const options = [
    ['APPROVE', 'Approve', 'Application meets requirements.'],
    ['REQUEST_CORRECTION', 'Request rectification', 'Return to the institution to fix the listed deficiencies.'],
    ['ESCALATE', 'Escalate', 'Refer for physical inspection or committee review.'],
    ['REJECT', 'Reject', 'Application cannot be accepted.'],
  ];

  async function submit() {
    if (!action || notes.trim().length < 5) return;
    if (!window.confirm(`Record decision "${label(action)}" for ${app.application_number}? This is written to the audit log.`)) return;
    setBusy(true);
    try {
      await api(`/applications/${app.id}/decision?${new URLSearchParams({ action, officer_notes: notes })}`, token, { method: 'POST' });
      toast('Decision recorded', 'success');
      setAction(''); setNotes(''); onDone();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Card title="Record a decision" sub="Only an authorised officer can approve or reject. The system never decides on its own.">
      {open > 0 && <Notice tone="warn">{open} finding{open === 1 ? ' is' : 's are'} still unresolved.</Notice>}
      <div className="field">
        {options.map(([v, t, d]) => (
          <label key={v} className="row" style={{ padding: '6px 0', cursor: 'pointer' }}>
            <input type="radio" name="decision" checked={action === v} onChange={() => setAction(v)} />
            <span><b>{t}</b> <span className="muted">— {d}</span></span>
          </label>
        ))}
      </div>
      <div className="field">
        <label className="f" htmlFor="notes">Reasons / officer notes (required)</label>
        <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="State the grounds for this decision." />
      </div>
      <button className="btn primary" disabled={!action || notes.trim().length < 5 || busy} onClick={submit}>
        {busy ? 'Recording…' : 'Record decision'}
      </button>
    </Card>
  );
}
