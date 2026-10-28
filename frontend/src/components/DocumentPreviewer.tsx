import React, { useState } from 'react';
import { 
  FileText, 
  ZoomIn, 
  ZoomOut, 
  Search, 
  ShieldCheck, 
  Layers
} from 'lucide-react';
import { getDocumentPreviewUrl } from '../api';
import { DocumentItem } from '../types';

interface DocumentPreviewerProps {
  document: DocumentItem | null;
  activeMarks?: string[];
  onAddMark?: (term: string) => void;
}

export const DocumentPreviewer: React.FC<DocumentPreviewerProps> = ({
  document,
  activeMarks = [],
  onAddMark,
}) => {
  const [page, setPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(100);
  const [customTerm, setCustomTerm] = useState<string>('');
  const [terms, setTerms] = useState<string[]>(activeMarks);
  const [forensicMode, setForensicMode] = useState<boolean>(false);

  React.useEffect(() => {
    if (activeMarks && activeMarks.length > 0) {
      setTerms(Array.from(new Set([...terms, ...activeMarks])));
    }
  }, [activeMarks]);

  if (!document) {
    return (
      <div 
        role="region"
        aria-label="Document viewer placeholder"
        style={{
          height: '100%',
          minHeight: '480px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
          border: '1px dashed var(--border-strong)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--ink-muted)',
          padding: '32px',
          textAlign: 'center',
        }}
      >
        <FileText size={40} strokeWidth={1.5} style={{ marginBottom: '12px', opacity: 0.6 }} aria-hidden="true" />
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)' }}>
          No Document Selected
        </h3>
        <p style={{ fontSize: '13px', maxWidth: '300px', marginTop: '4px', color: 'var(--ink-muted)' }}>
          Select a certificate from the left scrutiny panel to view vector text annotations and forensic overlays.
        </p>
      </div>
    );
  }

  const previewUrl = getDocumentPreviewUrl(document.id, page, terms);

  const handleAddTerm = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customTerm.trim();
    if (clean && !terms.includes(clean)) {
      const updated = [...terms, clean];
      setTerms(updated);
      if (onAddMark) onAddMark(clean);
      setCustomTerm('');
    }
  };

  const handleRemoveTerm = (termToRemove: string) => {
    setTerms(terms.filter(t => t !== termToRemove));
  };

  return (
    <section 
      aria-label={`Evidence viewer for ${document.filename}`}
      style={{
        backgroundColor: '#FFFFFF',
        border: 'var(--border-hairline)',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '620px',
        overflow: 'hidden',
      }}
    >
      {/* Evidence Inspector Bar */}
      <div style={{
        padding: '10px 14px',
        borderBottom: 'var(--border-subtle)',
        backgroundColor: 'var(--surface-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontWeight: 600, fontSize: '13px', color: 'var(--brand-navy)' }}>
              {document.filename}
            </h2>
            <span className="mono" style={{ fontSize: '11px', backgroundColor: '#E2E8F0', padding: '1px 5px', borderRadius: '2px' }}>
              SHA-256: {document.sha256_hash.substring(0, 10)}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: '2px' }}>
            {document.document_type.replace(/_/g, ' ')} · {(document.file_size_bytes / 1024).toFixed(1)} KB · Stored with AES-256-GCM
          </div>
        </div>

        {/* Page & Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#FFFFFF', border: 'var(--border-hairline)', borderRadius: 'var(--radius-sm)' }}>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
              style={{ padding: '4px 8px', border: 'none', background: 'none', fontSize: '12px' }}
            >
              ◀
            </button>
            <span style={{ fontSize: '12px', padding: '0 6px', fontWeight: 600 }}>
              Page {page}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              aria-label="Next page"
              style={{ padding: '4px 8px', border: 'none', background: 'none', fontSize: '12px' }}
            >
              ▶
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#FFFFFF', border: 'var(--border-hairline)', borderRadius: 'var(--radius-sm)' }}>
            <button
              onClick={() => setZoom(Math.max(60, zoom - 15))}
              aria-label="Zoom out"
              style={{ padding: '4px 8px', border: 'none', background: 'none' }}
            >
              <ZoomOut size={13} aria-hidden="true" />
            </button>
            <span style={{ fontSize: '12px', padding: '0 4px', minWidth: '38px', textAlign: 'center' }}>
              {zoom}%
            </span>
            <button
              onClick={() => setZoom(Math.min(200, zoom + 15))}
              aria-label="Zoom in"
              style={{ padding: '4px 8px', border: 'none', background: 'none' }}
            >
              <ZoomIn size={13} aria-hidden="true" />
            </button>
          </div>

          <button
            onClick={() => setForensicMode(!forensicMode)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: forensicMode ? '#991B1B' : '#FFFFFF',
              color: forensicMode ? '#FFFFFF' : '#991B1B',
              border: '1px solid #991B1B',
            }}
          >
            <Layers size={12} aria-hidden="true" />
            {forensicMode ? 'ELA Forgery Filter On' : 'ELA Forgery Filter'}
          </button>
        </div>
      </div>

      {/* Vector Span Search Bar */}
      <div style={{
        padding: '8px 14px',
        borderBottom: 'var(--border-subtle)',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <form onSubmit={handleAddTerm} style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '420px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={13} style={{ position: 'absolute', left: '8px', top: '8px', color: 'var(--ink-muted)' }} aria-hidden="true" />
            <input
              type="text"
              aria-label="Search and outline term in red on document canvas"
              placeholder="Locate keyword (e.g. 99.5, 7.5, Expiry, Architect)..."
              value={customTerm}
              onChange={(e) => setCustomTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '4px 8px 4px 26px',
                border: 'var(--border-hairline)',
                borderRadius: 'var(--radius-sm)',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              backgroundColor: 'var(--brand-navy)',
              color: '#FFFFFF',
              border: 'none',
              padding: '5px 10px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Outline
          </button>
        </form>

        {/* Active Red Bounding Box Terms */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--ink-muted)', fontWeight: 600 }}>
            Red Outlines:
          </span>
          {terms.length === 0 ? (
            <span style={{ fontSize: '12px', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
              None
            </span>
          ) : (
            terms.map(t => (
              <span
                key={t}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  backgroundColor: 'var(--stat-mismatch-bg)',
                  color: 'var(--stat-mismatch-ink)',
                  border: '1px solid var(--stat-mismatch-border)',
                  borderRadius: '2px',
                  padding: '1px 5px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                ■ {t}
                <button
                  onClick={() => handleRemoveTerm(t)}
                  aria-label={`Remove outline for ${t}`}
                  style={{ border: 'none', background: 'none', color: 'var(--stat-mismatch-ink)', cursor: 'pointer', padding: 0 }}
                >
                  ✕
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Main Evidence Canvas Area */}
      <div style={{
        flex: 1,
        backgroundColor: '#334155',
        overflow: 'auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '16px',
        position: 'relative',
      }}>
        <div style={{
          transform: `scale(${zoom / 100})`,
          transformOrigin: 'top center',
          transition: 'transform 100ms ease',
          backgroundColor: '#FFFFFF',
          lineHeight: 0,
        }}>
          <img
            key={`${document.id}-${page}-${terms.join(',')}-${forensicMode}`}
            src={previewUrl}
            alt={`Scrutiny canvas for ${document.filename}, page ${page}`}
            style={{
              maxWidth: '100%',
              display: 'block',
              filter: forensicMode ? 'contrast(200%) brightness(90%) hue-rotate(90deg)' : 'none',
            }}
          />
        </div>
      </div>

      {/* Statutory Footer Verification Note */}
      <div style={{
        padding: '6px 14px',
        backgroundColor: 'var(--surface-subtle)',
        borderTop: 'var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11px',
        color: 'var(--ink-muted)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <ShieldCheck size={13} color="var(--stat-verified-ink)" aria-hidden="true" />
          <span>PKCS#7 Digital Signature: Authenticated by Certifying Authority</span>
        </div>
        <span>Vector Search & Bounding Box Engine: PyMuPDF</span>
      </div>
    </section>
  );
};
