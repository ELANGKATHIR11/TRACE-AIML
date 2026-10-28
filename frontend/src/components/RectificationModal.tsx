import React, { useState } from 'react';
import { 
  Upload, 
  FileCheck, 
  AlertTriangle, 
  CheckCircle, 
  RotateCcw, 
  Send,
  Loader2
} from 'lucide-react';
import { rectifyDocument, submitApplicationRectification } from '../api';
import { DocumentItem } from '../types';

interface RectificationModalProps {
  applicationId: number;
  documents: DocumentItem[];
  onClose: () => void;
  onSuccess: () => void;
}

export const RectificationModal: React.FC<RectificationModalProps> = ({
  applicationId,
  documents,
  onClose,
  onSuccess,
}) => {
  const [selectedDocId, setSelectedDocId] = useState<number>(documents[0]?.id || 0);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState<string>('Uploading renewed certificate to clear deficiency.');
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadRectification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !selectedDocId) {
      alert('Please select a file and target document.');
      return;
    }

    setLoading(true);
    setStatusMessage(null);
    try {
      // 1. Rectify the document
      await rectifyDocument(selectedDocId, file);
      // 2. Submit rectification for the entire application
      await submitApplicationRectification(applicationId, notes);
      setStatusMessage('Replacement uploaded and re-verified successfully against Issuing Authority Hub!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      alert(`Rectification failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: 'var(--radius-md)',
        width: '100%',
        maxWidth: '540px',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
        border: '1px solid var(--gov-border)',
      }}>
        <div style={{
          padding: '16px 20px',
          background: 'var(--gov-primary)',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
              Closed-Loop Rectification Intake
            </h3>
            <p style={{ fontSize: '0.75rem', opacity: 0.85 }}>
              Upload replacement certificate to resolve identified deficiencies
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '1.25rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleUploadRectification} style={{ padding: '20px' }}>
          {statusMessage && (
            <div style={{
              background: '#DCFCE7',
              color: '#15803D',
              padding: '10px',
              borderRadius: '4px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <CheckCircle size={16} />
              {statusMessage}
            </div>
          )}

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
              Select Flagged Document to Replace:
            </label>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid var(--gov-border-strong)',
                borderRadius: '4px',
              }}
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.document_type.replace(/_/g, ' ')} — {d.filename} ({d.verification_status})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
              Upload Valid / Renewed File (PDF / PNG):
            </label>
            <div style={{
              border: '2px dashed var(--gov-border-strong)',
              borderRadius: '6px',
              padding: '20px',
              textAlign: 'center',
              background: 'var(--gov-surface-subtle)',
              cursor: 'pointer',
            }}>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleFileChange}
                style={{ display: 'block', width: '100%' }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '8px' }}>
                At-rest AES-256-GCM encryption will be applied automatically upon ingestion.
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
              Applicant Rectification Remarks:
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Attached renewed Fire NOC MH-FIRE-2026-8821 valid till 2027..."
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid var(--gov-border-strong)',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#FFFFFF',
                border: '1px solid var(--gov-border-strong)',
                padding: '8px 16px',
                fontSize: '0.8125rem',
                fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !file}
              style={{
                background: 'var(--gov-primary)',
                color: '#FFFFFF',
                border: 'none',
                padding: '8px 18px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {loading ? 'Processing Re-Verification...' : 'Submit & Re-Verify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
