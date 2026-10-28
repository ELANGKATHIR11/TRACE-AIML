import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthContext';
import type { User } from '../types/api';

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'reviewer@aicte.test',
    full_name: 'Rhea Reviewer',
    role: 'reviewer',
    institution_id: null,
    is_active: true,
    must_change_password: false,
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

export function makeSession(user: User) {
  return { access_token: 'access-token', token_type: 'bearer', expires_in: 900, user };
}

/** Renders the current router location so tests can assert redirects. */
export function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

export function renderWithAuth(ui: React.ReactElement, { path = '/' }: { path?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}
