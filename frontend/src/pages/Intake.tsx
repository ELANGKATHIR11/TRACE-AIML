import { useEffect, useState } from 'react';
import { api, Application, DOC_TYPES, label, fmtSize } from '../api';
import { useApp, Card, PageHead, Notice, FilePick, Badge, StatusBadge } from '../ui';

type Tab = 'certificates' | 'infra' | 'authority';

export default function Intake() {
  const [tab, setTab] = useState<Tab>('certificates');
  const { go } = useApp();
  return (
    <div className="page">
      <PageHead title="Intake">Submit supporting material of each kind. Everything is checked as it arrives.</PageHead>

      <div className="tabs" role="tablist">
        {([['certificates', 'Certificates and records'], ['infra', 'Floor plans, photos and video'], ['authority', 'QR codes and digital signatures']] as [Tab, string][]).map(([id, t]) => (
          <button key={id} role="tab" className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{t}</button>
        ))}
      </div>

      {tab === 'certificates' && <Certificates />}
      {tab === 'infra' && <Infra />}
      {tab === 'authority' && <Authority />}

      <p className="small muted">
        Application form details (intake, land area, survey number, fee reference) are entered when you{' '}
        <a href="#" onClick={e => { e.preventDefault(); go('new'); }}>create an application</a>.
      </p>
    </div>
  );
}

