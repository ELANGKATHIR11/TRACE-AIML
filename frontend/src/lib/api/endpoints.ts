/**
 * Typed endpoint layer. Every function wraps `apiRequest` and maps the backend's response to the
 * shape the existing components read (spec §7.1), so component changes stay minimal.
 *
 * The normalisers accept `unknown`-ish backend payloads and never invent values: a field the backend
 * did not send stays undefined.
 */
import { broadcastLogout } from './cacheSync';
import { apiRequest, getApiBaseUrl, refreshSessionShared, setAccessToken } from './transport';
import type {
  AdminUserCreate,
  AdminUserUpdate,
  AgentReviewResponse,
  ApplicationCreateRequest,
  ApplicationDetailRecord,
  ApplicationRecord,
  AuditLogEntry,
  AuthorityVerificationRecord,
  ChainVerificationResponse,
  ComplianceFlag,
  DashboardMetricsResponse,
  DecisionRequest,
  DecisionResponse,
  DocumentPreviewMetadataResponse,
  DocumentRecord,
  ElaAnalysisResponse,
  Institution,
  LoginResponse,
  ModelRegistryItem,
  RectificationSubmitRequest,
  RectificationSubmitResponse,
  User,
} from '../../types/api';

type Raw = Record<string, unknown>;
type Id = string | number;

function asRecord(v: unknown): Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// ---------------------------------------------------------------------------
// Normalisers
// ---------------------------------------------------------------------------

/** ValidationFlag row → the flag shape the scrutiny and rectification pages read. */
export function normalizeFlag(raw: unknown): ComplianceFlag {
  const r = asRecord(raw);
  return {
    ...r,
    id: r.id as Id,
    description: r.reason as string | undefined,
    finding_type: r.flag_category as string | undefined,
    page: r.page_number as number | undefined,
    source_document_id: r.document_id as Id | undefined,
  } as ComplianceFlag;
}

/** DocumentRead → DocumentRecord (`file_size_bytes` → `file_size`). */
export function normalizeDocument(raw: unknown): DocumentRecord {
  const r = asRecord(raw);
  return { ...r, id: r.id as Id, file_size: r.file_size_bytes as number | undefined } as DocumentRecord;
}

/** Application / ApplicationDetailResponse → record with `declared_data` flattened. */
export function normalizeApplication(raw: unknown): ApplicationDetailRecord {
  const r = asRecord(raw);
  const declared = asRecord(r.declared_data);
  const out: Raw = {
    ...r,
    land_area_acres: declared.land_area_acres,
    built_up_area_sqm: declared.built_up_area_sqm,
    total_intake: declared.total_intake,
    faculty_count: declared.faculty_count,
  };
  if (Array.isArray(r.documents)) out.documents = r.documents.map(normalizeDocument);
  return out as unknown as ApplicationDetailRecord;
}

/** AuditLog row → entry shape the audit page reads. */
export function normalizeAuditEntry(raw: unknown): AuditLogEntry {
  const r = asRecord(raw);
  return {
    ...r,
    id: r.id as Id,
    action: (r.action_type ?? r.action) as string,
    current_hash: (r.record_hash ?? r.current_hash) as string | null | undefined,
    previous_hash: (r.prev_hash ?? r.previous_hash) as string | null | undefined,
  } as AuditLogEntry;
}

/** `{status: "INTACT"|"BROKEN", …}` → response with the boolean `valid` the page reads. */
export function normalizeChain(raw: unknown): ChainVerificationResponse {
  const r = asRecord(raw);
  return { ...r, valid: r.status === 'INTACT' } as ChainVerificationResponse;
}

