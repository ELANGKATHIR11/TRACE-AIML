import { useEffect, useState } from 'react';
import { api, Institution, CATEGORIES } from '../api';
import { useApp, Card, PageHead, Notice } from '../ui';

const FIELDS: { key: string; label: string; hint: string; step?: string }[] = [
  { key: 'requested_intake', label: 'Requested intake (students)', hint: 'Total intake being applied for' },
  { key: 'total_approved_intake', label: 'Currently approved intake', hint: 'Used for the student–faculty ratio check' },
  { key: 'land_area_acres', label: 'Land area (acres)', hint: 'Compared with the land document and state revenue record', step: '0.01' },
  { key: 'built_up_area_sqm', label: 'Built-up area (sq m)', hint: 'Compared with the building plan and fire certificate' },
  { key: 'total_faculty_count', label: 'Faculty count', hint: 'Compared with the faculty roster' },
  { key: 'survey_number', label: 'Survey / land record number', hint: 'Reference on the land ownership document' },
  { key: 'ter_payment_utr', label: 'TER payment reference (UTR)', hint: 'Transaction reference for the processing fee' },
];

export default function NewApplication() {
  const { token, user, toast, openApp } = useApp();
  const [insts, setInsts] = useState<Institution[]>([]);
  const [instId, setInstId] = useState(user.institution_id ? String(user.institution_id) : '');
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [year, setYear] = useState('2026-27');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [ni, setNi] = useState({ name: '', aicte_permanent_id: '', state: '', district: '', address: '', established_year: '' });

  useEffect(() => { api<Institution[]>('/institutions', token).then(setInsts).catch(() => {}); }, [token]);

  async function addInstitution() {
    try {
      const created = await api<Institution>('/institutions', token, {
        method: 'POST', body: JSON.stringify({ ...ni, established_year: parseInt(ni.established_year, 10) }),
      });
      setInsts(p => [...p, created]); setInstId(String(created.id)); setShowNew(false);
      toast(`Registered ${created.name}`, 'success');
    } catch (e: any) { toast(e.message, 'error'); }
  }

  async function submit() {
    const declared: Record<string, any> = {};
    for (const f of FIELDS) {
      const v = (vals[f.key] ?? '').trim();
      if (!v) continue;
      declared[f.key] = f.key === 'survey_number' || f.key === 'ter_payment_utr' ? v : Number(v);
    }
    setBusy(true);
    try {
      const a = await api<{ id: number }>('/applications', token, {
        method: 'POST',
        body: JSON.stringify({ institution_id: Number(instId), academic_year: year, category, declared_data: declared }),
      });
      toast('Application created. Upload its documents next.', 'success');
      openApp(a.id, 'dossiers');
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  const ready = instId !== '';
  const niReady = Object.values(ni).every(v => v.trim() !== '');

  return (
    <div className="page">
      <PageHead title="New application">Enter the application details. Documents are uploaded on the next screen.</PageHead>

      <div className="grid g2">
        <Card title="Institution and category">
          <div className="field">
            <label className="f" htmlFor="inst">Institution</label>
            <select id="inst" value={instId} onChange={e => setInstId(e.target.value)}>
              <option value="">Select…</option>
              {insts.map(i => <option key={i.id} value={i.id}>{i.name} ({i.aicte_permanent_id})</option>)}
            </select>
            <div className="hint">Not listed? <a href="#" onClick={e => { e.preventDefault(); setShowNew(s => !s); }}>Register a new institution</a>.</div>
          </div>

          {showNew && (
            <div className="notice">
              {([['name', 'Institution name'], ['aicte_permanent_id', 'AICTE permanent ID'], ['state', 'State'], ['district', 'District'], ['address', 'Address'], ['established_year', 'Year established']] as const).map(([k, l]) => (
                <div className="field" key={k}>
                  <label className="f" htmlFor={`ni-${k}`}>{l}</label>
                  <input id={`ni-${k}`} type={k === 'established_year' ? 'number' : 'text'} value={ni[k]} onChange={e => setNi({ ...ni, [k]: e.target.value })} />
                </div>
              ))}
              <button className="btn primary sm" disabled={!niReady} onClick={addInstitution}>Register institution</button>
            </div>
          )}

          <div className="field">
            <label className="f" htmlFor="cat">Application category</label>
            <select id="cat" value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <div className="hint">The category decides which document checklist applies.</div>
          </div>
          <div className="field">
            <label className="f" htmlFor="yr">Academic year</label>
            <select id="yr" value={year} onChange={e => setYear(e.target.value)}>
              {['2025-26', '2026-27', '2027-28'].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
        </Card>

        <Card title="Declared figures" sub="Leave blank anything that does not apply">
          <Notice>These values are checked against your uploaded documents and AICTE's records. Differences are raised as findings for a reviewer.</Notice>
          {FIELDS.map(f => (
            <div className="field" key={f.key}>
              <label className="f" htmlFor={f.key}>{f.label}</label>
              <input id={f.key} type={f.key === 'survey_number' || f.key === 'ter_payment_utr' ? 'text' : 'number'} step={f.step}
                value={vals[f.key] ?? ''} onChange={e => setVals({ ...vals, [f.key]: e.target.value })} />
              <div className="hint">{f.hint}</div>
            </div>
          ))}
        </Card>
      </div>

      <button className="btn primary" disabled={!ready || busy} onClick={submit}>{busy ? 'Creating…' : 'Create application'}</button>
    </div>
  );
}
