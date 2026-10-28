import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../lib/api/endpoints', () => ({
  refreshSession: vi.fn(),
  fetchMe: vi.fn(),
  createApplication: vi.fn(),
  uploadApplicationDocument: vi.fn(),
  submitApplication: vi.fn(),
}));

import * as endpoints from '../../lib/api/endpoints';
import { ApiClientError } from '../../lib/api/transport';
import { ApplicationIntakePage } from './ApplicationIntakePage';
import { makeSession, makeUser, renderWithAuth } from '../../test/authTestUtils';

const api = vi.mocked(endpoints);

async function uploadOne() {
  await userEvent.type(await screen.findByLabelText(/target application id/i), '5');
  const file = new File(['%PDF-1.4'], 'deed.pdf', { type: 'application/pdf' });
  await userEvent.upload(screen.getByLabelText(/evidentiary document file/i), file);
  await userEvent.click(screen.getByRole('button', { name: /upload document to server/i }));
  await waitFor(() => expect(api.uploadApplicationDocument).toHaveBeenCalled());
}

beforeEach(() => {
  vi.resetAllMocks();
  const user = makeUser({ role: 'applicant', institution_id: 1 });
  api.refreshSession.mockResolvedValue(makeSession(user));
  api.fetchMe.mockResolvedValue(user);
  api.uploadApplicationDocument.mockResolvedValue({
    id: 11,
    document_type: 'LAND_OWNERSHIP_DOCUMENT',
  } as never);
});

describe('ApplicationIntakePage submit step', () => {
  it('calls submitApplication with the application id', async () => {
    api.submitApplication.mockResolvedValue({ id: 5, status: 'SUBMITTED' } as never);
    renderWithAuth(<ApplicationIntakePage />);
    await uploadOne();
    await userEvent.click(screen.getByRole('button', { name: /submit application/i }));
    await waitFor(() => expect(api.submitApplication).toHaveBeenCalledWith('5'));
    expect(await screen.findByText('SUBMITTED')).toBeInTheDocument();
  });

  it('shows missing document types from a 409', async () => {
    api.submitApplication.mockRejectedValue(
      new ApiClientError({
        status: 409,
        detail: 'Missing required documents',
        body: { missing_document_types: ['AFFIDAVIT'] },
        endpoint: '/api/applications/5/submit',
      }),
    );
    renderWithAuth(<ApplicationIntakePage />);
    await uploadOne();
    await userEvent.click(screen.getByRole('button', { name: /submit application/i }));
    expect(await screen.findByText(/AFFIDAVIT/)).toBeInTheDocument();
  });
});
