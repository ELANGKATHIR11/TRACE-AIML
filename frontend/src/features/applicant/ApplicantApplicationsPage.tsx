import React from 'react';
import { useAuth } from '../auth/AuthContext';
import { DossierRegistryTable } from '../applications/DossierRegistryTable';

export function ApplicantApplicationsPage() {
  const { user } = useAuth();
  const institutionId = user?.institution_id ?? undefined;

  return (
    <div className="space-y-6">
      <div className="border-b border-[#CBD5E1] pb-4">
        <h1 className="text-2xl font-bold text-[#0F1E36] tracking-tight">
          Institution Applicant Portal — Permitted Applications
        </h1>
        <p className="text-xs text-[#334155] mt-1">
          Scoped to Institution ID <code className="font-mono">#{String(institutionId)}</code> (<code className="font-mono">{user?.email}</code>). Select a dossier to inspect deficiencies or submit closed-loop rectifications.
        </p>
      </div>

      <DossierRegistryTable
        institutionIdFilter={institutionId}
        detailRoutePrefix="/applicant/applications"
        title={`Permitted Dossiers for Institution #${String(institutionId)}`}
      />
    </div>
  );
}
