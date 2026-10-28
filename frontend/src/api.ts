// API client with token management and real FastAPI endpoints

const API_BASE = 'http://localhost:8000/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('trace_jwt_token');
}

export function setAuthToken(token: string): void {
  localStorage.setItem('trace_jwt_token', token);
}

export function clearAuthToken(): void {
  localStorage.removeItem('trace_jwt_token');
  localStorage.removeItem('trace_user');
}

export function getCurrentUserStored(): any | null {
  const str = localStorage.getItem('trace_user');
  try {
    return str ? JSON.parse(str) : null;
  } catch {
    return null;
  }
}

export function setCurrentUserStored(user: any): void {
  localStorage.setItem('trace_user', JSON.stringify(user));
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Set json content type if body is object and not FormData
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // no json response
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

// Authentication
export async function login(formData: FormData) {
  const res = await fetch(`${API_BASE}/auth/token`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Login failed');
  }
  return res.json();
}

// Dashboard
export async function fetchDashboardMetrics() {
  return apiRequest('/dashboard/metrics');
}

// Applications
export async function fetchApplications() {
  return apiRequest('/applications');
}

export async function fetchApplicationDetail(id: number) {
  return apiRequest(`/applications/${id}`);
}

export async function createApplication(data: any) {
  return apiRequest('/applications', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function submitApplicationRectification(applicationId: number, notes: string, updatedData?: any) {
  return apiRequest(`/applications/${applicationId}/submit-rectification`, {
    method: 'POST',
    body: JSON.stringify({
      applicant_notes: notes,
      updated_declared_data: updatedData,
    }),
  });
}

export async function recordOfficerDecision(applicationId: number, action: string, notes: string) {
  return apiRequest(`/applications/${applicationId}/decision?action=${action}&officer_notes=${encodeURIComponent(notes)}`, {
    method: 'POST',
  });
}

// AI Advisory & RAG
export async function triggerAgentReview(applicationId: number) {
  return apiRequest(`/applications/${applicationId}/agent-review`, {
    method: 'POST',
  });
}

export async function searchHandbookRAG(query: string, nResults: number = 3) {
  return apiRequest(`/rag/search?query=${encodeURIComponent(query)}&n_results=${nResults}`);
}

// Documents
export async function fetchApplicationDocuments(applicationId: number) {
  return apiRequest(`/applications/${applicationId}/documents`);
}

export async function fetchApplicationFlags(applicationId: number) {
  return apiRequest(`/applications/${applicationId}/flags`);
}

export async function uploadDocument(applicationId: number, docType: string, file: File) {
  const formData = new FormData();
  formData.append('application_id', applicationId.toString());
  formData.append('document_type', docType);
  formData.append('file', file);

  return apiRequest('/documents/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function rectifyDocument(documentId: number, file: File) {
  const formData = new FormData();
  formData.append('file', file);

  return apiRequest(`/documents/${documentId}/rectify`, {
    method: 'POST',
    body: formData,
  });
}

export function getDocumentPreviewUrl(documentId: number, page: number = 1, marks: string[] = []): string {
  const token = getAuthToken();
  const url = new URL(`http://localhost:8000/api/documents/${documentId}/preview`);
  url.searchParams.set('page', page.toString());
  marks.forEach(m => {
    if (m && m.trim()) url.searchParams.append('mark', m.trim());
  });
  if (token) {
    url.searchParams.set('token', token); // For preview rendering if token passed
  }
  return url.toString();
}

// Audit Merkle
export async function fetchAuditLogs(limit: number = 50) {
  return apiRequest(`/audit/logs?limit=${limit}`);
}

export async function verifyAuditChain() {
  return apiRequest('/audit/verify-chain');
}

export async function seedGoldenDossiers() {
  return apiRequest('/applications/seed-golden-dossiers', {
    method: 'POST',
  });
}
