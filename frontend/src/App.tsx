/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AuthProvider,
  RequireAuth,
  RequireRole,
  landingPathFor,
  useAuth,
} from './features/auth/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import { ChangePasswordPage } from './features/auth/ChangePasswordPage';
import { AppShell } from './app/AppShell';
import { NotFoundPage } from './app/NotFoundPage';
import { ExecutiveDashboardPage } from './features/dashboard/ExecutiveDashboardPage';
import { ApplicationsRegistryPage } from './features/applications/ApplicationsRegistryPage';
import { ApplicationIntakePage } from './features/applications/ApplicationIntakePage';
import { ScrutinyCockpitPage } from './features/applications/ScrutinyCockpitPage';
import { CryptographicAuditPage } from './features/audit/CryptographicAuditPage';
import { ApplicantApplicationsPage } from './features/applicant/ApplicantApplicationsPage';
import { ApplicantDossierRectificationPage } from './features/applicant/ApplicantDossierRectificationPage';
import { StandaloneDocumentPage } from './features/documents/StandaloneDocumentPage';
import { initCrossTabSync } from './lib/api/cacheSync';
import type { Role } from './lib/permissions/roles';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 1000, // 1s staleTime ensures instant freshness upon navigation
    },
    mutations: {
      retry: false,
    },
  },
});

const STAFF: Role[] = ['reviewer', 'admin'];
const APPLICANT: Role[] = ['applicant'];

/** `/` is the staff dashboard; applicants land on their own applications instead. */
function HomeRoute() {
  const { user } = useAuth();
  if (user && user.role === 'applicant') {
    return <Navigate to={landingPathFor(user.role)} replace />;
  }
  return (
    <RequireRole allowed={STAFF}>
      <ExecutiveDashboardPage />
    </RequireRole>
  );
}

function gated(allowed: Role[], page: React.ReactNode) {
  return <RequireRole allowed={allowed}>{page}</RequireRole>;
}

export default function App() {
  useEffect(() => {
    const cleanup = initCrossTabSync(queryClient);
    return cleanup;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/" element={<HomeRoute />} />
              <Route path="/applications" element={gated(STAFF, <ApplicationsRegistryPage />)} />
              <Route
                path="/applications/new"
                element={gated(APPLICANT, <ApplicationIntakePage />)}
              />
              <Route path="/applications/:id" element={gated(STAFF, <ScrutinyCockpitPage />)} />
              <Route
                path="/applicant/applications"
                element={gated(APPLICANT, <ApplicantApplicationsPage />)}
              />
              <Route
                path="/applicant/applications/:id"
                element={gated(APPLICANT, <ApplicantDossierRectificationPage />)}
              />
              <Route path="/audit" element={gated(STAFF, <CryptographicAuditPage />)} />
              {/* Documents are readable by their owning applicant and by staff (backend-enforced). */}
              <Route path="/documents/:id" element={<StandaloneDocumentPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
