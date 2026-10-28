import { describe, expect, it } from 'vitest';
import { verificationDetail } from './verificationDisplay';

describe('verificationDetail', () => {
  it('treats the backend default empty details object as absent', () => {
    expect(
      verificationDetail({ status: 'VERIFIED', details: {}, reference_id: 'BHU-77' }),
    ).toBe('Reference BHU-77');
    expect(
      verificationDetail({ status: 'PENDING', details: {}, checked_at: '2026-10-28T10:00:00Z' }),
    ).toBe('2026-10-28T10:00:00Z');
  });

  it('treats empty strings as absent', () => {
    expect(verificationDetail({ status: 'VERIFIED', details: '', provenance: 'Bhulekh portal' })).toBe(
      'Bhulekh portal',
    );
  });

  it('keeps non-empty details', () => {
    expect(verificationDetail({ status: 'MISMATCH', details: 'Area differs' })).toBe('Area differs');
    expect(verificationDetail({ status: 'MISMATCH', details: { area: 3 } })).toEqual({ area: 3 });
  });

  it('returns undefined when nothing is available', () => {
    expect(verificationDetail({ status: 'PENDING', details: {} })).toBeUndefined();
  });
});
