import { useEffect, useState } from 'react';
import { api, AuditEntry, fmtDate } from '../api';
import { useApp, Card, PageHead, Spinner, Notice, Badge } from '../ui';

export default function Audit() {
  const { token } = useApp();
  const [logs, setLogs] = useState<AuditEntry[] | null>(null);
  const [chain, setChain] = useState<any>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api<AuditEntry[]>('/audit?limit=200', token).then(setLogs).catch(() => setLogs([]));
    api('/audit/verify-chain', token).then(setChain).catch(() => {});
  }, [token]);

  if (!logs) return <div className="page"><Spinner /></div>;
  const shown = logs.filter(l => (l.action_type + ' ' + l.summary).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <PageHead title="Audit log">Every rule applied, record checked, source response and action taken is recorded here.</PageHead>

      {chain && (
        <Notice tone={chain.is_valid === false ? 'bad' : 'good'}>
          {chain.is_valid === false
            ? 'Integrity check FAILED: the audit chain has been altered or entries are missing.'
            : `Integrity check passed: ${chain.total_records ?? logs.length} entries form an unbroken hash chain.`}
        </Notice>
      )}

      <Card flush title="Entries" sub="Newest first"
        actions={<input type="search" aria-label="Filter entries" placeholder="Filter…" style={{ width: 220 }} value={q} onChange={e => setQ(e.target.value)} />}>
        <table>
          <thead><tr><th>Time</th><th>Action</th><th>Application</th><th>Summary</th><th>Hash</th></tr></thead>
          <tbody>
            {shown.map(l => (
              <tr key={l.id}>
                <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.timestamp)}</td>
                <td><Badge tone="navy">{l.action_type}</Badge></td>
                <td className="mono">{l.application_id ?? '-'}</td>
                <td>{l.summary}</td>
                <td className="mono muted">{l.record_hash?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
