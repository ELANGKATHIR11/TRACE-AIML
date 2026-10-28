import React from 'react';
import { PersonaRole } from '../../types/api';
import { RequireRole, useIdentity } from '../identity/IdentityContext';
import { DossierRegistryTable } from '../applications/DossierRegistryTable';

export function ApplicantApplicationsPage() {
  const { activePersona } = useIdentity();

  return (
    <RequireRole allowedRoles={[PersonaRole.APPLICANT]}>
      <div className="space-y-6">
        <div className="border-b border-[#CBD5E1] pb-4">
          <h1 className="text-2xl font-bold text-[#0F1E36] tracking-tight">
            Institution Applicant Portal — Permitted Applications
          </h1>
          <p className="text-xs text-[#334155] mt-1">
            Scoped to Institution ID <code className="font-mono">#{activePersona.institutionId ?? 1}</code> (<code className="font-mono">{activePersona.email}</code>). Select a dossier to inspect deficiencies or submit closed-loop rectifications.
          </p>
        </div>

        <DossierRegistryTable
          institutionIdFilter={activePersona.institutionId ?? 1}
          detailRoutePrefix="/applicant/applications"
          title={`Permitted Dossiers for Institution #${activePersona.institutionId ?? 1}`}
        />
      </div>
    </RequireRole>
  );
}
