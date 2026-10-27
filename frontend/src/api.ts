// Shared API client, types and small formatting helpers.

export type Role = 'applicant' | 'reviewer' | 'official' | 'admin';

export interface User { id: number; email: string; full_name: string; role: Role; institution_id?: number | null; }

export interface Application {
  id: number;
  application_number: string;
  institution_id: number;
  academic_year: string;
  category: string;
  status: string;
  created_at: string;
  declared_data: Record<string, any>;
  validation_summary?: Record<string, any>;
  applicable_checklist?: ChecklistItem[];
  historical_aicte_records?: Record<string, any>;
}

export interface ChecklistItem {
  rule_id: number; document_type: string; rule_name: string; is_mandatory: boolean;
  required_fields: string[]; uploaded: boolean; document_id?: number | null; verification_status?: string | null;
}

export interface Doc {
  id: number; application_id: number; document_type: string; filename: string; mime_type: string;
  file_size_bytes: number; sha256_hash: string; verification_status: string;
  issuing_authority?: string | null; document_urn_or_id?: string | null;
  issue_date?: string | null; expiry_date?: string | null;
  extracted_fields?: Record<string, any>; verification_details?: Record<string, any>;
  uploaded_at?: string;
}

export interface Flag {
  id: number; application_id: number; document_id?: number | null; flag_category: string; severity: string;
  field_name?: string | null; reason: string; evidence_snippet?: string | null; is_advisory: boolean;
  is_resolved: boolean; reviewer_action?: string | null; reviewer_notes?: string | null; created_at: string;
}

export interface Institution { id: number; name: string; aicte_permanent_id: string; state: string; district: string; }

export interface AuditEntry {
  id: number; timestamp: string; action_type: string; entity_type: string; summary: string;
  application_id?: number | null; record_hash: string;
}

const BASE = '/api';

export async function api<T = any>(path: string, token: string | null, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...((opts.headers as Record<string, string>) || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(opts.body instanceof FormData) && opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail ?? j);
    } catch { /* non-JSON error body */ }
    throw new Error(detail);
  }
  return res.json();
}

/** Fetch a protected binary (e.g. page preview) and return an object URL plus response headers. */
export async function apiBlob(path: string, token: string | null): Promise<{ url: string; headers: Headers }> {
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try { detail = (await res.json()).detail || detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  return { url: URL.createObjectURL(await res.blob()), headers: res.headers };
}

export const label = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());

export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

export const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b > 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`);

export function statusTone(s: string): string {
  if (['VERIFIED', 'APPROVED_BY_REVIEWER', 'READY_FOR_REVIEW'].includes(s)) return 'green';
  if (['MISMATCH', 'EXPIRED', 'REJECTED_BY_REVIEWER', 'DEFICIENCY_FLAGGED'].includes(s)) return 'red';
  if (['MANUAL_REVIEW_REQUIRED', 'SOURCE_UNAVAILABLE', 'RECTIFICATION_REQUESTED', 'PENDING_HUMAN_REVIEW'].includes(s)) return 'amber';
  return '';
}

export const STATUS_TEXT: Record<string, string> = {
  VERIFIED: 'Verified',
  MISMATCH: 'Mismatch detected',
  EXPIRED: 'Expired',
  PENDING: 'Verification pending',
  SOURCE_UNAVAILABLE: 'Source unavailable',
  MANUAL_REVIEW_REQUIRED: 'Manual review required',
};

export const DOC_TYPES = [
  'AFFIDAVIT', 'FIRE_SAFETY_CERTIFICATE', 'BUILDING_PLAN_CERTIFICATE', 'LAND_OWNERSHIP_DOCUMENT',
  'PREVIOUS_EOA_LETTER', 'ACCREDITATION_CERTIFICATE', 'FACULTY_ROSTER', 'INFRASTRUCTURE_EVIDENCE',
];

export const CATEGORIES = [
  { value: 'EXTENSION_OF_APPROVAL', label: 'Extension of Approval (EoA)' },
  { value: 'NEW_INSTITUTION', label: 'New technical institution' },
  { value: 'INCREASE_IN_INTAKE', label: 'Increase in approved intake / new course' },
  { value: 'CHANGE_OF_SITE_OR_INFRA', label: 'Change of site / infrastructure' },
];
