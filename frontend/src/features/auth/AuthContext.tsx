/**
 * Real authentication (spec §7.2). The session lives in the HttpOnly refresh cookie plus the
 * transport's in-memory access token; this context only mirrors who is signed in.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import {
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  refreshSession,
} from '../../lib/api/endpoints';
import { ApiClientError, onAuthFailure } from '../../lib/api/transport';
import type { Role } from '../../lib/permissions/roles';
import type { User } from '../../types/api';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refreshUser(): Promise<void>;
}

interface AuthState {
  user: User | null;
  status: AuthStatus;
}

const ANONYMOUS: AuthState = { user: null, status: 'anonymous' };

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Control characters (stripped by the WHATWG URL parser, so `/\t/host` reads as `//host`) and `\`. */
const UNSAFE_NEXT_CHARS = /[\u0000-\u001F\u007F\\]/;

/**
 * Only same-app paths are honoured as a post-login destination. Prefix checks alone are bypassable,
 * so the value is resolved the way the browser would and must stay on this origin; the normalised
 * `pathname + search + hash` is returned. Anything else → `/`.
 */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || UNSAFE_NEXT_CHARS.test(next)) return '/';
  let url: URL;
  try {
    url = new URL(next, window.location.origin);
  } catch {
    return '/';
  }
  if (url.origin !== window.location.origin) return '/';
  const resolved = `${url.pathname}${url.search}${url.hash}`;
  // Dot-segment normalisation can turn an accepted input (`/.//host`, `/a/..//host`) into a
  // protocol-relative path, which would leave the origin once navigated to.
  return /^\/(?!\/)/.test(resolved) ? resolved : '/';
}

const PASSWORD_CHANGE_REQUIRED = 'Password change required';

function isPasswordChangeRequired(err: unknown): boolean {
  return err instanceof ApiClientError && err.status === 403 && err.detail === PASSWORD_CHANGE_REQUIRED;
}

/** Default landing page per role (spec §7.4). */
export function landingPathFor(role: Role): string {
  return role === 'applicant' ? '/applicant/applications' : '/';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ user: null, status: 'loading' });

  // Session lost (refresh rejected here, or logout in another tab): drop every cached record.
  useEffect(
    () =>
      onAuthFailure(() => {
        queryClient.clear();
        setState(ANONYMOUS);
      }),
    [queryClient],
  );

  // Restore the session from the refresh cookie on first load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await refreshSession();
        if (!session) {
          if (!cancelled) setState(ANONYMOUS);
          return;
        }
        const me = await fetchMe();
        if (!cancelled) setState({ user: me, status: 'authenticated' });
      } catch {
        if (!cancelled) setState(ANONYMOUS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await apiLogin(email, password);
      queryClient.clear();
      setState({ user: session.user, status: 'authenticated' });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    queryClient.clear();
    setState(ANONYMOUS);
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    const me = await fetchMe();
    setState({ user: me, status: 'authenticated' });
  }, []);

  // Spec §8: a mid-session 403 "Password change required" (e.g. after an admin reset) re-reads the
  // user so `must_change_password` is set and RequireAuth redirects to /change-password. Watched
  // once here for every query and mutation; concurrent failures share one /me request.
  const passwordCheckInFlight = useRef<Promise<void> | null>(null);
  useEffect(() => {
    const onError = (error: unknown) => {
      if (!isPasswordChangeRequired(error) || passwordCheckInFlight.current) return;
      passwordCheckInFlight.current = refreshUser()
        .catch(() => {
          // A failing /me ends the session through the transport's auth-failure path.
        })
        .finally(() => {
          passwordCheckInFlight.current = null;
        });
    };
    const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, [queryClient, refreshUser]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: state.user, status: state.status, login, logout, refreshUser }),
    [state, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export function AuthLoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[50vh] flex items-center justify-center gap-2.5 text-xs font-medium text-[#334155]"
    >
      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1B365D]" aria-hidden="true" />
      <span>Restoring secure session...</span>
    </div>
  );
}

/**
 * Anonymous users go to `/login?next=<path>`; users with a pending password change go to
 * `/change-password` before anything else.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <AuthLoadingState />;

  const next = encodeURIComponent(`${location.pathname}${location.search}`);
  if (!user) return <Navigate to={`/login?next=${next}`} replace />;
  if (user.must_change_password) return <Navigate to={`/change-password?next=${next}`} replace />;

  return <>{children}</>;
}

/** Renders the 403 role boundary unless the signed-in user's role is in `allowed`. */
export function RequireRole({ allowed, children }: { allowed: Role[]; children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user || !allowed.includes(user.role)) {
    return (
      <section
        role="alert"
        aria-live="assertive"
        className="my-8 border border-[#CBD5E1] bg-white p-6"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-[#B91C1C] font-mono text-sm font-semibold">[403 ROLE BOUNDARY]</div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-[#0F1E36]">
              Insufficient Role Permissions for Requested Workflow
            </h2>
            <p className="text-sm text-[#334155] max-w-2xl">
              {user ? (
                <>
                  The signed-in account (<strong>{user.full_name}</strong> —{' '}
                  <code className="font-mono">{user.email}</code>, Role:{' '}
                  <code className="font-mono">{user.role}</code>) is not permitted to access this
                  statutory view.
                </>
              ) : (
                <>No signed-in account is permitted to access this statutory view.</>
              )}{' '}
              Required role: <code className="font-mono">{allowed.join(' or ')}</code>.
            </p>
            {user && (
              <div className="pt-2">
                <Link
                  to={landingPathFor(user.role)}
                  className="text-xs font-semibold text-[#1B365D] hover:underline"
                >
                  Return to your workspace
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
