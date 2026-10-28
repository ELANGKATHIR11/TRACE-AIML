import React, { useState } from 'react';
import { 
  Upload, 
  FilePlus, 
  CheckCircle, 
  AlertCircle, 
  Building, 
  FileText,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';
import { createApplication, uploadDocument } from '../api';

interface ManualApplicationIntakeProps {
  onApplicationCreated: (appId: number) => void;
}

export const ManualApplicationIntake: React.FC<ManualApplicationIntakeProps> = ({
  onApplicationCreated,
}) => {
  const [category, setCategory] = useState('EOA');
  const [academicYear, setAcademicYear] = useState('2026-27');
  const [landAcres, setLandAcres] = useState('7.5');
  const [builtUpSqm, setBuiltUpSqm] = useState('14800');
  const [intake, setIntake] = useState('420');
  const [facultyCount, setFacultyCount] = useState('32');

  const [createdAppId, setCreatedAppId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // File upload state for documents
  const [docType, setDocType] = useState('LAND_OWNERSHIP_DOCUMENT');
  const [file, setFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        institution_id: 1, // Apex Institute of Engineering default demo
        academic_year: academicYear,
        category: category,
        declared_data: {
          land_area_acres: parseFloat(landAcres) || 7.5,
          total_built_up_area_sqm: parseFloat(builtUpSqm) || 14800,
          approved_intake_total: parseInt(intake) || 420,
          total_faculty_count: parseInt(facultyCount) || 32,
        },
      };

      const res = await createApplication(payload);
      setCreatedAppId(res.id);
    } catch (err: any) {
      alert(`Application intake failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdAppId || !file) return;

    setUploadLoading(true);
    try {
      const res = await uploadDocument(createdAppId, docType, file);
      setUploadedFiles([...uploadedFiles, `${res.filename} (${res.verification_status})`]);
      setFile(null);
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  return (
    <div style={{
      background: 'var(--gov-surface)',
      border: '1px solid var(--gov-border)',
      borderRadius: 'var(--radius-md)',
      padding: '24px',
      maxWidth: '800px',
      margin: '0 auto',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ borderBottom: '1px solid var(--gov-border)', paddingBottom: '16px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--gov-primary)' }}>
          Step 1: Institutional Application & Document Intake
        </h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Submit declared statutory metrics and upload supporting evidentiary certificates for AI verification.
        </p>
      </div>

      {!createdAppId ? (
        <form onSubmit={handleCreateApplication}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
                Application Category:
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--gov-border-strong)', borderRadius: '4px' }}
              >
                <option value="EOA">Extension of Approval (EoA)</option>
                <option value="NEW_INSTITUTION">Setting up New Technical Institution</option>
                <option value="INTAKE_VARIATION">Increase / Variation in Intake</option>
                <option value="COURSE_ADDITION">Introduction of New Courses</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
                Academic Year:
              </label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--gov-border-strong)', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
                Declared Land Area (Acres):
              </label>
              <input
                type="number"
                step="0.1"
                value={landAcres}
                onChange={(e) => setLandAcres(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--gov-border-strong)', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
                Declared Built-up Area (sqm):
              </label>
              <input
                type="number"
                value={builtUpSqm}
                onChange={(e) => setBuiltUpSqm(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--gov-border-strong)', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
                Total Approved Intake:
              </label>
              <input
                type="number"
                value={intake}
                onChange={(e) => setIntake(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--gov-border-strong)', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
                Total Faculty Count:
              </label>
              <input
                type="number"
                value={facultyCount}
                onChange={(e) => setFacultyCount(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--gov-border-strong)', borderRadius: '4px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                background: 'var(--gov-primary)',
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 20px',
                fontSize: '0.875rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <FilePlus size={16} />
              {loading ? 'Initializing Application...' : 'Create & Proceed to Document Upload'}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <div style={{
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534' }}>
              <CheckCircle size={18} />
              <span>Application Initialized: <strong>App #{createdAppId}</strong></span>
            </div>
            <button
              onClick={() => onApplicationCreated(createdAppId)}
              style={{
                background: '#15803D',
                color: '#FFFFFF',
                border: 'none',
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Open Scrutiny Cockpit
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Document Upload Subsection */}
          <form onSubmit={handleUploadDoc} style={{ background: 'var(--gov-surface-subtle)', padding: '16px', borderRadius: '6px' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px' }}>
              Upload Supporting Documents (PDF / PNG / JPEG):
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                  Document Type:
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  style={{ width: '100%', padding: '6px', border: '1px solid var(--gov-border)', borderRadius: '4px' }}
                >
                  <option value="LAND_OWNERSHIP_DOCUMENT">Land Ownership / 7-12 Deed</option>
                  <option value="FIRE_SAFETY_CERTIFICATE">Fire Safety NOC</option>
                  <option value="BUILDING_PLAN_AND_APPROVAL">Building Plan & Stability</option>
                  <option value="AFFIDAVIT">Institutional Affidavit</option>
                  <option value="NBA_ACCREDITATION">NBA Accreditation Certificate</option>
                  <option value="FACULTY_PROFILE_LIST">Faculty Roster List</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                  Choose File:
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => e.target.files && setFile(e.target.files[0])}
                  style={{ width: '100%', fontSize: '0.75rem' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={uploadLoading || !file}
              style={{
                background: 'var(--gov-primary)',
                color: '#FFFFFF',
                border: 'none',
                padding: '6px 14px',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Upload size={13} />
              {uploadLoading ? 'Uploading & Encrypting...' : 'Upload Document'}
            </button>
          </form>

          {/* Uploaded List */}
          {uploadedFiles.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-subtle)' }}>
                Ingested Documents ({uploadedFiles.length}):
              </span>
              <ul style={{ fontSize: '0.8125rem', marginTop: '6px', paddingLeft: '18px' }}>
                {uploadedFiles.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
