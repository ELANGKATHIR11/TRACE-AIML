import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { fetchAuditLogs, verifyAuditChain } from '../../lib/api/endpoints';
import { formatApiTimestamp, formatApiValue } from '../../lib/utils/formatters';
import {
  ApiEmptyState,
  ApiErrorState,
  ApiLoadingState,
} from '../../components/ApiStateFeedback';
import { MerkleChain3DBadge, Tactile3DCard } from '../../components/Tactile3DElements';

export function CryptographicAuditPage() {
  const logsQuery = useQuery({
    queryKey: ['audit-logs'],
    queryFn: ({ signal }) => fetchAuditLogs(signal),
    retry: 1,
    refetchInterval: 10_000,
  });

  const verifyMutation = useMutation({
    mutationFn: () => verifyAuditChain(),
    retry: false, // Prevent duplicate chain verifications in flight
  });

  const logs = logsQuery.data ?? [];
  const verification = verifyMutation.data;
  // normalizeChain sets `valid` from the backend's INTACT/BROKEN status.
  const isChainValid = verification?.valid === true;
  const brokenAtId = verification?.broken_at_id;

  return (
    <>
      <div className="space-y-6 animate-dossier-settle">
        {/* Header & Verify Integrity Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#CBD5E1] pb-4">
          <div className="flex items-center gap-3.5">
            <MerkleChain3DBadge />
            <div>
              <h1 className="text-2xl font-bold text-[#0F1E36] tracking-tight">
                Cryptographic Audit Trail & Chain Verification
              </h1>
              <p className="text-xs text-[#334155] mt-1">
                Immutable ledger events retrieved from <code className="font-mono">GET /api/audit/logs</code> and server-verified via <code className="font-mono">GET /api/audit/verify-chain</code>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void logsQuery.refetch()}
              disabled={logsQuery.isFetching}
              className="btn-tactile-3d inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#1B365D] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${logsQuery.isFetching ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Refresh Audit Log</span>
            </button>

            <button
              type="button"
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
              className="btn-tactile-3d inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              <span>
                {verifyMutation.isPending
                  ? 'Verifying Chain on Server...'
                  : 'Verify Merkle Integrity'}
              </span>
            </button>
          </div>
        </div>

        {/* Chain Verification Result Panel */}
        <Tactile3DCard
          as="section"
          maxTiltDeg={1.5}
          className="bg-white border border-[#CBD5E1] p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#1B365D]" aria-hidden="true" />
              <h2 id="chain-verification-heading" className="text-sm font-bold text-[#0F1E36]">
                Backend Cryptographic Integrity Verification (<code className="font-mono font-normal">GET /api/audit/verify-chain</code>)
              </h2>
            </div>
          </div>

          {verifyMutation.isIdle && (
            <p className="text-xs text-[#334155]">
              Click <strong>Verify Merkle Integrity</strong> above to invoke <code className="font-mono">GET /api/audit/verify-chain</code> on the FastAPI backend. No client-side hash or Merkle computation is fabricated in the browser.
            </p>
          )}

          {verifyMutation.isPending && (
            <ApiLoadingState
              label="Executing cryptographic chain verification on GET /api/audit/verify-chain..."
              rows={2}
            />
          )}

          {verifyMutation.isError && (
            <ApiErrorState
              title="Cryptographic Chain Verification Failed to Execute"
              error={verifyMutation.error}
              endpoint="GET /api/audit/verify-chain"
              onRetry={() => verifyMutation.mutate()}
              isRetrying={verifyMutation.isPending}
            />
          )}

          {verifyMutation.isSuccess && verification && (
            <div
              role="status"
              aria-live="polite"
              className={`border p-4 text-xs space-y-2 ${
                isChainValid
                  ? 'border-[#86EFAC] bg-[#F0FDF4] text-[#14532D]'
                  : 'border-[#FECACA] bg-[#FEF2F2] text-[#7F1D1D]'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                {isChainValid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#15803D]" aria-hidden="true" />
                    <span>Backend Confirmed: Audit Chain Integrity VALID</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-[#B91C1C]" aria-hidden="true" />
                    <span>
                      Backend Reported: Audit Chain BROKEN
                      {brokenAtId !== undefined && brokenAtId !== null
                        ? ` at Event #${String(brokenAtId)}`
                        : ''}
                    </span>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                <div>
                  <span className="font-semibold">Structure / Algorithm: </span>
                  <span className="font-mono">
                    {formatApiValue(verification.structure_type ?? verification.algorithm)}
                  </span>
                </div>
                <div>
                  <span className="font-semibold">Verified Events: </span>
                  <span className="font-mono tabular-nums">
                    {formatApiValue(verification.verified_count ?? verification.total_events)}
                  </span>
                </div>
                <div>
                  <span className="font-semibold">Root / Latest Hash: </span>
                  <span className="font-mono break-all">
                    {formatApiValue(verification.merkle_root ?? verification.latest_hash)}
                  </span>
                </div>
                <div>
                  <span className="font-semibold">Verified At: </span>
                  <span className="font-mono">
                    {formatApiTimestamp(verification.verified_at)}
                  </span>
                </div>
              </div>

              {(verification.message || verification.details) && (
                <p className="pt-1 font-mono">
                  Server Detail: {verification.message ?? verification.details}
                </p>
              )}
            </div>
          )}
        </Tactile3DCard>

        {/* Audit Events Table */}
        <section
          aria-labelledby="audit-events-heading"
          className="bg-white border border-[#CBD5E1] p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
            <h2 id="audit-events-heading" className="text-base font-bold text-[#0F1E36]">
              Recorded Regulatory Audit Events
            </h2>
            <span className="text-xs font-mono text-[#475569]">
              Source: GET /api/audit/logs
            </span>
          </div>

          {logsQuery.isLoading ? (
            <ApiLoadingState label="Retrieving audit trail from GET /api/audit/logs..." rows={5} />
          ) : logsQuery.isError ? (
            <ApiErrorState
              title="Failed to Retrieve Cryptographic Audit Logs"
              error={logsQuery.error}
              endpoint="GET /api/audit/logs"
              onRetry={() => void logsQuery.refetch()}
              isRetrying={logsQuery.isFetching}
            />
          ) : logs.length === 0 ? (
            <ApiEmptyState
              title="No Audit Events Returned by Backend"
              description="The backend returned an empty collection from GET /api/audit/logs."
              endpoint="GET /api/audit/logs"
            />
          ) : (
            <div className="overflow-x-auto border border-[#CBD5E1]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F4F6F9] border-b border-[#CBD5E1] text-[#0F1E36]">
                    <th className="py-2.5 px-3 font-semibold">Event ID</th>
                    <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                    <th className="py-2.5 px-3 font-semibold">Actor</th>
                    <th className="py-2.5 px-3 font-semibold">Action</th>
                    <th className="py-2.5 px-3 font-semibold">Entity Reference</th>
                    <th className="py-2.5 px-3 font-semibold">Previous Hash</th>
                    <th className="py-2.5 px-3 font-semibold">Current / Event Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {logs.map((entry) => (
                    <tr key={String(entry.id)} className="hover:bg-[#F8FAFC]">
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#0F1E36]">
                        #{String(entry.id)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#475569]">
                        {formatApiTimestamp(entry.timestamp ?? entry.created_at)}
                      </td>
                      <td className="py-2.5 px-3 text-[#0F1E36]">
                        {formatApiValue(entry.actor ?? entry.actor_id)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#1B365D]">
                        {formatApiValue(entry.action)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#334155]">
                        {entry.entity_type || entry.entity_id
                          ? `${entry.entity_type ?? 'Entity'} #${String(entry.entity_id ?? '')}`
                          : 'Not provided by API'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#475569] max-w-[180px] truncate">
                        {formatApiValue(entry.previous_hash ?? entry.prev_hash)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#0F1E36] max-w-[180px] truncate">
                        {formatApiValue(entry.current_hash ?? entry.hash)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