/* --------------------------------------------------------- certificates */
function Certificates() {
  const { token, selectedAppId, openApp, toast } = useApp();
  const [apps, setApps] = useState<Application[]>([]);
  const [appId, setAppId] = useState<string>(selectedAppId ? String(selectedAppId) : '');
  const [type, setType] = useState(DOC_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: string; doc: number; flags: number } | null>(null);

  useEffect(() => {
    api<Application[]>('/applications', token).then(a => { setApps(a); if (!appId && a.length) setAppId(String(a[0].id)); }).catch(() => {});
  }, [token]);

  async function submit() {
    if (!file || !appId) return;
    setBusy(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append('application_id', appId);
      fd.append('document_type', type);
      fd.append('file', file);
      const up = await api<{ document_id: number }>('/documents/upload', token, { method: 'POST', body: fd });
      const v = await api<{ result: { status: string; flags_count: number } }>(`/documents/${up.document_id}/verify`, token, { method: 'POST' });
      setResult({ status: v.result.status, doc: up.document_id, flags: v.result.flags_count });
      setFile(null);
      toast('Document received and checked', 'success');
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid g2">
      <Card title="Attach a document to an application" sub="Land deeds, fire safety certificates, affidavits, EoA letters, accreditation, faculty rosters">
        <div className="field">
          <label className="f" htmlFor="ia">Application</label>
          <select id="ia" value={appId} onChange={e => setAppId(e.target.value)}>
            {apps.map(a => <option key={a.id} value={a.id}>{a.application_number}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="f" htmlFor="it">Document type</label>
          <select id="it" value={type} onChange={e => setType(e.target.value)}>
            {DOC_TYPES.map(t => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </div>
        <FilePick file={file} onFile={setFile} accept=".pdf,.png,.jpg,.jpeg" hint="PDF, PNG or JPEG, up to 35 MB. Scanned pages are read with OCR." />
        <div style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!file || !appId || busy} onClick={submit}>{busy ? 'Checking…' : 'Upload and check'}</button>
        </div>
      </Card>

      <Card title="What happens on upload">
        <ol style={{ paddingLeft: 18 }} className="stack">
          <li>File type is verified from its content, not its name; unsafe files are refused.</li>
          <li>The file is encrypted before it is stored, and a fingerprint is kept to detect reuse across applications.</li>
          <li>Text is read (OCR for scans) and key fields are extracted.</li>
          <li>Details are compared with the issuing authority's record and with what the institution declared.</li>
          <li>Anything that does not match becomes a finding for an officer to review.</li>
        </ol>
        {result && (
          <div className="notice good" style={{ marginTop: 14 }}>
            Result: <StatusBadge value={result.status} /> · {result.flags} finding{result.flags === 1 ? '' : 's'}.{' '}
            <a href="#" onClick={e => { e.preventDefault(); openApp(Number(appId), 'dossiers'); }}>Open the dossier</a>
          </div>
        )}
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- infra */
function Infra() {
  const { token, toast } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);

  async function inspect() {
    if (!file) return;
    setBusy(true); setRes(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      setRes(await api('/media/inspect', token, { method: 'POST', body: fd }));
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  const isVideo = res?.media_type === 'VIDEO';

  return (
    <div className="grid g2">
      <Card title="Inspect infrastructure evidence" sub="Floor plans and layout drawings (PDF, PNG, JPEG) or a walkthrough video (MP4, AVI, MOV)">
        <FilePick file={file} onFile={f => { setFile(f); setRes(null); }} accept=".pdf,.png,.jpg,.jpeg,.mp4,.avi,.mov" hint="Up to 200 MB" />
        <div style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!file || busy} onClick={inspect}>{busy ? 'Analysing…' : 'Analyse'}</button>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          This is a preview check and does not attach the file to an application. To keep a floor plan on record,
          upload it as “Infrastructure evidence” under Certificates and records. Videos are analysed but not stored.
        </p>
      </Card>

      <Card title="Result">
        {!res ? <span className="muted">Nothing analysed yet.</span> : isVideo ? (
          <>
            <dl className="kv">
              <dt>Duration</dt><dd>{res.duration_seconds} s</dd>
              <dt>Frames</dt><dd>{res.total_frames}</dd>
              <dt>Sampled frames</dt><dd>{res.sampled_frames?.length ?? 0}</dd>
            </dl>
            {res.sampled_frames?.length > 0 && (
              <table className="compare" style={{ marginTop: 10 }}>
                <thead><tr><th>Frame</th><th>Time</th><th>Size</th><th>Mean brightness</th></tr></thead>
                <tbody>{res.sampled_frames.map((s: any) => (
                  <tr key={s.frame_index}><td>{s.frame_index}</td><td>{s.timestamp_sec}s</td><td>{s.dimensions.join('×')}</td><td>{s.mean_intensity.toFixed(1)}</td></tr>
                ))}</tbody>
              </table>
            )}
            <p className="small muted" style={{ marginTop: 8 }}>
              Only basic frame statistics are computed. The system cannot judge facilities from video; a person should review it.
            </p>
            {res.evc_inspection_required && <Notice tone="warn">Video is very short. Consider asking for a fuller walkthrough or a physical inspection.</Notice>}
          </>
        ) : (
          <>
            <dl className="kv">
              <dt>Image size</dt><dd>{res.dimensions?.join(' × ')} px</dd>
              <dt>Ramp / barrier-free mention</dt><dd>{res.accessibility_checks?.ramp_or_divyangjan_detected ? 'Found in text' : 'Not found'}</dd>
              <dt>Lift mention</dt><dd>{res.accessibility_checks?.lift_or_elevator_detected ? 'Found in text' : 'Not found'}</dd>
              <dt>Fire exit mention</dt><dd>{res.accessibility_checks?.fire_emergency_exit_detected ? 'Found in text' : 'Not found'}</dd>
            </dl>
            <h3 style={{ margin: '12px 0 6px' }}>Room areas read from the drawing</h3>
            {res.room_measurements?.length ? (
              <table className="compare">
                <thead><tr><th>Room</th><th>Area</th><th>Minimum</th><th></th></tr></thead>
                <tbody>{res.room_measurements.map((r: any, i: number) => (
                  <tr key={i}><td>{r.room}</td><td className={r.compliant ? '' : 'bad'}>{r.area_sqm} sq m</td><td>{r.required_min_sqm} sq m</td>
                    <td>{r.compliant ? <Badge tone="green">Meets</Badge> : <Badge tone="red">Below</Badge>}</td></tr>
                ))}</tbody>
              </table>
            ) : <span className="muted">No labelled room areas could be read (needs text such as “Classroom 101: 72 sqm”).</span>}
            {res.discrepancies?.length > 0 && <div className="stack" style={{ marginTop: 10 }}>{res.discrepancies.map((d: string, i: number) => <Notice key={i} tone="warn">{d}</Notice>)}</div>}
            <h3 style={{ margin: '12px 0 6px' }}>Suggested points for a physical inspection</h3>
            <ul style={{ paddingLeft: 18 }}>{res.evc_checklist?.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
          </>
        )}
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------- authority */
function Authority() {
  const { token, toast } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [gateways, setGateways] = useState<any[]>([]);

  useEffect(() => { api<any[]>('/documents/authority-gateways', token).then(setGateways).catch(() => {}); }, [token]);

  async function check() {
    if (!file) return;
    setBusy(true); setRes(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      setRes(await api('/intake/authority-check', token, { method: 'POST', body: fd }));
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="grid g2">
        <Card title="Check a certificate for QR codes and signatures" sub="Upload a certificate as a PDF or image">
          <FilePick file={file} onFile={f => { setFile(f); setRes(null); }} accept=".pdf,.png,.jpg,.jpeg" hint="PDF, PNG or JPEG" />
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={!file || busy} onClick={check}>{busy ? 'Checking…' : 'Check'}</button>
          </div>
        </Card>
        <Card title="Result">
          {!res ? <span className="muted">Nothing checked yet.</span> : (
            <dl className="kv">
              <dt>QR codes found</dt><dd>{res.qr.detected_count}</dd>
              <dt>Official domain</dt><dd>{res.qr.is_official_govt_qr ? <Badge tone="green">{res.qr.issuer_domain}</Badge> : <Badge>None</Badge>}</dd>
              <dt>QR contents</dt><dd className="mono">{res.qr.payloads?.length ? res.qr.payloads.join(', ') : '-'}</dd>
              <dt>Digital signature</dt><dd>{res.digital_signature.has_valid_signature ? <Badge tone="green">{res.digital_signature.signature_standard}</Badge> : <Badge>Not signed</Badge>}</dd>
              <dt>Signer</dt><dd>{res.digital_signature.signer_authority ?? '-'}</dd>
            </dl>
          )}
          {res && (
            <p className="small muted" style={{ marginTop: 8 }}>
              Signature presence is detected from the PDF structure and text markers; the signing certificate chain is not validated cryptographically in this prototype.
            </p>
          )}
        </Card>
      </div>

      <Card title="Issuing authorities supported" sub="Authority records are held in a local mirror in this prototype; no live government portal is queried" flush>
        <table>
          <thead><tr><th>Authority</th><th>Documents</th><th>How it is checked</th></tr></thead>
          <tbody>
            {gateways.map(g => (
              <tr key={g.gateway_id}>
                <td>{g.name}</td>
                <td className="small">{g.supported_documents.map((d: string) => label(d)).join(', ')}</td>
                <td className="small">{g.mechanisms.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

export { fmtSize };
