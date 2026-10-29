export const NOT_PROVIDED = 'Not provided by API';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;

export function formatApiValue(v: unknown, unit?: string): string {
  if (v === null || v === undefined || v === '') return NOT_PROVIDED;
  const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return unit ? `${text} ${unit}` : text;
}

export function formatApiTimestamp(v: string | null | undefined): string {
  if (v === null || v === undefined || v === '') return NOT_PROVIDED;
  // Naive backend datetimes are UTC but serialize without a zone; Date would read them as local time.
  const hasTime = /[T ]\d{2}:\d{2}/.test(v);
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(v);
  const d = new Date(hasTime && !hasZone ? `${v.replace(' ', 'T')}Z` : v);
  if (Number.isNaN(d.getTime())) return v;
  return `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

/** Accepts a 0..1 confidence fraction and renders it as a percentage. */
export function formatConfidencePercentage(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NOT_PROVIDED;
  return `${(v * 100).toFixed(1)}%`;
}

/** Mirrors backend upload rules (PDF/PNG/JPEG, <= 25 MB). Returns an error message or null. */
export function validateUploadFile(f: File): string | null {
  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(f.type)) {
    return 'Unsupported file type. Only PDF, PNG or JPEG files are accepted.';
  }
  if (f.size > MAX_UPLOAD_BYTES) {
    return 'File is too large. The maximum upload size is 25 MB.';
  }
  return null;
}
