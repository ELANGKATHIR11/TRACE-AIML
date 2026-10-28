import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBroadcastChannel } from '../../test/fakeBroadcastChannel';

vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

import { getAccessToken, setAccessToken } from './transport';
import {
  createApplication,
  fetchApplicationDetail,
  fetchApplicationFlags,
  fetchApplications,
  fetchAuditLogs,
  fetchDocumentPreview,
  login,
  logout,
  normalizeApplication,
  normalizeAuditEntry,
  normalizeChain,
  normalizeFlag,
  refreshSession,
  submitApplicationRectification,
  submitOfficerDecision,
  uploadApplicationDocument,
} from './endpoints';
import { OfficerDecisionType } from '../../types/api';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  FakeBroadcastChannel.posted = [];
  setAccessToken(null);
});

const url = (i = 0) => String(fetchMock.mock.calls[i][0]);
const init = (i = 0) => fetchMock.mock.calls[i][1] as RequestInit;

describe('normalisers', () => {
  it('normalizeFlag maps backend names to the names components read', () => {
    const flag = normalizeFlag({
      id: 7,
      application_id: 3,
      document_id: 11,
      rule_id: 2,
      flag_category: 'CONSISTENCY',
      severity: 'HIGH',
      field_name: 'land_area_acres',
      reason: 'Declared land area exceeds the deed',
      evidence_snippet: 'Area: 4.2 acres',
      page_number: 2,
      is_advisory: false,
      is_resolved: false,
      created_at: '2026-10-01T10:00:00',
    });
    expect(flag).toMatchObject({
      id: 7,
      description: 'Declared land area exceeds the deed',
      finding_type: 'CONSISTENCY',
      page: 2,
      source_document_id: 11,
      document_id: 11,
      severity: 'HIGH',
      evidence_snippet: 'Area: 4.2 acres',
    });
  });

  it('normalizeApplication flattens declared_data and normalises documents', () => {
    const app = normalizeApplication({
      id: 5,
      application_number: 'AICTE-2026-EOA-0005',
      institution_id: 1,
      institution_name: 'Test Institute',
      academic_year: '2026-27',
      category: 'EOA',
      status: 'SUBMITTED',
      declared_data: {
        land_area_acres: 4.5,
        built_up_area_sqm: 12000,
        total_intake: 180,
        faculty_count: 40,
      },
      validation_summary: {},
      created_at: '2026-10-01T10:00:00',
      updated_at: '2026-10-02T10:00:00',
      applicable_checklist: [],
      historical_aicte_records: {},
      documents: [
        {
          id: 9,
          application_id: 5,
          document_type: 'LAND_DEED',
          filename: 'deed.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: 2048,
          verification_status: 'VERIFIED',
          uploaded_at: '2026-10-01T10:05:00',
        },
      ],
      decisions: [],
      latest_decision: null,
    });
    expect(app).toMatchObject({
      id: 5,
      land_area_acres: 4.5,
      built_up_area_sqm: 12000,
      total_intake: 180,
      faculty_count: 40,
      institution_name: 'Test Institute',
    });
    expect(app.documents?.[0]).toMatchObject({ id: 9, file_size: 2048, filename: 'deed.pdf' });
  });

  it('normalizeApplication tolerates an empty declared_data', () => {
    const app = normalizeApplication({ id: 1, status: 'DRAFT', declared_data: {} });
    expect(app.land_area_acres).toBeUndefined();
    expect(app.total_intake).toBeUndefined();
  });

  it('normalizeAuditEntry maps action_type and the hash pair', () => {
    const entry = normalizeAuditEntry({
      id: 4,
      timestamp: '2026-10-01T10:00:00+00:00',
      actor_role: 'reviewer',
      action_type: 'DECISION_RECORDED',
      entity_type: 'Application',
      entity_id: 'AICTE-1',
      prev_hash: 'aaa',
      record_hash: 'bbb',
    });
    expect(entry).toMatchObject({
      id: 4,
      action: 'DECISION_RECORDED',
      previous_hash: 'aaa',
      current_hash: 'bbb',
      actor_role: 'reviewer',
    });
  });

  it('normalizeChain maps INTACT to valid:true and BROKEN to valid:false', () => {
    const intact = normalizeChain({
      status: 'INTACT',
      verified_count: 12,
      latest_hash: 'abc',
      broken_at_id: null,
      algorithm: 'HMAC-SHA256',
      verified_at: '2026-10-01T10:00:00+00:00',
    });
    expect(intact).toMatchObject({ valid: true, verified_count: 12, algorithm: 'HMAC-SHA256' });
    const broken = normalizeChain({ status: 'BROKEN', verified_count: 3, broken_at_id: 4 });
    expect(broken).toMatchObject({ valid: false, broken_at_id: 4 });
  });
});

