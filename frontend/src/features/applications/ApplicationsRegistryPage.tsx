import React from 'react';
import { DossierRegistryTable } from './DossierRegistryTable';

export function ApplicationsRegistryPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-[#CBD5E1] pb-4">
        <h1 className="text-2xl font-bold text-[#0F1E36] tracking-tight">
          Application Dossier Registry
        </h1>
        <p className="text-xs text-[#334155] mt-1">
          Complete statutory registry of submitted institution applications retrieved directly from <code className="font-mono">GET /api/applications</code>.
        </p>
      </div>

      <DossierRegistryTable title="All Submitted Dossiers" />
    </div>
  );
}
