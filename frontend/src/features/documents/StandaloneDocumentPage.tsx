import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { fetchDocumentMetadata } from '../../lib/api/endpoints';
import { formatApiTimestamp, formatApiValue } from '../../lib/utils/formatters';
import { ApiUnavailableState, StatusIndicator } from '../../components/ApiStateFeedback';
import { EvidenceCanvasViewer } from './EvidenceCanvasViewer';
import { DocumentRecord } from '../../types/api';

export function StandaloneDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const docId = id ?? '';
  const { user } = useAuth();
  const isApplicant = user?.role === 'applicant';

  const metadataQuery = useQuery({
    queryKey: ['document-metadata', docId],
    queryFn: ({ signal }) => fetchDocumentMetadata(docId, signal),
    enabled: Boolean(docId),
    retry: false,
  });

  const fallbackRecord: DocumentRecord = metadataQuery.data ?? {
    id: docId,
    document_type: `Document #${docId}`,
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#CBD5E1] pb-4 space-y-1">
        <Link
          to={isApplicant ? '/applicant/applications' : '/applications'}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#1B365D] hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isApplicant ? 'Back to My Applications' : 'Back to Application Registry'}</span>
        </Link>
        <h1 className="text-2xl font-bold text-[#0F1E36] tracking-tight">
          Evidentiary Document Inspection — Document #{docId}
        </h1>
      </div>

      {metadataQuery.isError ? (
        <ApiUnavailableState
          capability={`Standalone Document Metadata (GET /api/documents/${docId})`}
          endpoint={`GET /api/documents/${docId}`}
          reason="The standalone document metadata endpoint is unavailable or returned an error. Attempting direct stream preview via GET /api/documents/{id}/preview below."
        />
      ) : metadataQuery.data ? (
        <div className="bg-white border border-[#CBD5E1] p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-[#475569]">Document Category</div>
            <div className="font-semibold text-[#0F1E36] mt-0.5">
              {formatApiValue(metadataQuery.data.document_type ?? metadataQuery.data.category)}
            </div>
          </div>
          <div>
            <div className="text-[#475569]">Filename</div>
            <div className="font-mono text-[#0F1E36] mt-0.5">
              {formatApiValue(metadataQuery.data.filename ?? metadataQuery.data.file_name)}
            </div>
          </div>
          <div>
            <div className="text-[#475569]">Verification Status</div>
            <div className="mt-0.5">
              <StatusIndicator
                value={metadataQuery.data.verification_status ?? metadataQuery.data.status}
              />
            </div>
          </div>
          <div>
            <div className="text-[#475569]">Uploaded Timestamp</div>
            <div className="font-mono text-[#0F1E36] mt-0.5">
              {formatApiTimestamp(metadataQuery.data.uploaded_at ?? metadataQuery.data.created_at)}
            </div>
          </div>
        </div>
      ) : null}

      <EvidenceCanvasViewer
        documents={[fallbackRecord]}
        selectedDocumentId={docId}
        onSelectDocument={() => undefined}
      />
    </div>
  );
}