describe('endpoint requests', () => {
  it('createApplication posts exactly {category, academic_year, declared_data}', async () => {
    fetchMock.mockResolvedValueOnce(
      json(201, { id: 1, status: 'DRAFT', declared_data: { total_intake: 60 } }),
    );
    const created = await createApplication({
      category: 'EOA',
      academic_year: '2026-27',
      declared_data: { total_intake: 60 },
    });
    expect(url()).toBe('/fastapi-proxy/api/applications');
    expect(init().method).toBe('POST');
    expect(JSON.parse(init().body as string)).toEqual({
      category: 'EOA',
      academic_year: '2026-27',
      declared_data: { total_intake: 60 },
    });
    expect(created.total_intake).toBe(60);
  });

  it('uploadApplicationDocument posts FormData with application_id, document_type, file', async () => {
    fetchMock.mockResolvedValueOnce(
      json(201, {
        id: 9,
        document_id: 9,
        application_id: 5,
        filename: 'deed.pdf',
        document_type: 'LAND_DEED',
        sha256_hash: 'x',
        verification_status: 'PENDING',
        message: 'ok',
      }),
    );
    const file = new File(['%PDF-1.4'], 'deed.pdf', { type: 'application/pdf' });
    const doc = await uploadApplicationDocument({
      applicationId: '5',
      documentType: 'LAND_DEED',
      file,
    });
    expect(url()).toBe('/fastapi-proxy/api/documents/upload');
    const body = init().body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('application_id')).toBe('5');
    expect(body.get('document_type')).toBe('LAND_DEED');
    expect((body.get('file') as File).name).toBe('deed.pdf');
    expect(doc).toMatchObject({ id: 9, filename: 'deed.pdf', verification_status: 'PENDING' });
  });

  it('fetchDocumentPreview requests a blob and returns the binary view shape', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Blob(['png-bytes'], { type: 'image/png' }), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );
    const preview = await fetchDocumentPreview(12, { page: 1, marks: ['x'] });
    expect(url()).toBe('/fastapi-proxy/api/documents/12/preview');
    expect((init().headers as Headers).get('Accept')).toBe('*/*');
    expect(preview.mode).toBe('binary');
    expect(preview.blob).toBeInstanceOf(Blob);
    expect(preview.contentType).toBe('image/png');
    expect(preview.requestUrl).toBe('/fastapi-proxy/api/documents/12/preview');
  });

  it('fetchApplications maps each row and sends the institution filter', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, [{ id: 1, status: 'DRAFT', declared_data: { faculty_count: 9 } }]),
    );
    const rows = await fetchApplications({ institution_id: 3 });
    expect(url()).toBe('/fastapi-proxy/api/applications?institution_id=3');
    expect(rows[0].faculty_count).toBe(9);
  });

  it('read endpoints forward the abort signal and normalise results', async () => {
    const ac = new AbortController();
    fetchMock
      .mockResolvedValueOnce(json(200, { id: 2, status: 'SUBMITTED', declared_data: {} }))
      .mockResolvedValueOnce(
        json(200, [{ id: 1, reason: 'r', flag_category: 'FORGERY', severity: 'LOW' }]),
      )
      .mockResolvedValueOnce(
        json(200, [{ id: 1, action_type: 'LOGIN', prev_hash: null, record_hash: 'h' }]),
      );
    await fetchApplicationDetail('2', ac.signal);
    const flags = await fetchApplicationFlags('2', ac.signal);
    const logs = await fetchAuditLogs(ac.signal);
    expect(url(0)).toBe('/fastapi-proxy/api/applications/2');
    expect(url(1)).toBe('/fastapi-proxy/api/applications/2/flags');
    expect(url(2)).toBe('/fastapi-proxy/api/audit/logs');
    expect(init(0).signal).toBe(ac.signal);
    expect(flags[0].finding_type).toBe('FORGERY');
    expect(logs[0].current_hash).toBe('h');
  });

  it('submitOfficerDecision sends {decision, notes}', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { id: 1, decision: 'APPROVE', status: 'APPROVED_BY_REVIEWER' }),
    );
    await submitOfficerDecision('4', {
      decision: OfficerDecisionType.APPROVE,
      notes: 'Looks compliant overall.',
    });
    expect(url()).toBe('/fastapi-proxy/api/applications/4/decision');
    expect(JSON.parse(init().body as string)).toEqual({
      decision: 'APPROVE',
      notes: 'Looks compliant overall.',
    });
  });

  it('submitApplicationRectification sends {notes, amended}', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { application_id: 4, status: 'SUBMITTED', updated_fields: [] }),
    );
    await submitApplicationRectification('4', { notes: 'fixed', amended: { total_intake: 90 } });
    expect(url()).toBe('/fastapi-proxy/api/applications/4/submit-rectification');
    expect(JSON.parse(init().body as string)).toEqual({
      notes: 'fixed',
      amended: { total_intake: 90 },
    });
  });
});

describe('session endpoints', () => {
  const session = {
    access_token: 'tok-1',
    token_type: 'bearer',
    expires_in: 900,
    user: { id: 1, email: 'a@b.c', role: 'reviewer' },
  };

  it('login posts credentials as a form and stores the access token', async () => {
    fetchMock.mockResolvedValueOnce(json(200, session));
    const res = await login('a@b.c', 'pw');
    expect(url()).toBe('/fastapi-proxy/api/auth/login');
    const body = init().body as FormData;
    expect(body.get('username')).toBe('a@b.c');
    expect(body.get('password')).toBe('pw');
    expect(res.access_token).toBe('tok-1');
    expect(getAccessToken()).toBe('tok-1');
  });

  it('refreshSession goes through the shared single-flight refresh', async () => {
    fetchMock.mockResolvedValue(json(200, session));
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a?.access_token).toBe('tok-1');
    expect(b).toBe(a);
    expect(getAccessToken()).toBe('tok-1');
  });

  it('refreshSession resolves null when the server rejects the refresh', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { detail: 'Invalid session' }));
    expect(await refreshSession()).toBeNull();
  });

  it('logout clears the token and broadcasts even when the request fails', async () => {
    setAccessToken('tok-1');
    fetchMock.mockRejectedValueOnce(new TypeError('network down'));
    await expect(logout()).resolves.toBeUndefined();
    expect(getAccessToken()).toBeNull();
    expect(FakeBroadcastChannel.posted).toContainEqual({ type: 'logout' });
  });
});
