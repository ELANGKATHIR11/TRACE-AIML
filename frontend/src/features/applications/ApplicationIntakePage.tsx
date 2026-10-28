import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  FileUp,
  FolderPlus,
  Upload,
} from 'lucide-react';
import {
  ApplicationIntakeFormSchema,
  ApplicationIntakeFormValues,
} from '../../lib/schemas/apiSchemas';
import { invalidateAllAppQueries } from '../../lib/api/cacheSync';
import {
  createApplication,
  uploadApplicationDocument,
} from '../../lib/api/endpoints';
import { ApiClientError } from '../../lib/api/transport';
import {
  ApplicationRecord,
  DocumentCategory,
  DocumentRecord,
} from '../../types/api';
import {
  formatApiTimestamp,
  formatApiValue,
  validateUploadFile,
} from '../../lib/utils/formatters';
import { ApiErrorState, StatusIndicator } from '../../components/ApiStateFeedback';
import { DossierStack3D, Tactile3DCard } from '../../components/Tactile3DElements';

// Mirrors the backend ApplicationCategory enum.
const SUPPORTED_APPLICATION_CATEGORIES = [
  'NEW_INSTITUTION',
  'EXTENSION_OF_APPROVAL',
  'INCREASE_IN_INTAKE',
  'CHANGE_OF_SITE_OR_INFRA',
];

const SUPPORTED_DOCUMENT_CATEGORIES = [
  { value: 'LAND_OWNERSHIP_DOCUMENT', label: 'Land Deed / Land Ownership Document' },
  { value: 'FIRE_SAFETY_CERTIFICATE', label: 'Fire Safety Certificate (NOC)' },
  { value: 'BUILDING_PLAN_CERTIFICATE', label: 'Approved Building Plan Certificate' },
  { value: 'AFFIDAVIT', label: 'Statutory Affidavit (Land & Anti-Ragging)' },
  { value: 'ACCREDITATION_CERTIFICATE', label: 'Accreditation Certificate (NBA / NAAC)' },
  { value: 'FACULTY_ROSTER', label: 'Faculty Roster & Qualifications' },
  { value: 'PREVIOUS_EOA_LETTER', label: 'Previous AICTE EoA Approval Letter' },
  { value: 'INFRASTRUCTURE_EVIDENCE', label: 'Infrastructure Evidence (Photos / Floor Plans)' },
];

const INTAKE_FIELD_IDS: Record<keyof ApplicationIntakeFormValues, true> = {
  category: true,
  academic_year: true,
  land_area_acres: true,
  built_up_area_sqm: true,
  total_intake: true,
  faculty_count: true,
};

