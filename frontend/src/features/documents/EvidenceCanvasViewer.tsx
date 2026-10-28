import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Layers,
  Maximize2,
  RefreshCw,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  BoundingBoxCoordinate,
  ComplianceFlag,
  DocumentRecord,
} from '../../types/api';
import {
  fetchDocumentElaAnalysis,
  fetchDocumentPreview,
} from '../../lib/api/endpoints';
import { formatApiValue } from '../../lib/utils/formatters';
import {
  ApiEmptyState,
  ApiErrorState,
  ApiLoadingState,
  ApiUnavailableState,
  StatusIndicator,
} from '../../components/ApiStateFeedback';

export function EvidenceCanvasViewer({
  documents,
  selectedDocumentId,
  onSelectDocument,
  activeHighlightTerms = [],
  activePage = 1,
  onPageChange,
  activeFinding = null,
}: {
  documents: DocumentRecord[];
  selectedDocumentId: string | number | null;
  onSelectDocument: (docId: string | number) => void;
  activeHighlightTerms?: string[];
  activePage?: number;
  onPageChange?: (page: number) => void;
  activeFinding?: ComplianceFlag | null;
}) {
  const [page, setPage] = useState<number>(activePage);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'PREVIEW' | 'ELA'>('PREVIEW');
  const [blobObjectUrl, setBlobObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    setPage(activePage);
  }, [activePage]);

  // Debounce rapid keyword search queries (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const effectiveDocId =
    selectedDocumentId ?? (documents.length > 0 ? documents[0].id : null);

  const selectedDoc = documents.find(
    (d) => String(d.id) === String(effectiveDocId)
  );

  const combinedMarks = React.useMemo(() => {
    const terms = new Set<string>();
    for (const t of activeHighlightTerms) {
      if (t.trim()) terms.add(t.trim());
    }
    if (debouncedSearchTerm) {
      for (const part of debouncedSearchTerm.split(',')) {
        if (part.trim()) terms.add(part.trim());
      }
    }
    return Array.from(terms);
  }, [activeHighlightTerms, debouncedSearchTerm]);

  const previewQuery = useQuery({
    queryKey: ['document-preview', effectiveDocId, page, combinedMarks],
    queryFn: ({ signal }) =>
      fetchDocumentPreview(effectiveDocId!, {
        page,
        marks: combinedMarks,
        signal,
      }),
    enabled: effectiveDocId !== null && viewMode === 'PREVIEW',
    retry: false,
  });

  const elaQuery = useQuery({
    queryKey: ['document-ela', effectiveDocId],
    queryFn: ({ signal }) => fetchDocumentElaAnalysis(effectiveDocId!, signal),
    enabled: effectiveDocId !== null && viewMode === 'ELA',
    retry: false,
  });

  // Manage Blob ObjectURL lifecycle and revoke on unmount/change
  useEffect(() => {
    if (previewQuery.data?.mode === 'binary' && previewQuery.data.blob) {
      const url = URL.createObjectURL(previewQuery.data.blob);
      setBlobObjectUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
    setBlobObjectUrl(null);
    return undefined;
  }, [previewQuery.data]);

  const handlePageStep = (nextPage: number) => {
    const clamped = Math.max(1, nextPage);
    setPage(clamped);
    onPageChange?.(clamped);
  };

  // Resolve real bounding boxes only if supplied by backend response or active finding
  const serverBoundingBoxes: BoundingBoxCoordinate[] = React.useMemo(() => {
    const boxes: BoundingBoxCoordinate[] = [];
    if (previewQuery.data?.mode === 'json' && previewQuery.data.jsonPayload) {
      if (Array.isArray(previewQuery.data.jsonPayload.bounding_boxes)) {
        boxes.push(...previewQuery.data.jsonPayload.bounding_boxes);
      }
      if (Array.isArray(previewQuery.data.jsonPayload.matches)) {
        boxes.push(...previewQuery.data.jsonPayload.matches);
      }
    }
    if (
      activeFinding?.bounding_box &&
      String(activeFinding.source_document_id ?? activeFinding.document_id) ===
        String(effectiveDocId)
    ) {
      boxes.push(activeFinding.bounding_box);
    }
    return boxes;
  }, [previewQuery.data, activeFinding, effectiveDocId]);

  return (
    <section
      aria-label="Evidence Canvas and Forensic Document Viewer"
      className="bg-white border border-[#CBD5E1] flex flex-col"
    >
      {/* Document Selector Tabs */}
      <div className="border-b border-[#CBD5E1] bg-[#F4F6F9] px-4 pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#0F1E36]">
            <FileText className="w-4 h-4 text-[#1B365D]" aria-hidden="true" />
            <span>Evidentiary Document Canvas</span>
          </div>
          {selectedDoc && (
            <StatusIndicator
              value={selectedDoc.verification_status ?? selectedDoc.status}
            />
          )}
        </div>

        {documents.length === 0 ? (
          <div className="pb-3 text-xs text-[#475569]">
            No documents returned in application dossier.
          </div>
        ) : (
          <div
            role="tablist"
            aria-label="Dossier Documents"
            className="flex items-center gap-1 overflow-x-auto"
          >
            {documents.map((doc) => {
              const isSelected = String(doc.id) === String(effectiveDocId);
              const label =
                doc.document_type ||
                doc.category ||
                doc.filename ||
                `Document #${String(doc.id)}`;
              return (
                <button
                  key={String(doc.id)}
                  role="tab"
                  type="button"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelectDocument(doc.id);
                    handlePageStep(1);
                  }}
                  className={`px-3 py-2 text-xs font-semibold border-t border-x transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-white text-[#1B365D] border-[#CBD5E1] -mb-px'
                      : 'bg-[#E2E8F0]/60 text-[#334155] border-transparent hover:bg-[#E2E8F0]'
                  }`}
                >
                  {label} (#{String(doc.id)})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Viewer Controls Toolbar */}
      <div className="p-3 border-b border-[#CBD5E1] bg-white flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Page Navigation */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={page <= 1 || effectiveDocId === null}
            onClick={() => handlePageStep(page - 1)}
            aria-label="Previous document page"
            className="p-1.5 border border-[#CBD5E1] bg-[#F4F6F9] hover:bg-[#E2E8F0] disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <span className="font-mono px-2">
            Page <strong>{page}</strong>
            {selectedDoc?.page_count ? ` / ${selectedDoc.page_count}` : ''}
          </span>
          <button
            type="button"
            disabled={
              effectiveDocId === null ||
              (selectedDoc?.page_count ? page >= selectedDoc.page_count : false)
            }
            onClick={() => handlePageStep(page + 1)}
            aria-label="Next document page"
            className="p-1.5 border border-[#CBD5E1] bg-[#F4F6F9] hover:bg-[#E2E8F0] disabled:opacity-40 cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Zoom & Fit Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoomPercent((z) => Math.max(50, z - 25))}
            aria-label="Zoom out document preview"
            className="p-1.5 border border-[#CBD5E1] bg-[#F4F6F9] hover:bg-[#E2E8F0] cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <span className="font-mono tabular-nums w-12 text-center">
            {zoomPercent}%
          </span>
          <button
            type="button"
            onClick={() => setZoomPercent((z) => Math.min(200, z + 25))}
            aria-label="Zoom in document preview"
            className="p-1.5 border border-[#CBD5E1] bg-[#F4F6F9] hover:bg-[#E2E8F0] cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setZoomPercent(100)}
            className="inline-flex items-center gap-1 px-2 py-1 border border-[#CBD5E1] bg-[#F4F6F9] hover:bg-[#E2E8F0] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Maximize2 className="w-3 h-3" aria-hidden="true" />
            <span>Fit Width</span>
          </button>
        </div>

        {/* Mode Switch: Standard Preview vs Server Forensic ELA */}
        <div className="flex items-center border border-[#CBD5E1] bg-[#F4F6F9] p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('PREVIEW')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'PREVIEW'
                ? 'bg-[#1B365D] text-white'
                : 'text-[#334155] hover:text-[#0F1E36]'
            }`}
          >
            <Eye className="w-3 h-3" aria-hidden="true" />
            <span>Evidence Preview</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('ELA')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'ELA'
                ? 'bg-[#C2410C] text-white'
                : 'text-[#334155] hover:text-[#0F1E36]'
            }`}
          >
            <Layers className="w-3 h-3" aria-hidden="true" />
            <span>Server ELA Mode</span>
          </button>
        </div>
      </div>

      {/* Live Search Highlighter Input */}
      <div className="px-4 py-2.5 border-b border-[#CBD5E1] bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="relative flex-1">
          <label htmlFor="evidence-mark-search" className="sr-only">
            Highlight terms via backend preview mark query parameter
          </label>
          <Search
            className="w-3.5 h-3.5 text-[#475569] absolute left-2.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            id="evidence-mark-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Enter comma-separated terms for server ?mark= highlighting..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#CBD5E1] text-[#0F1E36]"
          />
        </div>
        {combinedMarks.length > 0 && (
          <div className="text-xs font-mono text-[#1B365D]">
            Active <code className="font-mono">?mark=</code> terms: {combinedMarks.join(', ')}
          </div>
        )}
      </div>

      {/* Main Viewport Canvas */}
      <div className="p-4 bg-[#F4F6F9] min-h-[420px] flex-1 overflow-auto">
        {effectiveDocId === null ? (
          <ApiEmptyState
            title="No Document Selected for Preview"
            description="Upload or select a document tab above to request its preview from GET /api/documents/{id}/preview."
          />
        ) : viewMode === 'ELA' ? (
          elaQuery.isLoading ? (
            <ApiLoadingState
              label={`Requesting server-side Error Level Analysis from GET /api/documents/${String(
                effectiveDocId
              )}/ela...`}
              rows={4}
            />
          ) : elaQuery.isError ? (
            <ApiUnavailableState
              capability="Server-Side Error Level Analysis (ELA)"
              endpoint={`GET /api/documents/${String(effectiveDocId)}/ela`}
              reason={`The backend did not return a valid ELA payload (${
                elaQuery.error instanceof Error ? elaQuery.error.message : 'Endpoint unavailable'
              }). Per Section 14, no misleading browser-side compression filter is simulated as forensic evidence.`}
            />
          ) : elaQuery.data ? (
            <div className="space-y-4 bg-white border border-[#CBD5E1] p-4">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 bg-[#F4F6F9] border border-[#CBD5E1]">
                  <div className="text-[#475569]">Mean Error Level</div>
                  <div className="font-mono font-bold text-[#0F1E36] mt-0.5">
                    {formatApiValue(elaQuery.data.mean_error_level)}
                  </div>
                </div>
                <div className="p-2.5 bg-[#F4F6F9] border border-[#CBD5E1]">
                  <div className="text-[#475569]">Max Difference</div>
                  <div className="font-mono font-bold text-[#0F1E36] mt-0.5">
                    {formatApiValue(elaQuery.data.max_difference)}
                  </div>
                </div>
                <div className="p-2.5 bg-[#F4F6F9] border border-[#CBD5E1]">
                  <div className="text-[#475569]">Anomaly Score</div>
                  <div className="font-mono font-bold text-[#9A3412] mt-0.5">
                    {formatApiValue(elaQuery.data.anomaly_score)}
                  </div>
                </div>
              </div>
              {(elaQuery.data.ela_image_url || elaQuery.data.ela_image_base64) && (
                <div className="overflow-auto border border-[#CBD5E1] bg-[#0F1E36] p-2">
                  <img
                    src={
                      elaQuery.data.ela_image_url ||
                      `data:image/png;base64,${elaQuery.data.ela_image_base64}`
                    }
                    alt={`Server-generated ELA map for Document #${String(effectiveDocId)}`}
                    referrerPolicy="no-referrer"
                    className="mx-auto max-w-full"
                  />
                </div>
              )}
            </div>
          ) : null
        ) : previewQuery.isLoading ? (
          <ApiLoadingState
            label={`Requesting document preview from GET /api/documents/${String(
              effectiveDocId
            )}/preview?page=${page}...`}
            rows={5}
          />
        ) : previewQuery.isError ? (
          <ApiErrorState
            title={`Document Preview Failed (Document #${String(effectiveDocId)})`}
            error={previewQuery.error}
            endpoint={`/api/documents/${String(effectiveDocId)}/preview?page=${page}`}
            onRetry={() => void previewQuery.refetch()}
            isRetrying={previewQuery.isFetching}
          />
        ) : previewQuery.data ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-[#475569] bg-white px-3 py-1.5 border border-[#CBD5E1]">
              <span className="truncate">GET {previewQuery.data.requestUrl}</span>
              <button
                type="button"
                onClick={() => void previewQuery.refetch()}
                className="inline-flex items-center gap-1 text-[#1B365D] hover:underline ml-2 shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" aria-hidden="true" />
                <span>Reload</span>
              </button>
            </div>

            {/* Binary PDF or Image Stream */}
            {previewQuery.data.mode === 'binary' && blobObjectUrl ? (
              previewQuery.data.contentType?.includes('application/pdf') ? (
                <iframe
                  title={`Document #${String(effectiveDocId)} PDF Preview`}
                  src={blobObjectUrl}
                  className="w-full h-[540px] border border-[#CBD5E1] bg-white"
                />
              ) : (
                <div className="relative inline-block mx-auto border border-[#CBD5E1] bg-white">
                  <img
                    src={blobObjectUrl}
                    alt={`Preview of Document #${String(effectiveDocId)} Page ${page}`}
                    referrerPolicy="no-referrer"
                    style={{ width: `${zoomPercent}%` }}
                    className="block max-w-none"
                  />
                  {/* Genuine Server Bounding-Box Overlay (Only if coordinates supplied by backend) */}
                  {serverBoundingBoxes.length > 0 && (
                    <svg
                      aria-label="Server-provided forensic bounding box annotations"
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    >
                      {serverBoundingBoxes.map((box, idx) => (
                        <rect
                          key={idx}
                          x={box.normalized ? `${box.x * 100}%` : box.x}
                          y={box.normalized ? `${box.y * 100}%` : box.y}
                          width={box.normalized ? `${box.width * 100}%` : box.width}
                          height={box.normalized ? `${box.height * 100}%` : box.height}
                          fill="rgba(220, 38, 38, 0.14)"
                          stroke="#DC2626"
                          strokeWidth="2"
                        />
                      ))}
                    </svg>
                  )}
                </div>
              )
            ) : previewQuery.data.mode === 'json' && previewQuery.data.jsonPayload ? (
              <div className="bg-white border border-[#CBD5E1] p-4 space-y-3 text-xs">
                <div className="font-mono text-[#475569]">
                  Media Type: {formatApiValue(previewQuery.data.jsonPayload.media_type)} · Total
                  Pages: {formatApiValue(previewQuery.data.jsonPayload.total_pages)}
                </div>
                {(previewQuery.data.jsonPayload.image_url ||
                  previewQuery.data.jsonPayload.image_base64) && (
                  <div className="relative inline-block border border-[#CBD5E1]">
                    <img
                      src={
                        previewQuery.data.jsonPayload.image_url ||
                        `data:image/png;base64,${previewQuery.data.jsonPayload.image_base64}`
                      }
                      alt={`Document #${String(effectiveDocId)} Page ${page}`}
                      referrerPolicy="no-referrer"
                      className="max-w-full"
                    />
                  </div>
                )}
                {previewQuery.data.jsonPayload.extracted_text && (
                  <pre className="p-3 bg-[#F4F6F9] border border-[#CBD5E1] font-mono text-xs whitespace-pre-wrap text-[#0F1E36]">
                    {previewQuery.data.jsonPayload.extracted_text}
                  </pre>
                )}
              </div>
            ) : null}

            <div className="text-xs text-[#475569] px-1">
              {serverBoundingBoxes.length > 0 ? (
                <span className="font-semibold text-[#B91C1C]">
                  Rendering {serverBoundingBoxes.length} server-supplied bounding-box coordinate
                  region(s).
                </span>
              ) : (
                <span>
                  Bounding-box coordinate overlay: None returned in current response (Zero-Mock:
                  no client-approximated rectangles drawn).
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
