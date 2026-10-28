import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Gavel,
  Landmark,
  RefreshCw,
  Scale,
} from 'lucide-react';
import {
  ComplianceFlag,
  MetricComparisonRow,
  OfficerDecisionType,
} from '../../types/api';
import { invalidateAllAppQueries } from '../../lib/api/cacheSync';
import {
  fetchApplicationDetail,
  fetchApplicationFlags,
  fetchAuthorityVerifications,
  submitOfficerDecision,
  triggerAgentReview,
} from '../../lib/api/endpoints';
import {
  OfficerDecisionFormSchema,
  OfficerDecisionFormValues,
} from '../../lib/schemas/apiSchemas';
import { canDecide } from '../../lib/permissions/roles';
import { ApiClientError } from '../../lib/api/transport';
import {
  formatApiTimestamp,
  formatApiValue,
  formatConfidencePercentage,
} from '../../lib/utils/formatters';
import {
  ApiEmptyState,
  ApiErrorState,
  ApiLoadingState,
  ApiUnavailableState,
  StatusIndicator,
} from '../../components/ApiStateFeedback';
import { StatutoryBanner } from '../../components/StatutoryBanner';
import { DossierStack3D, Tactile3DCard } from '../../components/Tactile3DElements';
import { useAuth } from '../auth/AuthContext';
import { EvidenceCanvasViewer } from '../documents/EvidenceCanvasViewer';

