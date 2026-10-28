import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';

vi.mock('../../lib/api/endpoints', () => ({
  refreshSession: vi.fn(),
  fetchMe: vi.fn(),
  fetchApplicationDetail: vi.fn(),
  fetchApplicationFlags: vi.fn(),
  fetchAuthorityVerifications: vi.fn(),
  submitOfficerDecision: vi.fn(),
  triggerAgentReview: vi.fn(),
  validateApplication: vi.fn(),
}));
vi.mock('../documents/EvidenceCanvasViewer', () => ({
  EvidenceCanvasViewer: () => <div data-testid="viewer" />,
}));

import * as endpoints from '../../lib/api/endpoints';
import { ScrutinyCockpitPage } from './ScrutinyCockpitPage';
import { makeSession, makeUser, renderWithAuth } from '../../test/authTestUtils';
import type { Role } from '../../lib/permissions/roles';

const api = vi.mocked(endpoints);

function renderCockpit(role: Role) {
  const user = makeUser({ role });
  api.refreshSession.mockResolvedValue(makeSession(user));
  api.fetchMe.mockResolvedValue(user);
  return renderWithAuth(
    <Routes>
      <Route path="/applications/:id" element={<ScrutinyCockpitPage />} />
    </Routes>,
    { path: '/applications/5' },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchApplicationDetail.mockResolvedValue({
    id: 5,
    status: 'UNDER_REVIEW',
    documents: [],
  } as never);
  api.fetchApplicationFlags.mockResolvedValue([]);
  api.fetchAuthorityVerifications.mockResolvedValue([]);
});

describe('ScrutinyCockpitPage decision form', () => {
  it('offers exactly Approve / Request rectification / Reject to a reviewer', async () => {
    renderCockpit('reviewer');
    const select = await screen.findByLabelText(/binding statutory determination/i);
    const values = Array.from(select.querySelectorAll('option')).map((o) =>
      o.getAttribute('value'),
    );
    expect(values).toEqual(['APPROVE', 'REQUEST_RECTIFICATION', 'REJECT']);
  });

  it('hides decision controls for an admin', async () => {
    renderCockpit('admin');
    await screen.findByText(/only scrutiny reviewers record binding decisions/i);
    expect(screen.queryByLabelText(/binding statutory determination/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /record binding statutory decision/i }),
    ).not.toBeInTheDocument();
  });
});

describe('ScrutinyCockpitPage validation trigger', () => {
  it('lets a reviewer run validation on a submitted dossier', async () => {
    api.fetchApplicationDetail.mockResolvedValue({
      id: 5,
      status: 'SUBMITTED',
      documents: [],
    } as never);
    api.validateApplication.mockResolvedValue({ message: 'ok', result: {} } as never);
    renderCockpit('reviewer');
    await userEvent.click(await screen.findByRole('button', { name: /run statutory validation/i }));
    await waitFor(() => expect(api.validateApplication).toHaveBeenCalledWith('5'));
  });

  it('does not offer validation once a decision has been recorded', async () => {
    api.fetchApplicationDetail.mockResolvedValue({
      id: 5,
      status: 'APPROVED_BY_REVIEWER',
      documents: [],
    } as never);
    renderCockpit('reviewer');
    await screen.findByLabelText(/binding statutory determination/i);
    expect(
      screen.queryByRole('button', { name: /run statutory validation/i }),
    ).not.toBeInTheDocument();
  });
});
