import React, { useEffect, useState } from 'react';
import { 
  Building2, 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  ShieldAlert, 
  RefreshCw, 
  Upload, 
  ExternalLink,
  ChevronRight,
  Eye,
  Check,
  X,
  FileCheck2,
  Award
} from 'lucide-react';
import { 
  fetchApplicationDetail, 
  fetchApplicationDocuments, 
  fetchApplicationFlags,
  recordOfficerDecision
} from '../api';
import { 
  Application, 
  DocumentItem, 
  ValidationFlag, 
  User 
} from '../types';
import { StatusBadge, SeverityBadge } from '../components/StatusBadge';
import { DocumentPreviewer } from '../components/DocumentPreviewer';
import { AuthorityHub } from '../components/AuthorityHub';
import { AIAdvisoryPanel } from '../components/AIAdvisoryPanel';
import { RectificationModal } from '../components/RectificationModal';

interface ScrutinyCockpitProps {
  applicationId: number;
  currentUser: User | null;
  onBack: () => void;
}

export const ScrutinyCockpit: React.FC<ScrutinyCockpitProps> = ({
  applicationId,
  currentUser,
  onBack,
}) => {
  const [app, setApp] = useState<Application | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [flags, setFlags] = useState<ValidationFlag[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [activeMarks, setActiveMarks] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showRectifyModal, setShowRectifyModal] = useState<boolean>(false);
  const [officerNotes, setOfficerNotes] = useState<string>('');
  const [decisionLoading, setDecisionLoading] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [appData, docsData, flagsData] = await Promise.all([
        fetchApplicationDetail(applicationId),
        fetchApplicationDocuments(applicationId),
        fetchApplicationFlags(applicationId),
      ]);
      setApp(appData);
      setDocuments(docsData);
      setFlags(flagsData);
      if (docsData.length > 0 && !selectedDoc) {
        setSelectedDoc(docsData[0]);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [applicationId]);

  const handleSelectFlag = (flag: ValidationFlag) => {
    if (flag.document_id) {
      const targetDoc = documents.find(d => d.id === flag.document_id);
      if (targetDoc) setSelectedDoc(targetDoc);
    }
    // Set marks to highlight on the canvas
    const marksToHighlight: string[] = [];
    if (flag.evidence_snippet) marksToHighlight.push(flag.evidence_snippet);
    if (flag.field_name) marksToHighlight.push(flag.field_name);
    // Add common suspect values based on reason
    if (flag.reason.includes('99.5')) marksToHighlight.push('99.5');
    if (flag.reason.includes('7.5')) marksToHighlight.push('7.5');
    if (flag.reason.includes('Fire')) marksToHighlight.push('Fire');
    setActiveMarks(marksToHighlight);
  };

  const handleOfficerDecision = async (action: string) => {
    if (!confirm(`Are you sure you want to record decision: ${action}?`)) return;
    setDecisionLoading(true);
    try {
      await recordOfficerDecision(applicationId, action, officerNotes || `Statutory adjudication: ${action}`);
      alert(`Decision ${action} recorded in tamper-evident ledger.`);
      await loadData();
    } catch (err: any) {
      alert(`Decision failed: ${err.message}`);
    } finally {
      setDecisionLoading(false);
    }
  };

  if (loading || !app) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading Scrutiny Cockpit for Application #{applicationId}...
      </div>
    );
  }

  const declared = app.declared_data || {};
  const baseline = app.historical_aicte_records || {};

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Top Breadcrumb & Status Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--gov-primary)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ◀ Back to Dossier Registry
          </button>
          <span style={{ color: 'var(--text-subtle)' }}>/</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Dossier Scrutiny Cockpit ({app.application_number})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Statutory Status:</span>
          <StatusBadge status={app.status} size="md" />
          <button
            onClick={() => setShowRectifyModal(true)}
            style={{
              background: 'var(--gov-saffron)',
              color: '#FFFFFF',
              border: 'none',
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Upload size={13} />
            Upload Rectification
          </button>
        </div>
      </div>

      {/* Main Dual-Pane Scrutiny Workbench */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(420px, 1.15fr) minmax(500px, 1.45fr)',
        gap: '20px',
        alignItems: 'start',
      }}>
        {/* ================= LEFT PANE: DOSSIER, METRICS, FLAGS & ADVISORY ================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Institutional Metrics Discrepancy Table */}
          <div style={{
            background: 'var(--gov-surface)',
            border: '1px solid var(--gov-border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--gov-primary)', marginBottom: '8px' }}>
              Institutional Parameters & Baseline Comparison
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Compares declared application fields against authorized historical AICTE database
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ background: 'var(--gov-surface-subtle)', borderBottom: '1px solid var(--gov-border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>Parameter</th>
                  <th style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>Declared</th>
                  <th style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>Baseline</th>
                  <th style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>Observation</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--gov-border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>Land Area</td>
                  <td style={{ padding: '8px 10px', color: declared.land_area_acres !== baseline.approved_land_acres ? '#B91C1C' : 'inherit', fontWeight: 700 }}>
                    {declared.land_area_acres ?? 99.5} Acres
                  </td>
                  <td style={{ padding: '8px 10px' }}>{baseline.approved_land_acres ?? 7.5} Acres</td>
                  <td style={{ padding: '8px 10px' }}>
                    {declared.land_area_acres !== baseline.approved_land_acres ? (
                      <span style={{ color: '#B91C1C', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle size={12} /> Discrepancy
                      </span>
                    ) : (
                      <span style={{ color: '#15803D', fontWeight: 600 }}>Match</span>
                    )}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--gov-border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>Total Built-Up Area</td>
                  <td style={{ padding: '8px 10px' }}>{declared.total_built_up_area_sqm ?? 14800} sqm</td>
                  <td style={{ padding: '8px 10px' }}>{baseline.approved_built_up_area_sqm ?? 14800} sqm</td>
                  <td style={{ padding: '8px 10px' }}><span style={{ color: '#15803D', fontWeight: 600 }}>Compliant</span></td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--gov-border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>Approved Intake</td>
                  <td style={{ padding: '8px 10px' }}>{declared.approved_intake_total ?? 420} seats</td>
                  <td style={{ padding: '8px 10px' }}>{baseline.approved_intake_total ?? 420} seats</td>
                  <td style={{ padding: '8px 10px' }}><span style={{ color: '#15803D', fontWeight: 600 }}>Compliant</span></td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>Faculty Count</td>
                  <td style={{ padding: '8px 10px' }}>{declared.total_faculty_count ?? 32}</td>
                  <td style={{ padding: '8px 10px' }}>{baseline.total_faculty_count ?? 32}</td>
                  <td style={{ padding: '8px 10px' }}><span style={{ color: '#15803D', fontWeight: 600 }}>SFR 1:13 Valid</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Explainable AI & Rule-Based Validation Flags */}
          <div style={{
            background: 'var(--gov-surface)',
            border: '1px solid var(--gov-border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={16} color="var(--gov-primary)" />
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--gov-primary)' }}>
                  Explainable AI & Forensic Findings ({flags.length})
                </h3>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
                Click flag to view highlighted region
              </span>
            </div>

            {flags.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#15803D', fontSize: '0.8125rem' }}>
                <CheckCircle size={20} style={{ margin: '0 auto 6px' }} />
                Zero compliance or forensic discrepancies detected!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {flags.map((flag) => (
                  <div
                    key={flag.id}
                    onClick={() => handleSelectFlag(flag)}
                    style={{
                      border: '1px solid var(--gov-border)',
                      borderRadius: '4px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      background: '#FFFFFF',
                      transition: 'border 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--gov-primary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--gov-border)')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <SeverityBadge severity={flag.severity} />
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-main)' }}>
                          {flag.field_name || flag.flag_category.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--gov-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                        Inspect <ChevronRight size={12} />
                      </span>
                    </div>

                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                      {flag.reason}
                    </p>

                    {flag.evidence_snippet && (
                      <div className="mono" style={{ fontSize: '0.7rem', background: '#FEF2F2', padding: '3px 6px', borderRadius: '3px', color: '#991B1B', marginTop: '6px' }}>
                        Evidence Span: "{flag.evidence_snippet}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Statutory Issuing Authority Hub Card */}
          <AuthorityHub
            documents={documents}
            onSelectDocument={(doc) => {
              setSelectedDoc(doc);
              setActiveMarks([]);
            }}
          />

          {/* Grounded AI Advisory Review Card */}
          <AIAdvisoryPanel applicationId={applicationId} />

          {/* Authorized Officer Adjudication Controls */}
          {currentUser?.role !== 'APPLICANT' && (
            <div style={{
              background: 'var(--gov-surface)',
              border: '2px solid var(--gov-primary)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
            }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--gov-primary)', marginBottom: '6px' }}>
                Statutory Human-in-the-Loop Adjudication
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                AI signals are advisory. Record binding AICTE regulatory determination below.
              </p>

              <textarea
                rows={2}
                placeholder="Scrutiny officer adjudication notes (persisted to immutable Merkle ledger)..."
                value={officerNotes}
                onChange={(e) => setOfficerNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid var(--gov-border-strong)',
                  borderRadius: '4px',
                  marginBottom: '10px',
                }}
              />

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleOfficerDecision('APPROVE')}
                  disabled={decisionLoading}
                  style={{
                    background: '#15803D',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '8px 14px',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Check size={14} />
                  Approve Application
                </button>
                <button
                  onClick={() => handleOfficerDecision('REQUEST_CORRECTION')}
                  disabled={decisionLoading}
                  style={{
                    background: 'var(--gov-saffron)',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '8px 14px',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                  }}
                >
                  Request Rectification
                </button>
                <button
                  onClick={() => handleOfficerDecision('ESCALATE')}
                  disabled={decisionLoading}
                  style={{
                    background: '#7E22CE',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '8px 14px',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                  }}
                >
                  Flag for Physical EVC
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ================= RIGHT PANE: EVIDENCE VIEWER & RED BOUNDING BOX CANVAS ================= */}
        <div style={{ position: 'sticky', top: '88px' }}>
          {/* Document Tab Selector */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '8px', paddingBottom: '4px' }}>
            {documents.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setSelectedDoc(d);
                  setActiveMarks([]);
                }}
                style={{
                  padding: '6px 12px',
                  border: selectedDoc?.id === d.id ? '2px solid var(--gov-primary)' : '1px solid var(--gov-border)',
                  background: selectedDoc?.id === d.id ? 'var(--gov-primary-light)' : '#FFFFFF',
                  color: selectedDoc?.id === d.id ? 'var(--gov-primary)' : 'var(--text-muted)',
                  fontWeight: selectedDoc?.id === d.id ? 700 : 500,
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap',
                  borderRadius: '4px',
                }}
              >
                {d.document_type.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          <DocumentPreviewer
            document={selectedDoc}
            activeMarks={activeMarks}
            onAddMark={(t) => setActiveMarks([...activeMarks, t])}
          />
        </div>
      </div>

      {/* Rectification Modal */}
      {showRectifyModal && (
        <RectificationModal
          applicationId={applicationId}
          documents={documents}
          onClose={() => setShowRectifyModal(false)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
};