export function ApplicationIntakePage() {
  const queryClient = useQueryClient();

  const [createdApp, setCreatedApp] = useState<ApplicationRecord | null>(null);

  // Document Upload State
  const [targetAppId, setTargetAppId] = useState<string>('');
  const [selectedDocType, setSelectedDocType] = useState<string>('LAND_OWNERSHIP_DOCUMENT');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clientFileError, setClientFileError] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<DocumentRecord[]>([]);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ApplicationIntakeFormValues>({
    resolver: zodResolver(ApplicationIntakeFormSchema),
    defaultValues: {
      category: 'EXTENSION_OF_APPROVAL',
      academic_year: '2026-27',
      land_area_acres: undefined,
      built_up_area_sqm: undefined,
      total_intake: undefined,
      faculty_count: undefined,
    },
  });

  const createAppMutation = useMutation({
    // The institution is taken from the signed-in applicant by the backend, never from the body.
    mutationFn: (values: ApplicationIntakeFormValues) =>
      createApplication({
        category: values.category,
        academic_year: values.academic_year,
        declared_data: {
          land_area_acres: values.land_area_acres,
          built_up_area_sqm: values.built_up_area_sqm,
          total_intake: values.total_intake,
          faculty_count: values.faculty_count,
        },
      }),
    retry: false, // Never auto-retry non-idempotent application creation
    onSuccess: (data) => {
      setCreatedApp(data);
      if (data.id !== undefined && data.id !== null) {
        setTargetAppId(String(data.id));
      }
      invalidateAllAppQueries(queryClient, { applicationId: data.id, reason: 'APPLICATION_CREATED' });
      reset();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        for (const [field, message] of Object.entries(err.fieldErrors)) {
          if (Object.hasOwn(INTAKE_FIELD_IDS, field)) {
            setError(field as keyof ApplicationIntakeFormValues, { type: 'server', message });
          }
        }
      }
    },
  });

  const uploadDocMutation = useMutation({
    mutationFn: uploadApplicationDocument,
    retry: false, // Never auto-retry multipart uploads
    onSuccess: (doc) => {
      setUploadedDocs((prev) => [doc, ...prev]);
      setSelectedFile(null);
      setClientFileError(null);
      invalidateAllAppQueries(queryClient, { applicationId: targetAppId, reason: 'DOCUMENT_UPLOADED' });
    },
  });

  const onSubmitIntake = (values: ApplicationIntakeFormValues) => {
    setCreatedApp(null);
    createAppMutation.mutate(values);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setClientFileError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const fileProblem = validateUploadFile(file);
    if (fileProblem) {
      setClientFileError(fileProblem);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetAppId.trim()) {
      setClientFileError('Application ID is required to attach a statutory document.');
      return;
    }
    if (!selectedFile) {
      setClientFileError('Please select a valid PDF, PNG, or JPEG document to upload.');
      return;
    }
    const fileProblem = validateUploadFile(selectedFile);
    if (fileProblem) {
      setClientFileError(fileProblem);
      return;
    }
    setClientFileError(null);
    uploadDocMutation.mutate({
      applicationId: targetAppId.trim(),
      documentType: selectedDocType,
      file: selectedFile,
    });
  };

  return (
    <div className="space-y-6 animate-dossier-settle">
      <div className="flex items-center gap-3.5 border-b border-[#CBD5E1] pb-4">
        <DossierStack3D variant="saffron" />
        <div>
          <h1 className="text-2xl font-bold text-[#0F1E36] tracking-tight">
            Application Intake & Statutory Document Submission
          </h1>
          <p className="text-xs text-[#334155] mt-1">
            Submit institutional parameters via <code className="font-mono">POST /api/applications</code> and upload supporting evidentiary dossiers via <code className="font-mono">POST /api/documents/upload</code>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Step 1 — Application Intake Form */}
        <Tactile3DCard
          as="section"
          maxTiltDeg={1.5}
          className="lg:col-span-7 bg-white border border-[#CBD5E1] p-6 space-y-5"
        >
          <div className="flex items-center gap-2 border-b border-[#CBD5E1] pb-3">
            <FolderPlus className="w-4 h-4 text-[#1B365D]" aria-hidden="true" />
            <div>
              <h2 id="intake-form-heading" className="text-base font-bold text-[#0F1E36]">
                01. Statutory Application Parameters
              </h2>
              <p className="text-xs text-[#334155]">
                Target Endpoint: <code className="font-mono">POST /api/applications</code>
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmitIntake)} noValidate className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="intake-category"
                  className="block text-xs font-semibold text-[#0F1E36] mb-1"
                >
                  Application Category *
                </label>
                <select
                  id="intake-category"
                  {...register('category')}
                  className="w-full px-3 py-2 text-xs bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
                >
                  {SUPPORTED_APPLICATION_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {errors.category && (
                  <p role="alert" className="mt-1 text-xs text-[#B91C1C] font-medium">
                    {errors.category.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="intake-academic-year"
                  className="block text-xs font-semibold text-[#0F1E36] mb-1"
                >
                  Academic Year (YYYY-YY) *
                </label>
                <input
                  id="intake-academic-year"
                  type="text"
                  placeholder="2026-27"
                  {...register('academic_year')}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
                />
                {errors.academic_year && (
                  <p role="alert" className="mt-1 text-xs text-[#B91C1C] font-medium">
                    {errors.academic_year.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="intake-land-area"
                  className="block text-xs font-semibold text-[#0F1E36] mb-1"
                >
                  Declared Land Area (Acres) *
                </label>
                <input
                  id="intake-land-area"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="e.g., 10.5"
                  {...register('land_area_acres', { valueAsNumber: true })}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
                />
                {errors.land_area_acres && (
                  <p role="alert" className="mt-1 text-xs text-[#B91C1C] font-medium">
                    {errors.land_area_acres.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="intake-built-up-area"
                  className="block text-xs font-semibold text-[#0F1E36] mb-1"
                >
                  Built-Up Area (Square Metres) *
                </label>
                <input
                  id="intake-built-up-area"
                  type="number"
                  step="0.1"
                  min="1"
                  placeholder="e.g., 14500"
                  {...register('built_up_area_sqm', { valueAsNumber: true })}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
                />
                {errors.built_up_area_sqm && (
                  <p role="alert" className="mt-1 text-xs text-[#B91C1C] font-medium">
                    {errors.built_up_area_sqm.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="intake-total-intake"
                  className="block text-xs font-semibold text-[#0F1E36] mb-1"
                >
                  Total Student Intake (Seats) *
                </label>
                <input
                  id="intake-total-intake"
                  type="number"
                  step="1"
                  min="1"
                  placeholder="e.g., 360"
                  {...register('total_intake', { valueAsNumber: true })}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
                />
                {errors.total_intake && (
                  <p role="alert" className="mt-1 text-xs text-[#B91C1C] font-medium">
                    {errors.total_intake.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="intake-faculty-count"
                  className="block text-xs font-semibold text-[#0F1E36] mb-1"
                >
                  Declared Faculty Count *
                </label>
                <input
                  id="intake-faculty-count"
                  type="number"
                  step="1"
                  min="0"
                  placeholder="e.g., 24"
                  {...register('faculty_count', { valueAsNumber: true })}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
                />
                {errors.faculty_count && (
                  <p role="alert" className="mt-1 text-xs text-[#B91C1C] font-medium">
                    {errors.faculty_count.message}
                  </p>
                )}
              </div>
            </div>

            {createAppMutation.isError && (
              <ApiErrorState
                title="Application Creation Request Failed"
                error={createAppMutation.error}
                endpoint="POST /api/applications"
              />
            )}

            {createdApp && (
              <div
                role="status"
                aria-live="polite"
                className="border border-[#86EFAC] bg-[#F0FDF4] p-4 text-[#14532D] space-y-2"
              >
                <div className="flex items-center gap-2 font-semibold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-[#15803D]" aria-hidden="true" />
                  <span>
                    Application Dossier Confirmed by Server — ID:{' '}
                    <code className="font-mono">#{String(createdApp.id)}</code>
                  </span>
                </div>
                <div className="text-xs space-y-1">
                  <p>
                    Status: <strong>{formatApiValue(createdApp.status)}</strong> · Created At:{' '}
                    <span className="font-mono">{formatApiTimestamp(createdApp.created_at)}</span>
                  </p>
                  <p>
                    <Link
                      to={`/applicant/applications/${encodeURIComponent(String(createdApp.id))}`}
                      className="underline font-semibold text-[#1B365D]"
                    >
                      Open Dossier #{String(createdApp.id)} →
                    </Link>
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#CBD5E1]">
              <button
                type="submit"
                disabled={createAppMutation.isPending}
                className="btn-tactile-3d px-5 py-2.5 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {createAppMutation.isPending
                  ? 'Submitting to POST /api/applications...'
                  : 'Create Application Dossier'}
              </button>
            </div>
          </form>
        </Tactile3DCard>

        {/* Right Column: Step 2 — Multipart Document Upload */}
        <Tactile3DCard
          as="section"
          maxTiltDeg={1.5}
          className="lg:col-span-5 bg-white border border-[#CBD5E1] p-6 space-y-5"
        >
          <div className="flex items-center gap-2 border-b border-[#CBD5E1] pb-3">
            <FileUp className="w-4 h-4 text-[#1B365D]" aria-hidden="true" />
            <div>
              <h2 id="document-upload-heading" className="text-base font-bold text-[#0F1E36]">
                02. Multipart Document Upload
              </h2>
              <p className="text-xs text-[#334155]">
                Target Endpoint: <code className="font-mono">POST /api/documents/upload</code>
              </p>
            </div>
          </div>

          <form onSubmit={handleUploadSubmit} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="upload-app-id"
                className="block text-xs font-semibold text-[#0F1E36] mb-1"
              >
                Target Application ID *
              </label>
              <input
                id="upload-app-id"
                type="text"
                value={targetAppId}
                onChange={(e) => setTargetAppId(e.target.value)}
                placeholder="Enter created Application ID (e.g., 1)"
                className="w-full px-3 py-2 text-xs font-mono bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
              />
            </div>

            <div>
              <label
                htmlFor="upload-doc-category"
                className="block text-xs font-semibold text-[#0F1E36] mb-1"
              >
                Statutory Document Category *
              </label>
              <select
                id="upload-doc-category"
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
              >
                {SUPPORTED_DOCUMENT_CATEGORIES.map((docCat) => (
                  <option key={docCat.value} value={docCat.value}>
                    {docCat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="upload-file-input"
                className="block text-xs font-semibold text-[#0F1E36] mb-1"
              >
                Evidentiary Document File (PDF, PNG, JPEG · Max 25 MB) *
              </label>
              <div className="border border-dashed border-[#CBD5E1] bg-[#F4F6F9] p-4 text-center">
                <Upload className="w-5 h-5 text-[#475569] mx-auto mb-1.5" aria-hidden="true" />
                <input
                  id="upload-file-input"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-[#334155] file:mr-3 file:py-1.5 file:px-3 file:border file:border-[#CBD5E1] file:text-xs file:font-semibold file:bg-white file:text-[#1B365D] hover:file:bg-[#F8FAFC] cursor-pointer"
                />
                {selectedFile && (
                  <p className="mt-2 text-xs font-mono text-[#0F1E36]">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
              {clientFileError && (
                <p role="alert" className="mt-1.5 text-xs text-[#B91C1C] font-medium">
                  {clientFileError}
                </p>
              )}
            </div>

            {uploadDocMutation.isError && (
              <ApiErrorState
                title="Multipart Document Upload Failed"
                error={uploadDocMutation.error}
                endpoint="POST /api/documents/upload"
              />
            )}

            <div className="pt-2 flex justify-end border-t border-[#CBD5E1]">
              <button
                type="submit"
                disabled={uploadDocMutation.isPending}
                className="btn-tactile-3d px-4 py-2 text-xs font-semibold text-white bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {uploadDocMutation.isPending
                  ? 'Uploading Multipart FormData...'
                  : 'Upload Document to Server'}
              </button>
            </div>
          </form>

          {/* Uploaded Documents in Session */}
          {uploadedDocs.length > 0 && (
            <div className="pt-4 border-t border-[#CBD5E1] space-y-2">
              <h3 className="text-xs font-bold text-[#0F1E36]">
                Server-Confirmed Uploads in Current Session ({uploadedDocs.length})
              </h3>
              <p className="text-xs text-[#475569]">
                Note: Upload confirmation indicates receipt by the backend. OCR/forensic authentication status is reported strictly as returned by the server.
              </p>
              <div className="space-y-2">
                {uploadedDocs.map((doc, idx) => (
                  <div
                    key={String(doc.id ?? idx)}
                    className="p-3 bg-[#F4F6F9] border border-[#CBD5E1] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-[#0F1E36]">
                        Doc #{String(doc.id)} · {formatApiValue(doc.document_type ?? doc.category)}
                      </span>
                      <StatusIndicator value={doc.status ?? doc.verification_status ?? 'UPLOADED'} />
                    </div>
                    <div className="text-[#475569] font-mono">
                      File: {formatApiValue(doc.filename ?? doc.file_name)} · Hash:{' '}
                      {formatApiValue(doc.sha256_hash ?? doc.file_hash)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Tactile3DCard>
      </div>
    </div>
  );
}
