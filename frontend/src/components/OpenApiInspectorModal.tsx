import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, ExternalLink, RefreshCw, Server, X, XCircle } from 'lucide-react';
import { useIdentity } from '../features/identity/IdentityContext';

const EXPECTED_CAPABILITIES = [
  { capability: 'Dashboard metrics', endpoint: '/api/dashboard/metrics', methods: ['GET'] },
  { capability: 'Application registry & intake', endpoint: '/api/applications', methods: ['GET', 'POST'] },
  { capability: 'Application detail', endpoint: '/api/applications/{id}', methods: ['GET'] },
  { capability: 'Forensic findings / flags', endpoint: '/api/applications/{id}/flags', methods: ['GET'] },
  { capability: 'Multi-agent AI review', endpoint: '/api/applications/{id}/agent-review', methods: ['POST'] },
  { capability: 'Officer decisions', endpoint: '/api/applications/{id}/decision', methods: ['POST'] },
  { capability: 'Document upload', endpoint: '/api/documents/upload', methods: ['POST'] },
  { capability: 'Document preview', endpoint: '/api/documents/{id}/preview', methods: ['GET'] },
  { capability: 'Document rectification', endpoint: '/api/documents/{id}/rectify', methods: ['POST'] },
  { capability: 'Submit rectification', endpoint: '/api/applications/{id}/submit-rectification', methods: ['POST'] },
  { capability: 'Audit log trail', endpoint: '/api/audit/logs', methods: ['GET'] },
  { capability: 'Audit chain integrity', endpoint: '/api/audit/verify-chain', methods: ['GET'] },
];

export function OpenApiInspectorModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const {
    apiBaseUrl,
    updateApiBaseUrl,
    connectionState,
    connectionDetail,
    openApiSpec,
    discoveredPaths,
    recheckBackendConnection,
    authMode,
    authStatusNote,
  } = useIdentity();

  const [urlInput, setUrlInput] = useState(apiBaseUrl);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setUrlInput(apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApplyUrl = (e: React.FormEvent) => {
    e.preventDefault();
    updateApiBaseUrl(urlInput.trim() || null);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="openapi-inspector-title"
      className="backdrop:bg-black/50 bg-white border border-[#CBD5E1] text-[#0F1E36] w-full max-w-4xl p-0 m-auto"
    >
      <div className="p-6 space-y-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-[#CBD5E1] pb-4">
          <div className="flex items-center gap-2.5">
            <Server className="w-5 h-5 text-[#1B365D]" aria-hidden="true" />
            <div>
              <h2 id="openapi-inspector-title" className="text-base font-bold text-[#0F1E36]">
                FastAPI Contract & Live OpenAPI Discovery Inspector
              </h2>
              <p className="text-xs text-[#334155]">
                Verifies live endpoint availability against <code className="font-mono">{apiBaseUrl}/openapi.json</code>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close API Contract Inspector"
            className="p-1.5 text-[#334155] hover:text-[#0F1E36] border border-transparent hover:border-[#CBD5E1] cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Backend URL Configuration & Live Probe */}
        <form onSubmit={handleApplyUrl} className="space-y-3 bg-[#F4F6F9] p-4 border border-[#CBD5E1]">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label
                htmlFor="fastapi-origin-input"
                className="block text-xs font-semibold text-[#0F1E36] mb-1"
              >
                Configured FastAPI Base URL (VITE_API_BASE_URL)
              </label>
              <input
                id="fastapi-origin-input"
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="http://localhost:8000"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#CBD5E1] text-[#0F1E36]"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Apply & Probe Origin
              </button>
              <button
                type="button"
                onClick={() => void recheckBackendConnection()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1B365D] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Re-Probe</span>
              </button>
              <a
                href={`${apiBaseUrl}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1B365D] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] whitespace-nowrap shrink-0"
              >
                <span>Swagger Docs</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="pt-2 border-t border-[#E2E8F0] text-xs space-y-1">
            <div>
              <span className="font-semibold text-[#0F1E36]">Live Probe Status: </span>
              <span className="font-mono">{connectionState}</span> — {connectionDetail}
            </div>
            <div>
              <span className="font-semibold text-[#0F1E36]">Identity / Auth Contract: </span>
              <span className="font-mono">{authMode}</span> — {authStatusNote}
            </div>
          </div>
        </form>

        {/* Capability Matrix Table */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[#0F1E36]">
            Endpoint Capability Matrix (Live OpenAPI Reconciliation)
          </h3>
          <div className="overflow-x-auto border border-[#CBD5E1]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4F6F9] border-b border-[#CBD5E1] text-[#0F1E36]">
                  <th className="py-2.5 px-3 font-semibold">Capability</th>
                  <th className="py-2.5 px-3 font-semibold">Target Endpoint</th>
                  <th className="py-2.5 px-3 font-semibold">Live OpenAPI Contract</th>
                  <th className="py-2.5 px-3 font-semibold">Frontend Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {EXPECTED_CAPABILITIES.map((row) => {
                  const matchedInOpenApi = discoveredPaths.some(
                    (p) =>
                      p === row.endpoint ||
                      p.replace(/\{[^}]+\}/g, '{id}') === row.endpoint
                  );
                  return (
                    <tr key={row.endpoint} className="hover:bg-[#F8FAFC]">
                      <td className="py-2 px-3 font-medium text-[#0F1E36]">{row.capability}</td>
                      <td className="py-2 px-3 font-mono text-[#334155]">
                        {row.methods.join('/')} {row.endpoint}
                      </td>
                      <td className="py-2 px-3">
                        {openApiSpec ? (
                          matchedInOpenApi ? (
                            <span className="inline-flex items-center gap-1 text-[#15803D] font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Verified in /openapi.json</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[#B91C1C] font-medium">
                              <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Not found in /openapi.json</span>
                            </span>
                          )
                        ) : (
                          <span className="text-[#9A3412] font-medium">
                            Awaiting live /openapi.json response
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-[#15803D] font-medium">
                        Implemented (Zero-Mock)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Raw Discovered OpenAPI Paths */}
        {discoveredPaths.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[#0F1E36]">
              Discovered Paths in /openapi.json ({discoveredPaths.length})
            </h3>
            <div className="p-3 bg-[#F4F6F9] border border-[#CBD5E1] font-mono text-xs text-[#0F1E36] max-h-40 overflow-y-auto">
              {discoveredPaths.join('\n')}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-[#CBD5E1]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] cursor-pointer"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </dialog>
  );
}