export function ScrutinyCockpitPage() {
  const { id } = useParams<{ id: string }>();
  const applicationId = id ?? '';
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const mayDecide = user !== null && canDecide(user.role);

  const [selectedDocId, setSelectedDocId] = useState<string | number | null>(null);
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const [highlightTerms, setHighlightTerms] = useState<string[]>([]);
  const [activeFinding, setActiveFinding] = useState<ComplianceFlag | null>(null);

  const detailQuery = useQuery({
    queryKey: ['application-detail', applicationId],
    queryFn: ({ signal }) => fetchApplicationDetail(applicationId, signal),
    enabled: Boolean(applicationId),
    retry: 1,
  });

  const flagsQuery = useQuery({
    queryKey: ['application-flags', applicationId],
    queryFn: ({ signal }) => fetchApplicationFlags(applicationId, signal),
    enabled: Boolean(applicationId),
    retry: 1,
  });

  const verificationsQuery = useQuery({
    queryKey: ['application-verifications', applicationId],
    queryFn: ({ signal }) => fetchAuthorityVerifications(applicationId, signal),
    enabled: Boolean(applicationId),
    retry: false,
  });

  const agentReviewMutation = useMutation({
    mutationFn: () => triggerAgentReview(applicationId),
    retry: false,
    onSuccess: () => {
      invalidateAllAppQueries(queryClient, { applicationId, reason: 'AGENT_REVIEW_COMPLETED' });
    },
  });

  const {
    register,
    handleSubmit,
    reset: resetDecisionForm,
    formState: { errors: decisionErrors },
  } = useForm<OfficerDecisionFormValues>({
    resolver: zodResolver(OfficerDecisionFormSchema),
    defaultValues: {
      decision: OfficerDecisionType.APPROVE,
      notes: '',
    },
  });

  const decisionMutation = useMutation({
    mutationFn: (values: OfficerDecisionFormValues) =>
      submitOfficerDecision(applicationId, {
        decision: values.decision as OfficerDecisionType,
        notes: values.notes,
      }),
    retry: false, // Binding statutory decisions are never auto-retried
    onSuccess: () => {
      resetDecisionForm();
      invalidateAllAppQueries(queryClient, { applicationId, reason: 'OFFICER_DECISION_SUBMITTED' });
    },
  });

  const appDetail = detailQuery.data;
  const documents = appDetail?.documents ?? [];
  const flags = flagsQuery.data ?? appDetail?.flags ?? [];
  const agentReviewResult = agentReviewMutation.data ?? appDetail?.agent_review ?? null;
  // 503 means the local AI model is down: an unavailable capability, not a failed request.
  const agentReviewUnavailable =
    agentReviewMutation.error instanceof ApiClientError && agentReviewMutation.error.status === 503
      ? agentReviewMutation.error
      : null;
  const verificationRows =
    verificationsQuery.data ??
    (Array.isArray(appDetail?.authority_verifications) ? appDetail.authority_verifications : []);

  // Build Metric Comparison rows strictly from backend-returned data (never invent baseline figures)
  const metricRows: MetricComparisonRow[] = React.useMemo(() => {
    if (!appDetail) return [];
    if (Array.isArray(appDetail.discrepancies) && appDetail.discrepancies.length > 0) {
      return appDetail.discrepancies;
    }
    if (
      Array.isArray(appDetail.metric_comparisons) &&
      appDetail.metric_comparisons.length > 0
    ) {
      return appDetail.metric_comparisons;
    }
    const baselines = appDetail.baselines ?? {};
    return [
      {
        field_name: 'Declared Land Area (Acres)',
        declared_value: appDetail.declared_land_area ?? appDetail.land_area_acres,
        baseline_value: (baselines.declared_land_area ?? baselines.land_area) as
          | string
          | number
          | undefined,
        provenance: baselines.declared_land_area ? 'Backend baseline' : undefined,
        verification_status: appDetail.status,
      },
      {
        field_name: 'Built-Up Area (m²)',
        declared_value: appDetail.built_up_area ?? appDetail.built_up_area_sqm,
        baseline_value: (baselines.built_up_area ?? baselines.built_up_area_sqm) as
          | string
          | number
          | undefined,
        provenance: baselines.built_up_area ? 'Backend baseline' : undefined,
        verification_status: appDetail.status,
      },
      {
        field_name: 'Total Intake (Seats)',
        declared_value: appDetail.total_intake ?? appDetail.intake,
        baseline_value: (baselines.total_intake ?? baselines.intake) as
          | string
          | number
          | undefined,
        provenance: baselines.total_intake ? 'Backend baseline' : undefined,
        verification_status: appDetail.status,
      },
      {
        field_name: 'Declared Faculty Count',
        declared_value: appDetail.faculty_count,
        baseline_value: baselines.faculty_count as string | number | undefined,
        provenance: baselines.faculty_count ? 'Backend baseline' : undefined,
        verification_status: appDetail.status,
      },
    ];
  }, [appDetail]);

  const handleFindingClick = (finding: ComplianceFlag) => {
    setActiveFinding(finding);
    const docId = finding.source_document_id ?? finding.document_id;
    if (docId !== undefined && docId !== null) {
      setSelectedDocId(docId);
    }
    const targetPage = finding.page ?? finding.page_number;
    if (targetPage && targetPage >= 1) {
      setSelectedPage(targetPage);
    }
    if (Array.isArray(finding.highlight_terms) && finding.highlight_terms.length > 0) {
      setHighlightTerms(finding.highlight_terms);
    } else if (finding.evidence_snippet || finding.snippet) {
      const snippet = (finding.evidence_snippet || finding.snippet || '').trim();
      const firstToken = snippet.split(/\s+/).slice(0, 3).join(' ');
      if (firstToken) setHighlightTerms([firstToken]);
    }
  };

  return (
    <>
      <div className="space-y-5 animate-dossier-settle">
        {/* Breadcrumb & Dossier Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#CBD5E1] pb-4">
          <div className="flex items-center gap-3.5">
            <DossierStack3D variant="navy" />
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-[#334155]">
                <Link
                  to="/applications"
                  className="inline-flex items-center gap-1 text-[#1B365D] hover:underline font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Dossier Registry</span>
                </Link>
                <span aria-hidden="true">/</span>
                <span className="font-mono">Dossier #{applicationId}</span>
              </div>
              <h1 className="text-2xl font-bold text-[#0F1E36] tracking-tight">
                Dual-Pane Statutory Scrutiny Cockpit — Dossier #{applicationId}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {appDetail && <StatusIndicator value={appDetail.status} />}
            <button
              type="button"
              onClick={() => {
                void detailQuery.refetch();
                void flagsQuery.refetch();
                void verificationsQuery.refetch();
              }}
              className="btn-tactile-3d inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1B365D] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reload Dossier</span>
            </button>
          </div>
        </div>

        {/* Dual-Pane Workspace: Left 45% Analysis / Right 55% Sticky Evidence Canvas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT PANE (~45% -> 5 cols on 12-col grid or custom 45/55 split) */}
          <div className="lg:col-span-5 space-y-6">
            {/* A. Metric Discrepancy & Baseline Comparison Table */}
            <section
              aria-labelledby="discrepancy-table-heading"
              className="tactile-3d-surface bg-white border border-[#CBD5E1] p-5 space-y-3"
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#CBD5E1] pb-2.5">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-[#1B365D] shrink-0" aria-hidden="true" />
                  <h2 id="discrepancy-table-heading" className="text-sm font-bold text-[#0F1E36]">
                    A. Metric Discrepancy & Baseline Table
                  </h2>
                </div>
                <span className="text-xs font-mono text-[#475569] whitespace-nowrap shrink-0">
                  GET /api/applications/{applicationId}
                </span>
              </div>

              {detailQuery.isLoading ? (
                <ApiLoadingState
                  label={`Fetching dossier #${applicationId} from GET /api/applications/${applicationId}...`}
                  rows={4}
                />
              ) : detailQuery.isError ? (
                <ApiErrorState
                  title={`Failed to Load Application Dossier #${applicationId}`}
                  error={detailQuery.error}
                  endpoint={`GET /api/applications/${applicationId}`}
                  onRetry={() => void detailQuery.refetch()}
                  isRetrying={detailQuery.isFetching}
                />
              ) : appDetail ? (
                <div className="space-y-3">
                  <div className="text-xs text-[#334155] flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      <strong>Institution:</strong>{' '}
                      {formatApiValue(
                        appDetail.institution_name ??
                          (appDetail.institution_id ? `Institution #${appDetail.institution_id}` : null)
                      )}
                    </span>
                    <span>
                      <strong>Category:</strong>{' '}
                      {formatApiValue(appDetail.category ?? appDetail.application_category)}
                    </span>
                    <span>
                      <strong>Academic Year:</strong> {formatApiValue(appDetail.academic_year)}
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-[#CBD5E1]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#F4F6F9] border-b border-[#CBD5E1] text-[#0F1E36]">
                          <th className="py-2 px-2.5 font-semibold">Parameter</th>
                          <th className="py-2 px-2.5 font-semibold text-right">Declared</th>
                          <th className="py-2 px-2.5 font-semibold text-right">
                            Authorized Baseline
                          </th>
                          <th className="py-2 px-2.5 font-semibold">Provenance / Diff</th>
                          <th className="py-2 px-2.5 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {metricRows.map((row, idx) => (
                          <tr key={row.field_name || idx}>
                            <td className="py-2 px-2.5 font-medium text-[#0F1E36]">
                              {row.label || row.field_name}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold text-[#0F1E36]">
                              {formatApiValue(row.declared_value)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono tabular-nums text-[#334155]">
                              {formatApiValue(row.baseline_value ?? row.reference_value)}
                            </td>
                            <td className="py-2 px-2.5 text-[#475569]">
                              {formatApiValue(row.difference ?? row.provenance ?? row.source)}
                            </td>
                            <td className="py-2 px-2.5">
                              <StatusIndicator value={row.verification_status ?? row.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </section>

            {/* B. Explainable AI and Forensic Findings */}
            <section
              aria-labelledby="forensic-findings-heading"
              className="tactile-3d-surface bg-white border border-[#CBD5E1] p-5 space-y-3"
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#CBD5E1] pb-2.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#C2410C] shrink-0" aria-hidden="true" />
                  <h2 id="forensic-findings-heading" className="text-sm font-bold text-[#0F1E36]">
                    B. Explainable AI & Forensic Findings (Advisory)
                  </h2>
                </div>
                <span className="text-xs font-mono text-[#475569] whitespace-nowrap shrink-0">
                  GET /api/applications/{applicationId}/flags
                </span>
              </div>

              {flagsQuery.isLoading ? (
                <ApiLoadingState
                  label="Retrieving explainable AI & forensic flags..."
                  rows={3}
                />
              ) : flagsQuery.isError ? (
                <ApiErrorState
                  title="Compliance Flags Endpoint Failed"
                  error={flagsQuery.error}
                  endpoint={`GET /api/applications/${applicationId}/flags`}
                  onRetry={() => void flagsQuery.refetch()}
                  isRetrying={flagsQuery.isFetching}
                />
              ) : flags.length === 0 ? (
                <ApiEmptyState
                  title="No Compliance or Forensic Flags Returned"
                  description="The backend returned zero flags for this dossier."
                  endpoint={`GET /api/applications/${applicationId}/flags`}
                />
              ) : (
                <div className="space-y-3">
                  {flags.map((flag) => {
                    const isSelected = activeFinding?.id === flag.id;
                    return (
                      <div
                        key={String(flag.id)}
                        className={`border p-3.5 text-xs space-y-2 transition-colors ${
                          isSelected
                            ? 'border-[#1B365D] bg-[#F8FAFC]'
                            : 'border-[#CBD5E1] bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-[#0F1E36]">
                            Finding #{String(flag.id)} ·{' '}
                            {formatApiValue(flag.finding_type ?? flag.flag_type ?? flag.type)}
                          </span>
                          <StatusIndicator value={flag.severity ?? flag.status} />
                        </div>

                        {(flag.evidence_snippet || flag.snippet || flag.description) && (
                          <blockquote className="p-2.5 bg-[#F4F6F9] border border-[#CBD5E1] font-mono text-[#0F1E36]">
                            {flag.evidence_snippet ?? flag.snippet ?? flag.description}
                          </blockquote>
                        )}

                        <div className="grid grid-cols-2 gap-2 text-[#334155]">
                          <div>
                            <strong>Source Document:</strong>{' '}
                            {formatApiValue(
                              flag.source_document_name ??
                                flag.document_type ??
                                flag.source_document_id ??
                                flag.document_id
                            )}
                          </div>
                          <div>
                            <strong>Page:</strong>{' '}
                            <span className="font-mono">
                              {formatApiValue(flag.page ?? flag.page_number)}
                            </span>
                          </div>
                          <div>
                            <strong>Confidence:</strong>{' '}
                            <span className="font-mono">
                              {formatConfidencePercentage(
                                flag.confidence ?? flag.confidence_score
                              )}
                            </span>
                          </div>
                          <div>
                            <strong>Model Provenance:</strong>{' '}
                            {formatApiValue(flag.model_provenance ?? flag.model_name)}
                          </div>
                        </div>

                        {(flag.statutory_reference || flag.suggested_action) && (
                          <div className="pt-1 border-t border-[#E2E8F0] text-[#334155] space-y-1">
                            {flag.statutory_reference && (
                              <div>
                                <strong>Statutory Ref:</strong> {flag.statutory_reference}
                              </div>
                            )}
                            {flag.suggested_action && (
                              <div>
                                <strong>Suggested Action:</strong> {flag.suggested_action}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleFindingClick(flag)}
                            className="px-3 py-1 text-xs font-semibold text-[#1B365D] bg-[#F4F6F9] border border-[#CBD5E1] hover:bg-[#E2E8F0] cursor-pointer"
                          >
                            Select Document & Request Highlight in Evidence Canvas →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* C. Statutory Issuing-Authority Hub */}
            <section
              aria-labelledby="authority-hub-heading"
              className="tactile-3d-surface bg-white border border-[#CBD5E1] p-5 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-2.5">
                <div className="flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-[#1B365D]" aria-hidden="true" />
                  <h2 id="authority-hub-heading" className="text-sm font-bold text-[#0F1E36]">
                    C. Statutory Issuing-Authority Hub
                  </h2>
                </div>
              </div>

              <div className="overflow-x-auto border border-[#CBD5E1]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F4F6F9] border-b border-[#CBD5E1] text-[#0F1E36]">
                      <th className="py-2 px-2.5 font-semibold">Issuing Authority / Document</th>
                      <th className="py-2 px-2.5 font-semibold">Backend Status</th>
                      <th className="py-2 px-2.5 font-semibold">Provenance / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {verificationRows.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-2 px-2.5 text-[#475569]">
                          {verificationsQuery.isError
                            ? 'Verification records could not be retrieved from the backend.'
                            : 'No active verification record returned by backend'}
                        </td>
                      </tr>
                    ) : (
                      verificationRows.map((row, idx) => {
                        const details =
                          row.details ??
                          row.provenance ??
                          (row.reference_id ? `Reference ${row.reference_id}` : undefined) ??
                          row.checked_at ??
                          row.verified_at;
                        return (
                          <tr key={String(row.document_id ?? `row-${idx}`)}>
                            <td className="py-2 px-2.5 font-mono font-semibold text-[#0F1E36]">
                              {formatApiValue(row.authority_name ?? row.authority_id ?? row.document_type)}
                              {row.document_type && (
                                <div className="font-normal text-[#475569]">
                                  {row.document_type}
                                  {row.document_id !== undefined && row.document_id !== null
                                    ? ` · Doc #${String(row.document_id)}`
                                    : ''}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2.5">
                              <StatusIndicator value={row.status} />
                            </td>
                            <td className="py-2 px-2.5 text-[#475569]">
                              {formatApiValue(details)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* D. Multi-Agent AI Advisory Panel */}
            <section
              aria-labelledby="agent-review-heading"
              className="tactile-3d-surface bg-white border border-[#CBD5E1] p-5 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-2.5">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[#1B365D]" aria-hidden="true" />
                  <h2 id="agent-review-heading" className="text-sm font-bold text-[#0F1E36]">
                    D. Multi-Agent AI Advisory Review
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => agentReviewMutation.mutate()}
                  disabled={agentReviewMutation.isPending}
                  className="btn-tactile-3d px-3 py-1.5 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {agentReviewMutation.isPending
                    ? 'Executing POST /agent-review...'
                    : 'Trigger Backend AI Review'}
                </button>
              </div>

              <p className="text-xs text-[#475569]">
                Target Endpoint:{' '}
                <code className="font-mono">
                  POST /api/applications/{applicationId}/agent-review
                </code>
                . Stages and technologies are displayed strictly when confirmed by the backend response.
              </p>

              {agentReviewUnavailable ? (
                <ApiUnavailableState
                  capability="AI Advisory Review"
                  endpoint={`POST /api/applications/${applicationId}/agent-review`}
                  reason={`${agentReviewUnavailable.detail}. The local AI model is not reachable; no simulated review is shown. Retry once the model service is running.`}
                />
              ) : (
                agentReviewMutation.isError && (
                  <ApiErrorState
                    title="AI Advisory Review Execution Failed"
                    error={agentReviewMutation.error}
                    endpoint={`POST /api/applications/${applicationId}/agent-review`}
                  />
                )
              )}

              {agentReviewResult ? (
                <div className="space-y-3 text-xs border border-[#CBD5E1] bg-[#F8FAFC] p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#0F1E36]">
                      Execution Status: <StatusIndicator value={agentReviewResult.status} />
                    </span>
                    <span className="font-mono text-[#475569]">
                      {formatApiTimestamp(agentReviewResult.executed_at)}
                    </span>
                  </div>

                  {agentReviewResult.summary && (
                    <p className="text-[#0F1E36] leading-relaxed">{agentReviewResult.summary}</p>
                  )}

                  {(agentReviewResult.stages ??
                    agentReviewResult.agents ??
                    agentReviewResult.steps)?.map((stage, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-white border border-[#CBD5E1] space-y-1"
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span>
                          Stage {idx + 1}:{' '}
                          {formatApiValue(
                            stage.stage_name ?? stage.agent_name ?? stage.name
                          )}
                        </span>
                        <StatusIndicator value={stage.status} />
                      </div>
                      {stage.summary && <p className="text-[#334155]">{stage.summary}</p>}
                    </div>
                  ))}
                </div>
              ) : agentReviewUnavailable ? null : (
                <ApiUnavailableState
                  capability="AI Advisory Execution Result"
                  endpoint={`POST /api/applications/${applicationId}/agent-review`}
                  reason="No agent review output has been returned for this dossier yet. Click 'Trigger Backend AI Review' to invoke the server pipeline."
                />
              )}
            </section>

            {/* E. Officer Adjudication */}
            <section
              aria-labelledby="officer-adjudication-heading"
              className="tactile-3d-surface bg-white border border-[#CBD5E1] p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-2.5">
                <div className="flex items-center gap-2">
                  <Gavel className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
                  <h2 id="officer-adjudication-heading" className="text-sm font-bold text-[#0F1E36]">
                    E. Competent Authority Adjudication
                  </h2>
                </div>
                <span className="text-xs font-mono text-[#475569]">
                  POST /api/applications/{applicationId}/decision
                </span>
              </div>

              <StatutoryBanner compact />

              {!mayDecide ? (
                <ApiUnavailableState
                  capability="Binding Statutory Determination"
                  endpoint={`POST /api/applications/${applicationId}/decision`}
                  reason="Only scrutiny reviewers record binding decisions. Your role can review this dossier but not adjudicate it."
                />
              ) : (
                <form
                  onSubmit={handleSubmit((vals) => decisionMutation.mutate(vals))}
                  noValidate
                  className="space-y-4"
                >
                  <div>
                    <label
                      htmlFor="officer-decision-select"
                      className="block text-xs font-semibold text-[#0F1E36] mb-1"
                    >
                      Binding Statutory Determination *
                    </label>
                    <select
                      id="officer-decision-select"
                      {...register('decision')}
                      className="w-full px-3 py-2 text-xs font-semibold bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
                    >
                      <option value={OfficerDecisionType.APPROVE}>
                        APPROVE — Grant Statutory Approval
                      </option>
                      <option value={OfficerDecisionType.REQUEST_RECTIFICATION}>
                        REQUEST_RECTIFICATION — Issue Deficiency Notice for Rectification
                      </option>
                      <option value={OfficerDecisionType.REJECT}>
                        REJECT — Refuse Statutory Approval
                      </option>
                    </select>
                    {decisionErrors.decision && (
                      <p role="alert" className="mt-1 text-xs text-[#B91C1C] font-medium">
                        {decisionErrors.decision.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="officer-notes-textarea"
                      className="block text-xs font-semibold text-[#0F1E36] mb-1"
                    >
                      Reasoned Scrutiny & Adjudication Notes *
                    </label>
                    <textarea
                      id="officer-notes-textarea"
                      rows={3}
                      placeholder="Record reasoned statutory observations, documentary references, and grounds for determination..."
                      {...register('notes')}
                      className="w-full px-3 py-2 text-xs bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
                    />
                    {decisionErrors.notes && (
                      <p role="alert" className="mt-1 text-xs text-[#B91C1C] font-medium">
                        {decisionErrors.notes.message}
                      </p>
                    )}
                  </div>

                  {decisionMutation.isError && (
                    <ApiErrorState
                      title="Officer Adjudication Submission Failed"
                      error={decisionMutation.error}
                      endpoint={`POST /api/applications/${applicationId}/decision`}
                    />
                  )}

                  {decisionMutation.isSuccess && decisionMutation.data && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="border border-[#86EFAC] bg-[#F0FDF4] p-3.5 text-xs text-[#14532D] space-y-1"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-[#15803D]" aria-hidden="true" />
                        <span>
                          Server Confirmed Determination: {decisionMutation.data.decision}
                        </span>
                      </div>
                      <div className="font-mono">
                        Timestamp: {formatApiTimestamp(decisionMutation.data.decided_at ?? decisionMutation.data.timestamp)} · Audit Hash:{' '}
                        {formatApiValue(decisionMutation.data.audit_hash)}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={decisionMutation.isPending}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {decisionMutation.isPending
                        ? 'Recording Decision on Backend...'
                        : 'Record Binding Statutory Decision'}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>

          {/* RIGHT PANE (~55% -> 7 cols on 12-col grid): Sticky Evidence Canvas */}
          <div className="lg:col-span-7 lg:sticky lg:top-6">
            <EvidenceCanvasViewer
              documents={documents}
              selectedDocumentId={selectedDocId}
              onSelectDocument={(docId) => setSelectedDocId(docId)}
              activeHighlightTerms={highlightTerms}
              activePage={selectedPage}
              onPageChange={(p) => setSelectedPage(p)}
              activeFinding={activeFinding}
            />
          </div>
        </div>
      </div>
    </>
  );
}
