import { useEffect, useState } from 'react';
import { api, Application, label, fmtDate } from '../api';
import { useApp, Card, PageHead, Spinner, StatusBadge, Empty, Badge } from '../ui';

interface Metrics {
  applications: { total: number; approved: number; flagged: number; under_review: number };
  documents: { total: number; verified: number; flagged_for_review: number; authority_status_breakdown?: Record<string, number> };
  flags: { total: number; critical: number; resolved: number; pending_resolution: number };
  system_status: { mode: string; database: string; local_llm_connected: boolean; models_ready: string[] };
}

const AUTH_ORDER: [string, string][] = [
  ['VERIFIED', 'Verified'], ['MISMATCH', 'Mismatch detected'], ['EXPIRED', 'Expired'],
  ['PENDING', 'Verification pending'], ['SOURCE_UNAVAILABLE', 'Source unavailable'], ['MANUAL_REVIEW_REQUIRED', 'Manual review required'],
];

export default function Overview() {
  const { token, user, openApp, go } = useApp();
  const [apps, setApps] = useState<Application[] | null>(null);
  const [m, setM] = useState<Metrics | null>(null);
  const isStaff = user.role !== 'applicant';

  useEffect(() => {
    api<Application[]>('/applications', token).then(setApps).catch(() => setApps([]));
    if (isStaff) api<Metrics>('/dashboard/metrics', token).then(setM).catch(() => {});
  }, [token, isStaff]);

  if (!apps) return <div className="page"><Spinner /></div>;

  const count = (s: string[]) => apps.filter(a => s.includes(a.status)).length;
  const stats = isStaff && m
    ? [
        ['Applications', m.applications.total, 'All submissions on record'],
        ['Awaiting officer decision', m.applications.under_review + m.applications.flagged, 'Ready for review or flagged'],
        ['Open flags', m.flags.pending_resolution, `${m.flags.critical} critical`],
        ['Documents verified', m.documents.verified, `of ${m.documents.total} uploaded`],
      ]
    : [
        ['Your applications', apps.length, 'Submitted by your institution'],
        ['Ready for review', count(['READY_FOR_REVIEW', 'PENDING_HUMAN_REVIEW']), 'Validation complete'],
        ['Need rectification', count(['DEFICIENCY_FLAGGED', 'RECTIFICATION_REQUESTED']), 'Action required from you'],
        ['Approved', count(['APPROVED_BY_REVIEWER']), 'Cleared by an AICTE officer'],
      ];

  return (
    <div className="page">
      <PageHead title="Overview">
        {isStaff ? 'Current verification workload across all institutions.' : 'Status of your institution\u2019s applications.'}
      </PageHead>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        {stats.map(([l, v, n]) => (
          <div className="stat" key={l as string}>
            <div className="label">{l}</div><div className="value">{v}</div><div className="note">{n}</div>
          </div>
        ))}
      </div>

      {isStaff && m?.documents.authority_status_breakdown && (
        <Card title="Issuing-authority verification outcomes" sub="Count of documents in each verification state">
          <div className="grid g3">
            {AUTH_ORDER.map(([k, t]) => (
              <div className="row between" key={k} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                <StatusBadge value={k} /><b>{m.documents.authority_status_breakdown![k] ?? 0}</b>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Recent applications" flush
        actions={!isStaff ? <button className="btn primary sm" onClick={() => go('new')}>New application</button> : undefined}>
        {apps.length === 0 ? (
          <Empty>No applications yet.</Empty>
        ) : (
          <table>
            <thead><tr><th>Application</th><th>Category</th><th>Year</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {[...apps].reverse().slice(0, 8).map(a => (
                <tr key={a.id} className="click" onClick={() => openApp(a.id, 'dossiers')}>
                  <td className="mono">{a.application_number}</td>
                  <td>{label(a.category)}</td>
                  <td>{a.academic_year}</td>
                  <td><StatusBadge value={a.status} /></td>
                  <td className="muted small">{fmtDate(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {isStaff && m && (
        <p className="small muted">
          Mode: {m.system_status.mode} · Database: {m.system_status.database} · Local LLM:{' '}
          <Badge tone={m.system_status.local_llm_connected ? 'green' : 'amber'}>
            {m.system_status.local_llm_connected ? 'connected' : 'not running (rule-based extraction in use)'}
          </Badge>
        </p>
      )}
    </div>
  );
}
