import type { AuthorityVerificationRecord } from '../../types/api';

/** `''`, `{}` and nullish carry no information; the backend defaults `details` to `{}`. */
function isBlank(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  return typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0;
}

/** The most informative "Provenance / Details" value of a verification row, or undefined. */
export function verificationDetail(
  row: AuthorityVerificationRecord,
): string | Record<string, unknown> | undefined {
  const candidates: Array<string | Record<string, unknown> | null | undefined> = [
    row.details,
    row.provenance,
    row.reference_id ? `Reference ${row.reference_id}` : undefined,
    row.checked_at,
    row.verified_at,
  ];
  for (const candidate of candidates) {
    if (!isBlank(candidate)) return candidate as string | Record<string, unknown>;
  }
  return undefined;
}
