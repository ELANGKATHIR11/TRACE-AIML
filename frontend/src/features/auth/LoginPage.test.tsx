import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';

vi.mock('../../lib/api/endpoints', () => ({
  refreshSession: vi.fn(),
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
}));

import * as endpoints from '../../lib/api/endpoints';
import { ApiClientError } from '../../lib/api/transport';
import { LoginPage } from './LoginPage';
import { LocationProbe, makeSession, makeUser, renderWithAuth } from '../../test/authTestUtils';

const api = vi.mocked(endpoints);

function renderLogin(path = '/login') {
  return renderWithAuth(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { path },
  );
}

async function fillAndSubmit(email = 'reviewer@aicte.test', password = 'wrong-password-123') {
  await userEvent.type(await screen.findByLabelText(/email/i), email);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

beforeEach(() => {
  vi.resetAllMocks();
  api.refreshSession.mockResolvedValue(null);
});

describe('LoginPage', () => {
  it('shows the generic error text on 401', async () => {
    api.login.mockRejectedValue(
      new ApiClientError({
        status: 401,
        detail: 'Incorrect email or password',
        endpoint: '/api/auth/login',
      }),
    );
    renderLogin();

    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
    expect(api.login).toHaveBeenCalledWith('reviewer@aicte.test', 'wrong-password-123');
  });

  it('disables submit while the sign-in request is pending', async () => {
    api.login.mockReturnValue(new Promise(() => {}));
    renderLogin();

    await fillAndSubmit();

    await waitFor(() => expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled());
  });

  it('continues to a safe next path after sign-in', async () => {
    api.login.mockResolvedValue(makeSession(makeUser()));
    renderLogin('/login?next=%2Faudit');

    await fillAndSubmit('reviewer@aicte.test', 'correct-password-123');

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/audit'));
  });

  it('ignores an off-site next and lands an applicant on their applications', async () => {
    api.login.mockResolvedValue(makeSession(makeUser({ role: 'applicant', institution_id: 2 })));
    renderLogin('/login?next=%2F%2Fevil.test');

    await fillAndSubmit('app@inst.test', 'correct-password-123');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/applicant/applications'),
    );
  });
});
