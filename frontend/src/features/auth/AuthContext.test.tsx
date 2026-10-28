import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
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
import { endLocalSession } from '../../lib/api/transport';
import { RequireAuth, RequireRole, safeNextPath, useAuth } from './AuthContext';
import { LocationProbe, makeSession, makeUser, renderWithAuth } from '../../test/authTestUtils';

const api = vi.mocked(endpoints);

function AuthProbe() {
  const { status, user, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.email ?? 'none'}</span>
      <button type="button" onClick={() => void logout()}>
        probe-logout
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.logout.mockResolvedValue(undefined);
});

describe('AuthProvider session restore', () => {
  it('calls refresh on mount and becomes authenticated with the user from /api/auth/me', async () => {
    const me = makeUser({ email: 'me@aicte.test' });
    api.refreshSession.mockResolvedValue(makeSession(makeUser({ email: 'stale@aicte.test' })));
    api.fetchMe.mockResolvedValue(me);

    renderWithAuth(<AuthProbe />);
    expect(screen.getByTestId('status')).toHaveTextContent('loading');

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('user')).toHaveTextContent('me@aicte.test');
    expect(api.refreshSession).toHaveBeenCalledTimes(1);
    expect(api.fetchMe).toHaveBeenCalledTimes(1);
  });

  it('becomes anonymous when the refresh is rejected', async () => {
    api.refreshSession.mockResolvedValue(null);

    renderWithAuth(<AuthProbe />);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(api.fetchMe).not.toHaveBeenCalled();
  });

  it('becomes anonymous when the refresh request fails outright', async () => {
    api.refreshSession.mockRejectedValue(new TypeError('Failed to fetch'));

    renderWithAuth(<AuthProbe />);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
  });

  it('on auth failure clears the query cache and becomes anonymous', async () => {
    api.refreshSession.mockResolvedValue(makeSession(makeUser()));
    api.fetchMe.mockResolvedValue(makeUser());

    const { queryClient } = renderWithAuth(<AuthProbe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    queryClient.setQueryData(['applications'], [{ id: 1 }]);

    act(() => endLocalSession());

    expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(queryClient.getQueryData(['applications'])).toBeUndefined();
  });

  it('logout calls the logout endpoint, clears the cache and becomes anonymous', async () => {
    api.refreshSession.mockResolvedValue(makeSession(makeUser()));
    api.fetchMe.mockResolvedValue(makeUser());

    const { queryClient } = renderWithAuth(<AuthProbe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    queryClient.setQueryData(['applications'], [{ id: 1 }]);

    await userEvent.click(screen.getByRole('button', { name: 'probe-logout' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['applications'])).toBeUndefined();
  });
});

describe('RequireAuth', () => {
  function guardedRoutes() {
    return (
      <Routes>
        <Route path="/login" element={<LocationProbe />} />
        <Route path="/change-password" element={<LocationProbe />} />
        <Route
          path="/audit"
          element={
            <RequireAuth>
              <div>audit page</div>
            </RequireAuth>
          }
        />
      </Routes>
    );
  }

  it('redirects anonymous users to /login with the requested path as next', async () => {
    api.refreshSession.mockResolvedValue(null);

    renderWithAuth(guardedRoutes(), { path: '/audit' });

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/login?next=%2Faudit'),
    );
    expect(screen.queryByText('audit page')).not.toBeInTheDocument();
  });

  it('redirects users who must change their password to /change-password', async () => {
    const user = makeUser({ must_change_password: true });
    api.refreshSession.mockResolvedValue(makeSession(user));
    api.fetchMe.mockResolvedValue(user);

    renderWithAuth(guardedRoutes(), { path: '/audit' });

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/change-password/));
    expect(screen.queryByText('audit page')).not.toBeInTheDocument();
  });

  it('renders the protected page for an authenticated user', async () => {
    api.refreshSession.mockResolvedValue(makeSession(makeUser()));
    api.fetchMe.mockResolvedValue(makeUser());

    renderWithAuth(guardedRoutes(), { path: '/audit' });

    expect(await screen.findByText('audit page')).toBeInTheDocument();
  });
});

describe('RequireRole', () => {
  it('shows the 403 boundary without persona-switch buttons for a disallowed role', async () => {
    const applicant = makeUser({ role: 'applicant', institution_id: 3, email: 'app@inst.test' });
    api.refreshSession.mockResolvedValue(makeSession(applicant));
    api.fetchMe.mockResolvedValue(applicant);

    renderWithAuth(
      <RequireAuth>
        <RequireRole allowed={['reviewer', 'admin']}>
          <div>reviewer workspace</div>
        </RequireRole>
      </RequireAuth>,
    );

    expect(await screen.findByText(/403 ROLE BOUNDARY/)).toBeInTheDocument();
    expect(screen.queryByText('reviewer workspace')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders children for an allowed role', async () => {
    api.refreshSession.mockResolvedValue(makeSession(makeUser({ role: 'admin' })));
    api.fetchMe.mockResolvedValue(makeUser({ role: 'admin' }));

    renderWithAuth(
      <RequireAuth>
        <RequireRole allowed={['reviewer', 'admin']}>
          <div>reviewer workspace</div>
        </RequireRole>
      </RequireAuth>,
    );

    expect(await screen.findByText('reviewer workspace')).toBeInTheDocument();
  });
});

describe('safeNextPath', () => {
  it('rejects anything that is not a same-app relative path', () => {
    expect(safeNextPath('//evil.test')).toBe('/');
    expect(safeNextPath('https://evil.test')).toBe('/');
    expect(safeNextPath('/\\evil.test')).toBe('/');
    expect(safeNextPath('audit')).toBe('/');
    expect(safeNextPath('')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
  });

  it('keeps same-app paths unchanged', () => {
    expect(safeNextPath('/applications/3')).toBe('/applications/3');
    expect(safeNextPath('/audit?page=2')).toBe('/audit?page=2');
  });
});
