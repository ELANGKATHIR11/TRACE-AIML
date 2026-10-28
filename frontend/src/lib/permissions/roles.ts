export type Role = 'applicant' | 'reviewer' | 'admin';

export const isStaff = (r: Role): boolean => r === 'reviewer' || r === 'admin';

/** Only reviewers record officer decisions. */
export const canDecide = (r: Role): boolean => r === 'reviewer';

export const canValidate = (r: Role): boolean => r === 'reviewer' || r === 'admin';

export const canSubmitRectification = (user: { role: Role }, status: string): boolean =>
  user.role === 'applicant' && status === 'RECTIFICATION_REQUESTED';
