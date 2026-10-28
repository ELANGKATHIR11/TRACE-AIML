import React, { useState } from 'react';
import { 
  ShieldCheck, 
  User, 
  Flame, 
  LandPlot, 
  Award,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { DocumentItem } from '../types';

interface AuthorityHubProps {
  documents: DocumentItem[];
  onSelectDocument: (doc: DocumentItem) => void;
}

export const AuthorityHub: React.FC<AuthorityHubProps> = ({ documents, onSelectDocument }) => {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const channels = [
    {
      id: 'STATE_BHULEKH',
      name: 'State Bhulekh / 7-12 Revenue Registry',
      typeMatch: 'LAND_OWNERSHIP_DOCUMENT',
      icon: LandPlot,
      color: 'var(--stat-verified-ink)',
    },
    {
      id: 'FIRE_PORTAL',
      name: 'Directorate of Fire Safety Portal',
      typeMatch: 'FIRE_SAFETY_CERTIFICATE',
      icon: Flame,
      color: 'var(--brand-saffron)',
    },
    {
      id: 'DIGILOCKER_ESTAMP',
      name: 'DigiLocker / NeSL e-Stamp Gateway',
      typeMatch: 'AFFIDAVIT',
      icon: ShieldCheck,
      color: 'var(--brand-navy)',
    },
    {
      id: 'AICTE_NBA_PORTAL',
      name: 'National Board of Accreditation (NBA)',
      typeMatch: 'NBA_ACCREDITATION',
      icon: Award,
      color: 'var(--stat-manual-ink)',
    },
    {
      id: 'FACULTY_REGISTRY',
      name: 'State University Faculty Database',
      typeMatch: 'FACULTY_PROFILE_LIST',
      icon: User,
      color: '#0369A1',
    },
  ];

  return (
    <section 
      aria-label="Statutory issuing authority verification hub"
      style={{
        backgroundColor: '#FFFFFF',
        border: 'var(--border-hairline)',
        borderRadius: 'var(--radius-sm)',
        padding: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--brand-navy)' }}>
            Statutory Issuing Authority Hub
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
            Real-time cross-verification against authorized statutory issuing gateways
          </p>
        </div>
        <span style={{ fontSize: '12px', backgroundColor: 'var(--surface-subtle)', padding: '2px 7px', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
          5 Statutory Channels
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {channels.map((chan) => {
          const doc = documents.find(d => d.document_type === chan.typeMatch);
          const status = doc ? doc.verification_status : 'PENDING';
          const isExpanded = expandedId === doc?.id;
          const Icon = chan.icon;

          return (
            <div
              key={chan.id}
              style={{
                border: 'var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: '#FFFFFF',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '9px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  backgroundColor: isExpanded ? 'var(--surface-subtle)' : '#FFFFFF',
                }}
                onClick={() => doc && setExpandedId(isExpanded ? null : doc.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--surface-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: chan.color,
                  }}>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-primary)' }}>
                      {chan.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                      {doc ? `Certificate: ${doc.filename}` : 'Pending document submission'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <StatusBadge status={status} size="sm" />
                  {doc && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDocument(doc);
                      }}
                      style={{
                        padding: '3px 8px',
                        backgroundColor: 'var(--brand-navy-tint)',
                        border: '1px solid #CBD5E1',
                        color: 'var(--brand-navy)',
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      View
                      <ExternalLink size={11} aria-hidden="true" />
                    </button>
                  )}
                  {isExpanded ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
                </div>
              </div>

              {isExpanded && doc && (
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--surface-subtle)',
                  borderTop: 'var(--border-subtle)',
                  fontSize: '12px',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <span style={{ color: 'var(--ink-muted)', display: 'block', fontSize: '11px' }}>Authority:</span>
                      <strong>{doc.issuing_authority || 'Competent State Authority'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-muted)', display: 'block', fontSize: '11px' }}>Certificate Ref:</span>
                      <strong className="mono">{doc.document_urn_or_id || 'URN-2026-VAL'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-muted)', display: 'block', fontSize: '11px' }}>Issue Date:</span>
                      <strong>{doc.issue_date || 'N/A'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-muted)', display: 'block', fontSize: '11px' }}>Expiry Date:</span>
                      <strong>{doc.expiry_date || 'Perpetual / Active'}</strong>
                    </div>
                  </div>

                  {doc.verification_details && Object.keys(doc.verification_details).length > 0 && (
                    <pre className="mono" style={{ backgroundColor: '#FFFFFF', padding: '6px', border: 'var(--border-subtle)', borderRadius: '2px', fontSize: '11px', overflowX: 'auto' }}>
                      {JSON.stringify(doc.verification_details, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
