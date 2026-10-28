/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IdentityProvider } from './features/identity/IdentityContext';
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

export default function App() {
  useEffect(() => {
    const cleanup = initCrossTabSync(queryClient);
    return cleanup;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <IdentityProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<ExecutiveDashboardPage />} />
              <Route path="/applications" element={<ApplicationsRegistryPage />} />
              <Route path="/applications/new" element={<ApplicationIntakePage />} />
              <Route path="/applications/:id" element={<ScrutinyCockpitPage />} />
              <Route path="/applicant/applications" element={<ApplicantApplicationsPage />} />
              <Route
                path="/applicant/applications/:id"
                element={<ApplicantDossierRectificationPage />}
              />
              <Route path="/audit" element={<CryptographicAuditPage />} />
              <Route path="/documents/:id" element={<StandaloneDocumentPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </IdentityProvider>
    </QueryClientProvider>
  );
}
