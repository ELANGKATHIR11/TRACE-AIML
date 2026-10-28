import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Cpu,
  FilePlus2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  fetchDashboardMetrics,
  fetchModelRegistry,
} from '../../lib/api/endpoints';
import {
  formatApiTimestamp,
  formatApiValue,
  formatConfidencePercentage,
} from '../../lib/utils/formatters';
import {
  ApiErrorState,
  ApiLoadingState,
  ApiUnavailableState,
  StatusIndicator,
} from '../../components/ApiStateFeedback';
import { DossierStack3D, Tactile3DCard } from '../../components/Tactile3DElements';
import { DossierRegistryTable } from '../applications/DossierRegistryTable';
import { ModelRegistryItem } from '../../types/api';

export function ExecutiveDashboardPage() {
  const metricsQuery = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: ({ signal }) => fetchDashboardMetrics(signal),
    retry: 1,
    refetchInterval: 10_000,
  });

  const modelsQuery = useQuery({
    queryKey: ['model-registry'],
    queryFn: ({ signal }) => fetchModelRegistry(signal),
    retry: false,
    refetchInterval: 15_000,
  });

  const metrics = metricsQuery.data;

  // Resolve ML models from either /api/dashboard/metrics or /api/models without inventing values
  const resolvedModels: ModelRegistryItem[] | null = React.useMemo(() => {
    if (modelsQuery.data && Array.isArray(modelsQuery.data) && modelsQuery.data.length > 0) {
      return modelsQuery.data;
    }
    if (metrics) {
      const embedded = metrics.models ?? metrics.model_registry;
      if (Array.isArray(embedded)) {
        return embedded as ModelRegistryItem[];
      }
      if (embedded && typeof embedded === 'object') {
        return Object.entries(embedded).map(([key, val]) => {
          if (typeof val === 'object' && val !== null) {
            return { name: key, ...(val as Record<string, unknown>) } as ModelRegistryItem;
          }
          return { name: key, status: String(val) };
        });
      }
    }
    return null;
  }, [modelsQuery.data, metrics]);

  const gatewayBreakdown =
    metrics?.verification_gateway_breakdown ?? metrics?.gateway_breakdown ?? null;

  return (
    <div className="space-y-6 animate-dossier-settle">
      {/* Page Heading & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#CBD5E1] pb-4">
        <div className="flex items-center gap-3.5">
          <DossierStack3D variant="navy" />
          <div>
            <h1 className="text-2xl font-bold text-[#0F1E36] tracking-tight">
              Executive Scrutiny Cockpit
            </h1>
            <p className="text-xs text-[#334155] mt-1">
              Live regulatory metrics, statutory verification gateway telemetry, and application dossier registry.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              void metricsQuery.refetch();
              void modelsQuery.refetch();
            }}
            disabled={metricsQuery.isFetching}
            className="btn-tactile-3d inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#1B365D] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${metricsQuery.isFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh Executive Metrics</span>
          </button>

          <Link
            to="/audit"
            className="btn-tactile-3d inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#1B365D] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] whitespace-nowrap shrink-0"
          >
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Verify Audit Chain</span>
          </Link>

          <Link
            to="/applications/new"
            className="btn-tactile-3d inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#C2410C] hover:bg-[#9A3412] whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Submit Application Intake</span>
          </Link>
        </div>
      </div>

      {/* Section 1: Executive Metrics (GET /api/dashboard/metrics) */}
      <section aria-labelledby="executive-metrics-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="executive-metrics-heading" className="text-sm font-bold text-[#0F1E36]">
            01. Statutory Scrutiny Metrics (<code className="font-mono font-normal">GET /api/dashboard/metrics</code>)
          </h2>
          {metrics?.generated_at && (
            <span className="text-xs font-mono text-[#475569]">
              Server Timestamp: {formatApiTimestamp(metrics.generated_at)}
            </span>
          )}
        </div>

        {metricsQuery.isLoading ? (
          <ApiLoadingState
            label="Fetching executive scrutiny metrics from GET /api/dashboard/metrics..."
            rows={2}
          />
        ) : metricsQuery.isError ? (
          <ApiErrorState
            title="Executive Metrics Endpoint Unreachable or Returned Error"
            error={metricsQuery.error}
            endpoint="GET /api/dashboard/metrics"
            onRetry={() => void metricsQuery.refetch()}
            isRetrying={metricsQuery.isFetching}
          />
        ) : metrics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Tactile3DCard className="bg-white border border-[#CBD5E1] p-5">
                <div className="text-xs font-medium text-[#475569]">Total Applications</div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#0F1E36]">
                  {formatApiValue(metrics.total_applications)}
                </div>
                <div className="mt-2 text-xs text-[#334155]">
                  <Link to="/applications" className="text-[#1B365D] hover:underline font-medium">
                    View Dossier Registry →
                  </Link>
                </div>
              </Tactile3DCard>

              <Tactile3DCard className="bg-white border border-[#CBD5E1] p-5">
                <div className="text-xs font-medium text-[#475569]">Applications Under Review</div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#1B365D]">
                  {formatApiValue(metrics.applications_under_review ?? metrics.under_review)}
                </div>
                <div className="mt-2 text-xs text-[#475569]">
                  Source: <code className="font-mono">/api/dashboard/metrics</code>
                </div>
              </Tactile3DCard>

              <Tactile3DCard className="bg-white border border-[#CBD5E1] p-5">
                <div className="text-xs font-medium text-[#475569]">
                  Applications With Deficiencies
                </div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#9A3412]">
                  {formatApiValue(
                    metrics.applications_with_deficiencies ?? metrics.deficiencies_flagged
                  )}
                </div>
                <div className="mt-2 text-xs text-[#475569]">
                  Advisory flags requiring officer review
                </div>
              </Tactile3DCard>

              <Tactile3DCard className="bg-white border border-[#CBD5E1] p-5">
                <div className="text-xs font-medium text-[#475569]">
                  Approved / Escalated Determinations
                </div>
                <div className="mt-2 text-lg font-bold font-mono tabular-nums text-[#0F1E36]">
                  {metrics.approved_applications !== undefined ||
                  metrics.escalated_applications !== undefined
                    ? `${formatApiValue(metrics.approved_applications)} / ${formatApiValue(
                        metrics.escalated_applications
                      )}`
                    : 'Not provided by API'}
                </div>
                <div className="mt-2 text-xs text-[#475569]">
                  Time range: {formatApiValue(metrics.time_range)}
                </div>
              </Tactile3DCard>
            </div>

            {/* Verification Gateway Breakdown */}
            <div className="bg-white border border-[#CBD5E1] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-[#1B365D]" aria-hidden="true" />
                <h3 className="text-sm font-bold text-[#0F1E36]">
                  Statutory Verification Gateway Breakdown
                </h3>
              </div>

              {!gatewayBreakdown ? (
                <p className="text-xs text-[#475569]">
                  Verification gateway breakdown field (<code className="font-mono">verification_gateway_breakdown</code>) was not provided by <code className="font-mono">GET /api/dashboard/metrics</code>.
                </p>
              ) : Array.isArray(gatewayBreakdown) ? (
                <div className="overflow-x-auto border border-[#CBD5E1]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F4F6F9] border-b border-[#CBD5E1]">
                        <th className="py-2 px-3 font-semibold">Issuing Authority / Gateway</th>
                        <th className="py-2 px-3 font-semibold text-right">Verified</th>
                        <th className="py-2 px-3 font-semibold text-right">Mismatch</th>
                        <th className="py-2 px-3 font-semibold text-right">Pending</th>
                        <th className="py-2 px-3 font-semibold text-right">Total / Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {gatewayBreakdown.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-mono font-semibold text-[#0F1E36]">
                            {formatApiValue(item.gateway ?? item.authority)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-[#15803D]">
                            {formatApiValue(item.verified)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-[#B91C1C]">
                            {formatApiValue(item.mismatch)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-[#9A3412]">
                            {formatApiValue(item.pending)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {formatApiValue(item.total ?? item.count ?? item.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {Object.entries(gatewayBreakdown).map(([key, val]) => (
                    <div key={key} className="p-3 bg-[#F4F6F9] border border-[#CBD5E1]">
                      <div className="text-xs font-mono font-semibold text-[#0F1E36]">{key}</div>
                      <div className="mt-1 text-sm font-mono tabular-nums text-[#334155]">
                        {typeof val === 'object' && val !== null
                          ? JSON.stringify(val)
                          : formatApiValue(val)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {/* Section 2: ML Model Registry */}
      <section aria-labelledby="model-registry-heading" className="space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#1B365D]" aria-hidden="true" />
          <h2 id="model-registry-heading" className="text-sm font-bold text-[#0F1E36]">
            02. ML Model Registry & Evaluation Telemetry
          </h2>
        </div>

        {modelsQuery.isLoading && metricsQuery.isLoading ? (
          <ApiLoadingState label="Querying backend for ML model registry telemetry..." rows={2} />
        ) : resolvedModels && resolvedModels.length > 0 ? (
          <div className="overflow-x-auto bg-white border border-[#CBD5E1]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4F6F9] border-b border-[#CBD5E1] text-[#0F1E36]">
                  <th className="py-2.5 px-3 font-semibold">Model Name</th>
                  <th className="py-2.5 px-3 font-semibold">Version</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Accuracy</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Precision</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Recall</th>
                  <th className="py-2.5 px-3 font-semibold text-right">F1 Score</th>
                  <th className="py-2.5 px-3 font-semibold">Last Updated</th>
                  <th className="py-2.5 px-3 font-semibold">Provenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {resolvedModels.map((model, idx) => {
                  const acc = model.accuracy ?? model.metrics?.accuracy;
                  const prec = model.precision ?? model.metrics?.precision;
                  const rec = model.recall ?? model.metrics?.recall;
                  const f1 = model.f1_score ?? model.metrics?.f1_score ?? model.metrics?.f1;
                  return (
                    <tr key={model.id ?? model.name ?? idx}>
                      <td className="py-2.5 px-3 font-semibold text-[#0F1E36]">
                        {formatApiValue(model.name)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#334155]">
                        {formatApiValue(model.version)}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusIndicator value={model.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatConfidencePercentage(acc)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatConfidencePercentage(prec)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatConfidencePercentage(rec)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatConfidencePercentage(f1)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#475569]">
                        {formatApiTimestamp(model.last_updated ?? model.updated_at)}
                      </td>
                      <td className="py-2.5 px-3 text-[#334155]">
                        {formatApiValue(model.provenance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <ApiUnavailableState
            capability="ML Model Registry (TF-IDF Document Classifier / Random Forest Forgery Detector)"
            endpoint="GET /api/models (or /api/dashboard/metrics.models)"
            reason="Model registry evaluation metrics were not returned by the backend. Per the Absolute Zero-Mock Policy, no accuracy, precision, recall, F1 scores, or operational model statuses are fabricated."
          />
        )}
      </section>

      {/* Section 3: Dossier Registry */}
      <DossierRegistryTable title="03. Application Dossier Registry" />
    </div>
  );
}
