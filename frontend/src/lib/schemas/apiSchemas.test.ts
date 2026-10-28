import { describe, expect, it } from 'vitest';
import {
  AdminUserFormSchema,
  ApplicantRectificationFormSchema,
  ApplicationIntakeFormSchema,
  ChangePasswordFormSchema,
  LoginFormSchema,
  OfficerDecisionFormSchema,
} from './apiSchemas';

const intake = {
  category: 'EXTENSION_OF_APPROVAL',
  academic_year: '2026-27',
  land_area_acres: 10,
  built_up_area_sqm: 5000,
  total_intake: 120,
  faculty_count: 30,
};

describe('LoginFormSchema', () => {
  it('requires email and password', () => {
    expect(LoginFormSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(LoginFormSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
    expect(LoginFormSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('ChangePasswordFormSchema', () => {
  const ok = {
    current_password: 'old',
    new_password: 'a-long-password-1',
    confirm_password: 'a-long-password-1',
  };
  it('accepts valid', () => expect(ChangePasswordFormSchema.safeParse(ok).success).toBe(true));
  it('rejects short new password', () =>
    expect(
      ChangePasswordFormSchema.safeParse({ ...ok, new_password: 'short', confirm_password: 'short' }).success,
    ).toBe(false));
  it('rejects mismatch', () =>
    expect(
      ChangePasswordFormSchema.safeParse({ ...ok, confirm_password: 'different-password-1' }).success,
    ).toBe(false));
});

describe('ApplicationIntakeFormSchema', () => {
  it('accepts valid and boundaries', () => {
    expect(ApplicationIntakeFormSchema.safeParse(intake).success).toBe(true);
    expect(
      ApplicationIntakeFormSchema.safeParse({
        ...intake,
        land_area_acres: 1000,
        built_up_area_sqm: 1_000_000,
        total_intake: 10_000,
        faculty_count: 5_000,
      }).success,
    ).toBe(true);
    expect(ApplicationIntakeFormSchema.safeParse({ ...intake, land_area_acres: 0 }).success).toBe(true);
  });
  it('rejects out of range', () => {
    expect(ApplicationIntakeFormSchema.safeParse({ ...intake, land_area_acres: 1001 }).success).toBe(false);
    expect(ApplicationIntakeFormSchema.safeParse({ ...intake, built_up_area_sqm: 1_000_001 }).success).toBe(false);
    expect(ApplicationIntakeFormSchema.safeParse({ ...intake, total_intake: 10_001 }).success).toBe(false);
    expect(ApplicationIntakeFormSchema.safeParse({ ...intake, faculty_count: -1 }).success).toBe(false);
  });
});

describe('OfficerDecisionFormSchema', () => {
  const ok = { decision: 'APPROVE', notes: 'Looks fine to me.' };
  it('accepts valid', () => expect(OfficerDecisionFormSchema.safeParse(ok).success).toBe(true));
  it('rejects ESCALATE', () =>
    expect(OfficerDecisionFormSchema.safeParse({ ...ok, decision: 'ESCALATE' }).success).toBe(false));
  it('enforces notes 10-4000', () => {
    expect(OfficerDecisionFormSchema.safeParse({ ...ok, notes: '123456789' }).success).toBe(false);
    expect(OfficerDecisionFormSchema.safeParse({ ...ok, notes: '1234567890' }).success).toBe(true);
    expect(OfficerDecisionFormSchema.safeParse({ ...ok, notes: 'x'.repeat(4000) }).success).toBe(true);
    expect(OfficerDecisionFormSchema.safeParse({ ...ok, notes: 'x'.repeat(4001) }).success).toBe(false);
  });
});

describe('ApplicantRectificationFormSchema', () => {
  it('allows optional amended numbers, caps notes', () => {
    expect(ApplicantRectificationFormSchema.safeParse({ notes: 'fixed' }).success).toBe(true);
    expect(ApplicantRectificationFormSchema.safeParse({ notes: 'fixed', land_area_acres: 12 }).success).toBe(true);
    expect(ApplicantRectificationFormSchema.safeParse({ notes: 'x'.repeat(4001) }).success).toBe(false);
    expect(ApplicantRectificationFormSchema.safeParse({ notes: 'fixed', land_area_acres: 5000 }).success).toBe(false);
  });
});

describe('AdminUserFormSchema', () => {
  const base = { email: 'u@x.co', full_name: 'U Ser', temporary_password: 'twelve-chars-ok' };
  it('applicant requires institution_id', () => {
    expect(AdminUserFormSchema.safeParse({ ...base, role: 'applicant' }).success).toBe(false);
    expect(AdminUserFormSchema.safeParse({ ...base, role: 'applicant', institution_id: 3 }).success).toBe(true);
  });
  it('staff must not have institution_id', () => {
    expect(AdminUserFormSchema.safeParse({ ...base, role: 'reviewer', institution_id: 3 }).success).toBe(false);
    expect(AdminUserFormSchema.safeParse({ ...base, role: 'reviewer' }).success).toBe(true);
    expect(AdminUserFormSchema.safeParse({ ...base, role: 'admin' }).success).toBe(true);
  });
  it('temporary_password 12-128', () => {
    expect(AdminUserFormSchema.safeParse({ ...base, role: 'admin', temporary_password: 'short' }).success).toBe(false);
    expect(
      AdminUserFormSchema.safeParse({ ...base, role: 'admin', temporary_password: 'x'.repeat(129) }).success,
    ).toBe(false);
  });
});
