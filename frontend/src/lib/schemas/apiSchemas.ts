import { z } from 'zod';

const landArea = z.number().min(0).max(1000);
const builtUp = z.number().min(0).max(1_000_000);
const totalIntake = z.number().min(0).max(10_000);
const facultyCount = z.number().min(0).max(5_000);

export const LoginFormSchema = z.object({
  email: z.email(),
  password: z.string().min(1, 'Password is required'),
});
export type LoginFormValues = z.infer<typeof LoginFormSchema>;

export const ChangePasswordFormSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z.string().min(12, 'At least 12 characters').max(128),
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });
export type ChangePasswordFormValues = z.infer<typeof ChangePasswordFormSchema>;

export const ApplicationIntakeFormSchema = z.object({
  category: z.string().min(1),
  academic_year: z.string().min(1),
  land_area_acres: landArea,
  built_up_area_sqm: builtUp,
  total_intake: totalIntake,
  faculty_count: facultyCount,
});
export type ApplicationIntakeFormValues = z.infer<typeof ApplicationIntakeFormSchema>;

export const OfficerDecisionFormSchema = z.object({
  decision: z.enum(['APPROVE', 'REQUEST_RECTIFICATION', 'REJECT']),
  notes: z.string().min(10, 'At least 10 characters').max(4000),
});
export type OfficerDecisionFormValues = z.infer<typeof OfficerDecisionFormSchema>;

export const ApplicantRectificationFormSchema = z.object({
  notes: z.string().max(4000),
  land_area_acres: landArea.optional(),
  built_up_area_sqm: builtUp.optional(),
  total_intake: totalIntake.optional(),
  faculty_count: facultyCount.optional(),
});
export type ApplicantRectificationFormValues = z.infer<typeof ApplicantRectificationFormSchema>;

export const AdminUserFormSchema = z
  .object({
    email: z.email(),
    full_name: z.string().min(1),
    role: z.enum(['applicant', 'reviewer', 'admin']),
    institution_id: z.number().int().positive().optional(),
    temporary_password: z.string().min(12, 'At least 12 characters').max(128),
  })
  .superRefine((v, ctx) => {
    if (v.role === 'applicant' && v.institution_id === undefined) {
      ctx.addIssue({ code: 'custom', path: ['institution_id'], message: 'Applicants require an institution' });
    }
    if (v.role !== 'applicant' && v.institution_id !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['institution_id'], message: 'Staff users must not have an institution' });
    }
  });
export type AdminUserFormValues = z.infer<typeof AdminUserFormSchema>;
