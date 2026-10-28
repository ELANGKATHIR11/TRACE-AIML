import React from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  FolderOpen,
  HelpCircle,
  RefreshCw,
  ServerCrash,
  XCircle,
} from 'lucide-react';
import { ApiClientError } from '../lib/api/transport';

export function ApiLoadingState({
  label = 'Retrieving live records from FastAPI backend...',
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="border border-[#CBD5E1] bg-white p-5 space-y-3"
    >
      <div className="flex items-center gap-2.5 text-xs font-medium text-[#334155]">
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1B365D]" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="space-y-2 pt-1">
        {Array.from({ length: rows }).map((_, idx) => (
          <div
            key={idx}
            className="h-7 bg-[#F4F6F9] border border-[#E2E8F0]"
          />
        ))}
      </div>
    </div>
  );
}

export function ApiErrorState({
  title = 'Backend API Request Failed',
  error,
  endpoint,
  onRetry,
  isRetrying = false,
}: {
  title?: string;
  error: unknown;
  endpoint?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}) {
  const apiErr = error instanceof ApiClientError ? error : null;
  const status = apiErr?.status;
  const code = apiErr?.code ?? 'HTTP_ERROR';
  const targetEndpoint = apiErr?.endpoint || endpoint || 'Unknown endpoint';
  const message =
    error instanceof Error ? error.message : 'An unexpected transport error occurred.';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="border border-[#FECACA] bg-[#FEF2F2] p-5 text-[#7F1D1D]"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ServerCrash className="w-5 h-5 text-[#B91C1C] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#991B1B]">
              <span>[{code}]</span>
              <span aria-hidden="true">·</span>
              <span>{status ? `HTTP ${status}` : 'No HTTP Response'}</span>
              <span aria-hidden="true">·</span>
              <span>{targetEndpoint}</span>
              {apiErr?.correlationId && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Req ID: {apiErr.correlationId}</span>
                </>
              )}
            </div>
            <h3 className="text-sm font-semibold text-[#7F1D1D]">{title}</h3>
            <p className="text-xs leading-relaxed text-[#7F1D1D] max-w-3xl">{message}</p>
            <p className="text-xs text-[#991B1B] pt-0.5">
              Zero-Mock Policy Active: No fabricated or fallback records are substituted while the
              endpoint is unreachable or returning an error.
            </p>
          </div>
        </div>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="btn-tactile-3d inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#991B1B] hover:bg-[#7F1D1D] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{isRetrying ? 'Retrying...' : 'Retry API Request'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function ApiEmptyState({
  title,
  description,
  endpoint,
  action,
}: {
  title: string;
  description: string;
  endpoint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-[#CBD5E1] bg-white p-8 text-center">
      <FolderOpen className="w-6 h-6 text-[#475569] mx-auto mb-2" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-[#0F1E36]">{title}</h3>
      <p className="text-xs text-[#334155] max-w-lg mx-auto mt-1 leading-relaxed">
        {description}
      </p>
      {endpoint && (
        <p className="text-xs font-mono text-[#475569] mt-2">
          Source verified empty collection: {endpoint}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ApiUnavailableState({
  capability,
  endpoint,
  reason,
}: {
  capability: string;
  endpoint: string;
  reason?: string;
}) {
  return (
    <div className="border border-[#CBD5E1] bg-[#F8FAFC] p-5">
      <div className="flex items-start gap-3">
        <Ban className="w-4 h-4 text-[#475569] shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-[#475569]">
            <span>CAPABILITY UNAVAILABLE</span>
            <span aria-hidden="true">·</span>
            <span>{endpoint}</span>
          </div>
          <h3 className="text-sm font-semibold text-[#0F1E36]">{capability}</h3>
          <p className="text-xs text-[#334155] leading-relaxed max-w-2xl">
            {reason ||
              'This capability is not exposed by the active backend response contract. In compliance with the Zero-Mock policy, no simulated output is rendered.'}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Accessible status indicator that never uses color alone (pairs icon + explicit text label)
 * and follows Zero-Pill discipline (clean unboxed text with icon).
 */
export function StatusIndicator({ value }: { value: string | null | undefined }) {
  if (!value) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#475569]">
        <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Not provided by API</span>
      </span>
    );
  }

  const upper = value.toUpperCase();

  if (
    upper.includes('VERIFIED') ||
    upper.includes('APPROVE') ||
    upper.includes('VALID') ||
    upper.includes('COMPLIANT') ||
    upper.includes('ACTIVE') ||
    upper.includes('COMPLETED')
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{value}</span>
      </span>
    );
  }

  if (
    upper.includes('MISMATCH') ||
    upper.includes('REJECT') ||
    upper.includes('CRITICAL') ||
    upper.includes('HIGH') ||
    upper.includes('INVALID') ||
    upper.includes('TAMPER') ||
    upper.includes('EXPIRED') ||
    upper.includes('ERROR')
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B91C1C]">
        <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{value}</span>
      </span>
    );
  }

  if (
    upper.includes('DEFICIENC') ||
    upper.includes('CORRECTION') ||
    upper.includes('ESCALAT') ||
    upper.includes('WARN') ||
    upper.includes('MEDIUM') ||
    upper.includes('MANUAL_REVIEW')
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9A3412]">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{value}</span>
      </span>
    );
  }

  if (upper.includes('UNAVAILABLE')) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569]">
        <Ban className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{value}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B365D]">
      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{value}</span>
    </span>
  );
}
