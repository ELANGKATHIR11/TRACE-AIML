import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';

vi.mock('../lib/api/endpoints', () => ({
  refreshSession: vi.fn(),
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
}));

import * as endpoints from '../lib/api/endpoints';
import type { Role } from '../lib/permissions/roles';
import { AppShell } from './AppShell';
import { LocationProbe, makeSession, makeUser, renderWithAuth } from '../test/authTestUtils';

const api = vi.mocked(endpoints);

function renderShellAs(role: Role) {
  const user = makeUser({
    role,
    full_name: 'Asha Account',
    institution_id: role === 'applicant' ? 4 : null,
  });
  api.refreshSession.mockResolvedValue(makeSession(user));
  api.fetchMe.mockResolvedValue(user);
  return renderWithAuth(
    <Routes>
      <Route path="/login" element={<LocationProbe />} />
      <Route element={<AppShell />}>
        <Route path="*" element={<div>workspace</div>} />
      </Route>
    </Routes>,
    { path: '/somewhere' },
  );
}

async function primaryNavLabels() {
  const nav = await screen.findByRole('navigation', { name: 'Primary Regulatory Navigation' });
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent);
}

beforeEach(() => {
  vi.resetAllMocks();
  api.logout.mockResolvedValue(undefined);
});

describe('AppShell', () => {
  it('shows applicant navigation', async () => {
    renderShellAs('applicant');
    expect(await primaryNavLabels()).toEqual(['My Applications', 'New Application']);
  });

  it('shows reviewer navigation', async () => {
    renderShellAs('reviewer');
    expect(await primaryNavLabels()).toEqual(['Dashboard', 'Dossier Registry', 'Audit Trail']);
    expect(screen.queryByRole('link', { name: /application intake/i })).not.toBeInTheDocument();
  });

  it('shows the user menu instead of persona switching or API probes', async () => {
    renderShellAs('reviewer');
    const menu = await screen.findByRole('group', { name: 'Signed-in user' });
    expect(within(menu).getByText('Asha Account')).toBeInTheDocument();
    expect(within(menu).getByText(/Scrutiny Reviewer/)).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: /change password/i })).toHaveAttribute(
      'href',
      '/change-password?next=%2Fsomewhere',
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/API Contract|OpenAPI|Probing|Dev Mode/i)).not.toBeInTheDocument();
  });

  it('signs out and returns to the login page', async () => {
    renderShellAs('admin');
    await userEvent.click(await screen.findByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/login$/));
    expect(api.logout).toHaveBeenCalledTimes(1);
  });
});
