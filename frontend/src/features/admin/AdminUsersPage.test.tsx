import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../lib/api/endpoints', () => ({
  refreshSession: vi.fn(),
  fetchMe: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  fetchInstitutions: vi.fn(),
}));

import * as endpoints from '../../lib/api/endpoints';
import { AdminUsersPage } from './AdminUsersPage';
import { makeSession, makeUser, renderWithAuth } from '../../test/authTestUtils';

const api = vi.mocked(endpoints);

const institution = {
  id: 7,
  aicte_permanent_id: '1-1',
  name: 'Test Institute',
  state: 'KA',
  district: 'Bengaluru',
  address: 'x',
  established_year: 2000,
  historical_records: {},
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  const admin = makeUser({ role: 'admin' });
  api.refreshSession.mockResolvedValue(makeSession(admin));
  api.fetchMe.mockResolvedValue(admin);
  api.listUsers.mockResolvedValue([
    makeUser({ id: 2, email: 'rev@aicte.test', full_name: 'Rev One' }),
  ]);
  api.fetchInstitutions.mockResolvedValue([institution]);
  api.createUser.mockResolvedValue(makeUser({ id: 3 }));
  api.updateUser.mockResolvedValue(makeUser({ id: 2, is_active: false }));
});

describe('AdminUsersPage', () => {
  it('lists users', async () => {
    renderWithAuth(<AdminUsersPage />);
    expect(await screen.findByText('rev@aicte.test')).toBeInTheDocument();
  });

  it('requires an institution for applicants and creates with exactly the form fields', async () => {
    renderWithAuth(<AdminUsersPage />);
    await screen.findByText('rev@aicte.test');

    expect(screen.queryByLabelText(/^institution/i)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^email/i), 'new@college.test');
    await userEvent.type(screen.getByLabelText(/full name/i), 'New Applicant');
    await userEvent.type(screen.getByLabelText(/temporary password/i), 'a-long-temp-password');
    await userEvent.selectOptions(screen.getByLabelText(/^role/i), 'applicant');

    const institutionSelect = await screen.findByLabelText(/^institution/i);
    await screen.findByRole('option', { name: 'Test Institute' });

    await userEvent.click(screen.getByRole('button', { name: /create user/i }));
    expect(await screen.findByText('Applicants require an institution')).toBeInTheDocument();
    expect(api.createUser).not.toHaveBeenCalled();

    await userEvent.selectOptions(institutionSelect, '7');
    await userEvent.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => expect(api.createUser).toHaveBeenCalledTimes(1));
    expect(api.createUser).toHaveBeenCalledWith({
      email: 'new@college.test',
      full_name: 'New Applicant',
      role: 'applicant',
      institution_id: 7,
      temporary_password: 'a-long-temp-password',
    });

    // The form (including the temporary password) is cleared after a successful create.
    await waitFor(() => expect(screen.getByLabelText(/^email/i)).toHaveValue(''));
    expect(screen.getByLabelText(/full name/i)).toHaveValue('');
    expect(screen.getByLabelText(/temporary password/i)).toHaveValue('');
  });

  it('deactivates a user', async () => {
    renderWithAuth(<AdminUsersPage />);
    const row = (await screen.findByText('rev@aicte.test')).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /deactivate/i }));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith(2, { is_active: false }));
  });
});
