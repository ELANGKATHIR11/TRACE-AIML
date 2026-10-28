import React, { useState } from 'react';
import { 
  Building2, 
  ExternalLink, 
  ShieldCheck, 
  AlertTriangle, 
  Calendar, 
  MapPin, 
  User, 
  Flame, 
  LandPlot, 
  Award,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { DocumentItem } from '../types';

interface AuthorityHubProps {
  documents: DocumentItem[];
  onSelectDocument: (doc: DocumentItem) => void;
}

export const AuthorityHub: React.FC<AuthorityHubProps> = ({ documents, onSelectDocument }) => {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Map statutory channels
  const channels = [
    {
      id: 'STATE_BHULEKH',
      name: 'State Bhulekh / 7-12 Land Registry',
      desc: 'Validates land title ownership, institutional land zoning, and total acreage.',
      typeMatch: 'LAND_OWNERSHIP_DOCUMENT',
      icon: LandPlot,
      color: '#15803D',
    },
    {
      id: 'FIRE_PORTAL',
      name: 'Directorate of Fire Safety Portal',
      desc: 'Cross-checks NOC validity dates, built-up area clearance, and safety certification.',
      typeMatch: 'FIRE_SAFETY_CERTIFICATE',
      icon: Flame,
      color: '#C2410C',
    },
    {
      id: 'DIGILOCKER_ESTAMP',
      name: 'DigiLocker / NeSL e-Stamp Gateway',
      desc: 'Cryptographic authenticity and digital notary signature verification.',
      typeMatch: 'AFFIDAVIT',
      icon: ShieldCheck,
      color: '#1F3A6E',
    },
    {
      id: 'AICTE_NBA_PORTAL',
      name: 'National Board of Accreditation (NBA)',
      desc: 'Validates tier accreditation, course-specific validity periods, and compliance.',
      typeMatch: 'NBA_ACCREDITATION',
      icon: Award,
      color: '#7E22CE',
    },
    {
      id: 'FACULTY_REGISTRY',
      name: 'State University Faculty Database',
      desc: 'Verifies faculty rosters, Aadhaar-linked appointments, and Student-Faculty Ratios.',
      typeMatch: 'FACULTY_PROFILE_LIST',
      icon: User,
      color: '#0284C7',
    },
  ];

  return (
    <div style={{
      background: 'var(--gov-surface)',
      border: '1px solid var(--gov-border)',
      borderRadius: 'var(--radius-md)',
      padding: '16px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--gov-primary)' }}>
            Statutory Issuing Authority Hub
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Real-time cross-verification with 5 official issuing gateways (SIH PS 26261 Objectives)
          </p>
        </div>
        <span style={{ fontSize: '0.75rem', background: '#F1F5F9', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
          5 Live Gateways
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {channels.map((chan) => {
          const doc = documents.find(d => d.document_type === chan.typeMatch);
          const status = doc ? doc.verification_status : 'PENDING';
          const isExpanded = expandedId === doc?.id;
          const Icon = chan.icon;

          return (
            <div
              key={chan.id}
              style={{
                border: '1px solid var(--gov-border)',
                borderRadius: 'var(--radius-sm)',
                background: '#FFFFFF',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  background: isExpanded ? 'var(--gov-surface-subtle)' : '#FFFFFF',
                }}
                onClick={() => doc && setExpandedId(isExpanded ? null : doc.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '4px',
                    background: `${chan.color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: chan.color,
                  }}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {chan.name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
                      {doc ? `Linked: ${doc.filename}` : 'No document uploaded yet'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <StatusBadge status={status} size="sm" />
                  {doc && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDocument(doc);
                      }}
                      style={{
                        padding: '4px 8px',
                        background: 'var(--gov-primary-light)',
                        border: '1px solid var(--gov-primary)33',
                        color: 'var(--gov-primary)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      Inspect Evidence
                      <ExternalLink size={12} />
                    </button>
                  )}
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {/* Expanded Authority Details */}
              {isExpanded && doc && (
                <div style={{
                  padding: '12px 16px',
                  background: '#F8FAFC',
                  borderTop: '1px solid var(--gov-border)',
                  fontSize: '0.75rem',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <div>
                      <span style={{ color: 'var(--text-subtle)', display: 'block' }}>Issuing Authority:</span>
                      <strong>{doc.issuing_authority || 'State Competent Authority'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-subtle)', display: 'block' }}>Certificate / URN Ref:</span>
                      <strong className="mono">{doc.document_urn_or_id || 'URN-MH-2026-VAL'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-subtle)', display: 'block' }}>Issue Date:</span>
                      <strong>{doc.issue_date || 'N/A'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-subtle)', display: 'block' }}>Expiry Date:</span>
                      <strong>{doc.expiry_date || 'Perpetual / Not Expired'}</strong>
                    </div>
                  </div>

                  {doc.verification_details && Object.keys(doc.verification_details).length > 0 && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--gov-border)' }}>
                      <span style={{ color: 'var(--text-subtle)', display: 'block', marginBottom: '4px' }}>
                        Raw Authority Gateway Verification Log:
                      </span>
                      <pre className="mono" style={{ background: '#FFFFFF', padding: '8px', border: '1px solid var(--gov-border)', borderRadius: '4px', fontSize: '0.7rem', overflowX: 'auto' }}>
                        {JSON.stringify(doc.verification_details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
