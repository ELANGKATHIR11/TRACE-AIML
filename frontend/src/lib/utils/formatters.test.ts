import { describe, expect, it } from 'vitest';
import {
  formatApiTimestamp,
  formatApiValue,
  formatConfidencePercentage,
  validateUploadFile,
} from './formatters';

const NA = 'Not provided by API';

describe('formatApiValue', () => {
  it('returns placeholder for null/undefined/empty', () => {
    expect(formatApiValue(null)).toBe(NA);
    expect(formatApiValue(undefined)).toBe(NA);
    expect(formatApiValue('')).toBe(NA);
  });
  it('keeps zero and false', () => {
    expect(formatApiValue(0)).toBe('0');
    expect(formatApiValue(false)).toBe('false');
  });
  it('appends unit', () => {
    expect(formatApiValue(12.5, 'acres')).toBe('12.5 acres');
  });
  it('stringifies objects', () => {
    expect(formatApiValue({ a: 1 })).toBe('{"a":1}');
  });
});

describe('formatApiTimestamp', () => {
  it('handles missing and invalid', () => {
    expect(formatApiTimestamp(null)).toBe(NA);
    expect(formatApiTimestamp(undefined)).toBe(NA);
    expect(formatApiTimestamp('')).toBe(NA);
    expect(formatApiTimestamp('garbage')).toBe('garbage');
  });
  it('formats ISO as UTC', () => {
    expect(formatApiTimestamp('2026-10-28T10:15:00Z')).toBe('2026-10-28 10:15:00 UTC');
  });
});

describe('formatConfidencePercentage', () => {
  it('handles missing and non-finite', () => {
    expect(formatConfidencePercentage(null)).toBe(NA);
    expect(formatConfidencePercentage(undefined)).toBe(NA);
    expect(formatConfidencePercentage(Number.NaN)).toBe(NA);
  });
  it('converts 0..1 fractions to percent', () => {
    expect(formatConfidencePercentage(0.923)).toBe('92.3%');
    expect(formatConfidencePercentage(0)).toBe('0.0%');
    expect(formatConfidencePercentage(1)).toBe('100.0%');
  });
});

describe('validateUploadFile', () => {
  const mk = (type: string, size: number) => {
    const f = new File(['x'], 'f', { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };
  it('accepts PDF/PNG/JPEG within limit', () => {
    expect(validateUploadFile(mk('application/pdf', 1024))).toBeNull();
    expect(validateUploadFile(mk('image/png', 1))).toBeNull();
    expect(validateUploadFile(mk('image/jpeg', 25 * 1024 * 1024))).toBeNull();
  });
  it('rejects other MIME types', () => {
    expect(validateUploadFile(mk('application/zip', 1024))).toMatch(/PDF|PNG|JPEG/);
  });
  it('rejects over 25 MB', () => {
    expect(validateUploadFile(mk('application/pdf', 25 * 1024 * 1024 + 1))).toMatch(/25 MB/);
  });
});
