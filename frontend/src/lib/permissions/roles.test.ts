import { describe, expect, it } from 'vitest';
import { canDecide, canSubmitRectification, canValidate, isStaff, type Role } from './roles';

const roles: Role[] = ['applicant', 'reviewer', 'admin'];

describe('role helpers', () => {
  it('truth table', () => {
    expect(roles.map(isStaff)).toEqual([false, true, true]);
    expect(roles.map(canDecide)).toEqual([false, true, false]);
    expect(roles.map(canValidate)).toEqual([false, true, true]);
  });
  it('canSubmitRectification needs applicant + RECTIFICATION_REQUESTED', () => {
    expect(canSubmitRectification({ role: 'applicant' }, 'RECTIFICATION_REQUESTED')).toBe(true);
    expect(canSubmitRectification({ role: 'applicant' }, 'SUBMITTED')).toBe(false);
    expect(canSubmitRectification({ role: 'reviewer' }, 'RECTIFICATION_REQUESTED')).toBe(false);
    expect(canSubmitRectification({ role: 'admin' }, 'RECTIFICATION_REQUESTED')).toBe(false);
  });
});