/** DocumentUploadResponse → the document record the intake and rectification pages list. */
function normalizeUploadResponse(raw: unknown): DocumentRecord {
  const r = asRecord(raw);
  const { document_id, message: _message, ...rest } = r;
  return { ...rest, id: (r.id ?? document_id) as Id } as DocumentRecord;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function fetchDashboardMetrics(signal?: AbortSignal): Promise<DashboardMetricsResponse> {
  return apiRequest<DashboardMetricsResponse>('/api/dashboard/metrics', { signal });
}

export function fetchModelRegistry(signal?: AbortSignal): Promise<ModelRegistryItem[]> {
  return apiRequest<ModelRegistryItem[]>('/api/dashboard/models', { signal });
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function fetchApplications(
  params?: { institution_id?: number },
  signal?: AbortSignal,
): Promise<ApplicationRecord[]> {
  const query = new URLSearchParams();
  if (params?.institution_id !== undefined) {
    query.set('institution_id', String(params.institution_id));
  }
  const qs = query.toString();
  const rows = await apiRequest<unknown[]>(`/api/applications${qs ? `?${qs}` : ''}`, { signal });
  return asArray(rows).map(normalizeApplication);
}

export async function fetchApplicationDetail(
  id: Id,
  signal?: AbortSignal,
): Promise<ApplicationDetailRecord> {
  return normalizeApplication(await apiRequest<unknown>(`/api/applications/${id}`, { signal }));
}

export async function fetchApplicationFlags(id: Id, signal?: AbortSignal): Promise<ComplianceFlag[]> {
  const rows = await apiRequest<unknown[]>(`/api/applications/${id}/flags`, { signal });
  return asArray(rows).map(normalizeFlag);
}

export function fetchAuthorityVerifications(
  id: Id,
  signal?: AbortSignal,
): Promise<AuthorityVerificationRecord[]> {
  return apiRequest<AuthorityVerificationRecord[]>(`/api/applications/${id}/verifications`, {
    signal,
  });
}

export async function createApplication(
  payload: ApplicationCreateRequest,
): Promise<ApplicationDetailRecord> {
  const body = {
    category: payload.category,
    academic_year: payload.academic_year,
    declared_data: payload.declared_data,
  };
  return normalizeApplication(
    await apiRequest<unknown>('/api/applications', { method: 'POST', body }),
  );
}

export async function submitApplication(id: Id): Promise<ApplicationDetailRecord> {
  return normalizeApplication(
    await apiRequest<unknown>(`/api/applications/${id}/submit`, { method: 'POST' }),
  );
}

export function submitApplicationRectification(
  id: Id,
  payload: RectificationSubmitRequest,
): Promise<RectificationSubmitResponse> {
  return apiRequest<RectificationSubmitResponse>(`/api/applications/${id}/submit-rectification`, {
    method: 'POST',
    body: { notes: payload.notes ?? '', amended: payload.amended ?? {} },
  });
}

export function validateApplication(id: Id): Promise<{ message: string; result: unknown }> {
  return apiRequest<{ message: string; result: unknown }>(`/api/applications/${id}/validate`, {
    method: 'POST',
  });
}

export function triggerAgentReview(id: Id): Promise<AgentReviewResponse> {
  return apiRequest<AgentReviewResponse>(`/api/applications/${id}/agent-review`, {
    method: 'POST',
  });
}

export function submitOfficerDecision(
  id: Id,
  payload: DecisionRequest,
): Promise<DecisionResponse> {
  return apiRequest<DecisionResponse>(`/api/applications/${id}/decision`, {
    method: 'POST',
    body: { decision: payload.decision, notes: payload.notes },
  });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadApplicationDocument(args: {
  applicationId: Id;
  documentType: string;
  file: File;
}): Promise<DocumentRecord> {
  const formData = new FormData();
  formData.append('application_id', String(args.applicationId));
  formData.append('document_type', args.documentType);
  formData.append('file', args.file);
  return normalizeUploadResponse(
    await apiRequest<unknown>('/api/documents/upload', { method: 'POST', formData }),
  );
}

/** Replace a document during rectification. The backend takes only the file (no notes). */
export async function rectifyDocument(args: {
  documentId: Id;
  file: File;
  notes?: string;
}): Promise<DocumentRecord> {
  const formData = new FormData();
  formData.append('file', args.file);
  return normalizeUploadResponse(
    await apiRequest<unknown>(`/api/documents/${args.documentId}/rectify`, {
      method: 'POST',
      formData,
    }),
  );
}

export async function fetchDocumentMetadata(id: Id, signal?: AbortSignal): Promise<DocumentRecord> {
  return normalizeDocument(await apiRequest<unknown>(`/api/documents/${id}`, { signal }));
}

export interface DocumentPreviewResult {
  mode: 'binary' | 'json';
  blob?: Blob;
  contentType?: string;
  requestUrl: string;
  jsonPayload?: DocumentPreviewMetadataResponse;
}

/**
 * The backend always streams the document bytes. `page`/`marks` are accepted for the existing call
 * site but the server renders no per-page overlays, so they are not sent.
 */
export async function fetchDocumentPreview(
  id: Id,
  opts: { page?: number; marks?: string[]; signal?: AbortSignal } = {},
): Promise<DocumentPreviewResult> {
  const path = `/api/documents/${id}/preview`;
  const blob = await apiRequest<Blob>(path, { responseType: 'blob', signal: opts.signal });
  return {
    mode: 'binary',
    blob,
    contentType: blob.type || undefined,
    requestUrl: `${getApiBaseUrl()}${path}`,
  };
}

export function fetchDocumentElaAnalysis(id: Id, signal?: AbortSignal): Promise<ElaAnalysisResponse> {
  return apiRequest<ElaAnalysisResponse>(`/api/documents/${id}/ela`, { signal });
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export async function fetchAuditLogs(signal?: AbortSignal): Promise<AuditLogEntry[]> {
  const rows = await apiRequest<unknown[]>('/api/audit/logs', { signal });
  return asArray(rows).map(normalizeAuditEntry);
}

export async function verifyAuditChain(): Promise<ChainVerificationResponse> {
  return normalizeChain(await apiRequest<unknown>('/api/audit/verify-chain'));
}

// ---------------------------------------------------------------------------
// Session & identity
// ---------------------------------------------------------------------------

/** The login route is OAuth2 form-based: `username` carries the email address. */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const formData = new FormData();
  formData.append('username', email);
  formData.append('password', password);
  const session = await apiRequest<LoginResponse>('/api/auth/login', { method: 'POST', formData });
  setAccessToken(session.access_token);
  return session;
}

/** Single-flight refresh shared with the transport; null when the session is over. */
export async function refreshSession(): Promise<LoginResponse | null> {
  return (await refreshSessionShared()) as LoginResponse | null;
}

/** Ends the session locally and in other tabs even if the server call fails. */
export async function logout(): Promise<void> {
  try {
    await apiRequest<void>('/api/auth/logout', { method: 'POST' });
  } catch {
    // The local session ends regardless; the refresh cookie expires server-side on its own.
  } finally {
    setAccessToken(null);
    broadcastLogout();
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<LoginResponse> {
  const session = await apiRequest<LoginResponse>('/api/auth/change-password', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
  });
  setAccessToken(session.access_token);
  return session;
}

export function fetchMe(signal?: AbortSignal): Promise<User> {
  return apiRequest<User>('/api/auth/me', { signal });
}

// ---------------------------------------------------------------------------
// Admin & institutions
// ---------------------------------------------------------------------------

export function listUsers(signal?: AbortSignal): Promise<User[]> {
  return apiRequest<User[]>('/api/admin/users', { signal });
}

export function createUser(payload: AdminUserCreate): Promise<User> {
  return apiRequest<User>('/api/admin/users', { method: 'POST', body: payload });
}

export function updateUser(id: number, payload: AdminUserUpdate): Promise<User> {
  return apiRequest<User>(`/api/admin/users/${id}`, { method: 'PATCH', body: payload });
}

export function fetchInstitutions(signal?: AbortSignal): Promise<Institution[]> {
  return apiRequest<Institution[]>('/api/institutions', { signal });
}
