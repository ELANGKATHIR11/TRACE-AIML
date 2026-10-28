import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  FileUp,
  RefreshCw,
  Send,
} from 'lucide-react';
import { DocumentRecord } from '../../types/api';
import { invalidateAllAppQueries } from '../../lib/api/cacheSync';
import {
  fetchApplicationDetail,
  fetchApplicationFlags,
  rectifyDocument,
  submitApplicationRectification,
} from '../../lib/api/endpoints';
import {
  ApplicantRectificationFormSchema,
  ApplicantRectificationFormValues,
} from '../../lib/schemas/apiSchemas';
import { canSubmitRectification } from '../../lib/permissions/roles';
import {
  formatApiTimestamp,
  formatApiValue,
  validateUploadFile,
} from '../../lib/utils/formatters';
import {
  ApiEmptyState,
  ApiErrorState,
  ApiLoadingState,
  StatusIndicator,
} from '../../components/ApiStateFeedback';
import { useAuth } from '../auth/AuthContext';

/** Empty number inputs must stay undefined (not NaN) so the optional amended figures validate. */
const optionalNumber = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : Number(v);

export function ApplicantDossierRectificationPage() {
  const { id } = useParams<{ id: string }>();
  const applicationId = id ?? '';
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [docNotes, setDocNotes] = useState<string>('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [rectifiedDocs, setRectifiedDocs] = useState<DocumentRecord[]>([]);

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

  const appDetail = detailQuery.data;
  const documents = appDetail?.documents ?? [];
  const flags = flagsQuery.data ?? appDetail?.flags ?? [];

  // Ownership is enforced by the backend (another institution's dossier is a 404); the UI gates
  // on role + workflow status only.
  const canRectify =
    user !== null && Boolean(appDetail?.status) && canSubmitRectification(user, appDetail?.status ?? '');

  const rectifyDocMutation = useMutation({
    mutationFn: rectifyDocument,
    retry: false,
    onSuccess: (updatedDoc) => {
      setRectifiedDocs((prev) => [updatedDoc, ...prev]);
      setReplacementFile(null);
      setDocNotes('');
      setFileError(null);
      invalidateAllAppQueries(queryClient, { applicationId, reason: 'DOCUMENT_RECTIFIED' });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ApplicantRectificationFormValues>({
    resolver: zodResolver(ApplicantRectificationFormSchema),
    defaultValues: {
      notes: '',
      land_area_acres: undefined,
      built_up_area_sqm: undefined,
    },
  });

  const submitRectificationMutation = useMutation({
    mutationFn: (values: ApplicantRectificationFormValues) =>
      submitApplicationRectification(applicationId, {
        notes: values.notes,
        // Only figures the applicant actually entered are sent; the backend merges them.
        amended: Object.fromEntries(
          Object.entries({
            land_area_acres: values.land_area_acres,
            built_up_area_sqm: values.built_up_area_sqm,
            total_intake: values.total_intake,
            faculty_count: values.faculty_count,
          }).filter(([, v]) => v !== undefined)
        ),
      }),
    retry: false,
    onSuccess: () => {
      reset();
      invalidateAllAppQueries(queryClient, { applicationId, reason: 'RECTIFICATION_SUBMITTED' });
    },
  });

  const handleRectifyDocSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId) {
      setFileError('Select an eligible document from the dossier to replace.');
      return;
    }
    if (!replacementFile) {
      setFileError('Select a replacement PDF, PNG, or JPEG document.');
      return;
    }
    const fileProblem = validateUploadFile(replacementFile);
    if (fileProblem) {
      setFileError(fileProblem);
      return;
    }
    setFileError(null);
    rectifyDocMutation.mutate({
      documentId: selectedDocId,
      file: replacementFile,
      notes: docNotes.trim() || undefined,
    });
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#CBD5E1] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-[#334155]">
              <Link
                to="/applicant/applications"
                className="inline-flex items-center gap-1 text-[#1B365D] hover:underline font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>My Permitted Applications</span>
              </Link>
              <span aria-hidden="true">/</span>
              <span className="font-mono">Dossier #{applicationId}</span>
            </div>
            <h1 className="text-2xl font-bold text-[#0F1E36] tracking-tight">
              Closed-Loop Deficiency Rectification — Dossier #{applicationId}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => {
              void detailQuery.refetch();
              void flagsQuery.refetch();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1B365D] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reload Dossier</span>
          </button>
        </div>

        {detailQuery.isLoading ? (
          <ApiLoadingState
            label={`Loading application dossier #${applicationId} from GET /api/applications/${applicationId}...`}
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
        ) : (
          <>
          {!canRectify && (
            <div
              role="status"
              className="border border-[#CBD5E1] bg-[#F8FAFC] p-5 text-xs text-[#334155]"
            >
              <strong>Rectification Not Open:</strong> Document replacement and rectification
              submission are available only while the dossier status is{' '}
              <code className="font-mono">RECTIFICATION_REQUESTED</code>. Current status:{' '}
              <code className="font-mono">{formatApiValue(appDetail?.status)}</code>.
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Reported Deficiencies & Document Replacement */}
            <div className="lg:col-span-6 space-y-6">
              <section className="bg-white border border-[#CBD5E1] p-5 space-y-3">
                <h2 className="text-sm font-bold text-[#0F1E36] border-b border-[#CBD5E1] pb-2">
                  01. Reported Deficiencies & Compliance Flags
                </h2>
                {flags.length === 0 ? (
                  <ApiEmptyState
                    title="No Active Deficiencies Returned"
                    description="GET /api/applications/{id}/flags returned zero active deficiency flags."
                    endpoint={`GET /api/applications/${applicationId}/flags`}
                  />
                ) : (
                  <div className="space-y-2.5">
                    {flags.map((flag) => (
                      <div
                        key={String(flag.id)}
                        className="p-3 border border-[#CBD5E1] bg-[#F8FAFC] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span>
                            Flag #{String(flag.id)} ·{' '}
                            {formatApiValue(flag.finding_type ?? flag.flag_type)}
                          </span>
                          <StatusIndicator value={flag.severity ?? flag.status} />
                        </div>
                        <p className="text-[#334155]">
                          {formatApiValue(flag.evidence_snippet ?? flag.description)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Step 2: Replace Eligible Document */}
              <section className="bg-white border border-[#CBD5E1] p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-[#CBD5E1] pb-2.5">
                  <FileUp className="w-4 h-4 text-[#1B365D]" aria-hidden="true" />
                  <div>
                    <h2 className="text-sm font-bold text-[#0F1E36]">
                      02. Upload Replacement Document
                    </h2>
                    <p className="text-xs text-[#334155]">
                      Target Endpoint:{' '}
                      <code className="font-mono">POST /api/documents/&#123;id&#125;/rectify</code>
                    </p>
                  </div>
                </div>

                <form onSubmit={handleRectifyDocSubmit} noValidate className="space-y-3 text-xs">
                  <div>
                    <label
                      htmlFor="rectify-doc-select"
                      className="block font-semibold text-[#0F1E36] mb-1"
                    >
                      Select Dossier Document Eligible for Correction *
                    </label>
                    <select
                      id="rectify-doc-select"
                      value={selectedDocId}
                      onChange={(e) => setSelectedDocId(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
                    >
                      <option value="">-- Select document from dossier --</option>
                      {documents.map((doc) => (
                        <option key={String(doc.id)} value={String(doc.id)}>
                          Doc #{String(doc.id)} —{' '}
                          {formatApiValue(doc.document_type ?? doc.category ?? doc.filename)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="rectify-file-input"
                      className="block font-semibold text-[#0F1E36] mb-1"
                    >
                      Replacement Document File (PDF, PNG, JPEG · Max 25 MB) *
                    </label>
                    <input
                      id="rectify-file-input"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      onChange={(e) => setReplacementFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-xs text-[#334155] file:mr-3 file:py-1.5 file:px-3 file:border file:border-[#CBD5E1] file:text-xs file:font-semibold file:bg-[#F4F6F9] file:text-[#1B365D] cursor-pointer"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="rectify-doc-notes"
                      className="block font-semibold text-[#0F1E36] mb-1"
                    >
                      Document Revision Notes (Optional)
                    </label>
                    <input
                      id="rectify-doc-notes"
                      type="text"
                      value={docNotes}
                      onChange={(e) => setDocNotes(e.target.value)}
                      placeholder="Describe updated certificate or stamp reference..."
                      className="w-full px-3 py-2 bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
                    />
                  </div>

                  {fileError && (
                    <p role="alert" className="text-[#B91C1C] font-medium">
                      {fileError}
                    </p>
                  )}

                  {rectifyDocMutation.isError && (
                    <ApiErrorState
                      title="Document Rectification Upload Failed"
                      error={rectifyDocMutation.error}
                      endpoint={`POST /api/documents/${selectedDocId || '{id}'}/rectify`}
                    />
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={!canRectify || rectifyDocMutation.isPending}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] disabled:opacity-60 cursor-pointer"
                    >
                      {rectifyDocMutation.isPending
                        ? 'Uploading Replacement...'
                        : 'Upload Replacement Document'}
                    </button>
                  </div>
                </form>

                {rectifiedDocs.length > 0 && (
                  <div className="pt-3 border-t border-[#CBD5E1] space-y-2 text-xs">
                    <div className="font-semibold text-[#15803D] flex items-center gap-1.5">
                      <FileCheck2 className="w-4 h-4" aria-hidden="true" />
                      <span>Server-Confirmed Document Replacements ({rectifiedDocs.length})</span>
                    </div>
                    {rectifiedDocs.map((d, i) => (
                      <div key={i} className="p-2 bg-[#F0FDF4] border border-[#86EFAC] font-mono">
                        Doc #{String(d.id)} · Status: {formatApiValue(d.status)}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Right Column: Step 3 — Submit Complete Application Rectification */}
            <div className="lg:col-span-6">
              <section className="bg-white border border-[#CBD5E1] p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-[#CBD5E1] pb-2.5">
                  <Send className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
                  <div>
                    <h2 className="text-sm font-bold text-[#0F1E36]">
                      03. Submit Amended Application Parameters & Rectification
                    </h2>
                    <p className="text-xs text-[#334155]">
                      Target Endpoint:{' '}
                      <code className="font-mono">
                        POST /api/applications/{applicationId}/submit-rectification
                      </code>
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleSubmit((vals) => submitRectificationMutation.mutate(vals))}
                  noValidate
                  className="space-y-4 text-xs"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="amend-land-area"
                        className="block font-semibold text-[#0F1E36] mb-1"
                      >
                        Amended Land Area (Acres, Optional)
                      </label>
                      <input
                        id="amend-land-area"
                        type="number"
                        step="0.01"
                        {...register('land_area_acres', { setValueAs: optionalNumber })}
                        className="w-full px-3 py-2 font-mono bg-[#F4F6F9] border border-[#CBD5E1]"
                      />
                      {errors.land_area_acres && (
                        <p role="alert" className="mt-1 text-[#B91C1C] font-medium">
                          {errors.land_area_acres.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <label
                        htmlFor="amend-built-up"
                        className="block font-semibold text-[#0F1E36] mb-1"
                      >
                        Amended Built-Up Area (m², Optional)
                      </label>
                      <input
                        id="amend-built-up"
                        type="number"
                        step="0.1"
                        {...register('built_up_area_sqm', { setValueAs: optionalNumber })}
                        className="w-full px-3 py-2 font-mono bg-[#F4F6F9] border border-[#CBD5E1]"
                      />
                      {errors.built_up_area_sqm && (
                        <p role="alert" className="mt-1 text-[#B91C1C] font-medium">
                          {errors.built_up_area_sqm.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="rectification-justification"
                      className="block font-semibold text-[#0F1E36] mb-1"
                    >
                      Rectification Summary & Compliance Justification
                    </label>
                    <textarea
                      id="rectification-justification"
                      rows={4}
                      placeholder="Provide item-by-item explanation of uploaded replacement deeds, NOC renewals, or amended parameters..."
                      {...register('notes')}
                      className="w-full px-3 py-2 bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
                    />
                    {errors.notes && (
                      <p role="alert" className="mt-1 text-[#B91C1C] font-medium">
                        {errors.notes.message}
                      </p>
                    )}
                  </div>

                  {submitRectificationMutation.isError && (
                    <ApiErrorState
                      title="Rectification Submission Failed"
                      error={submitRectificationMutation.error}
                      endpoint={`POST /api/applications/${applicationId}/submit-rectification`}
                    />
                  )}

                  {submitRectificationMutation.isSuccess && submitRectificationMutation.data && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="border border-[#86EFAC] bg-[#F0FDF4] p-3.5 text-[#14532D] space-y-1"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-[#15803D]" aria-hidden="true" />
                        <span>
                          Rectification Confirmed by Backend — Status:{' '}
                          {submitRectificationMutation.data.status}
                        </span>
                      </div>
                      <div className="font-mono">
                        Submitted At:{' '}
                        {formatApiTimestamp(submitRectificationMutation.data.submitted_at)} ·
                        Updated Fields:{' '}
                        {formatApiValue(
                          submitRectificationMutation.data.updated_fields?.length
                            ? submitRectificationMutation.data.updated_fields.join(', ')
                            : undefined
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!canRectify || submitRectificationMutation.isPending}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-60 cursor-pointer"
                    >
                      {submitRectificationMutation.isPending
                        ? 'Submitting Rectification...'
                        : 'Submit Closed-Loop Rectification'}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
          </>
        )}
      </div>
    </>
  );
}
