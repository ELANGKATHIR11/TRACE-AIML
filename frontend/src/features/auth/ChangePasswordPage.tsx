import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import {
  ChangePasswordFormSchema,
  ChangePasswordFormValues,
} from '../../lib/schemas/apiSchemas';
import { changePassword } from '../../lib/api/endpoints';
import { ApiClientError } from '../../lib/api/transport';
import { AuthLoadingState, useAuth } from './AuthContext';
import { AuthCard, postLoginPath } from './LoginPage';

const FIELDS: (keyof ChangePasswordFormValues)[] = [
  'current_password',
  'new_password',
  'confirm_password',
];

export function ChangePasswordPage() {
  const { status, user, refreshUser, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(ChangePasswordFormSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  });

  if (status === 'loading') return <AuthLoadingState />;
  if (!user) return <Navigate to="/login?next=%2Fchange-password" replace />;

  const forced = user.must_change_password;
  const nextPath = searchParams.get('next');

  const onSubmit = async (values: ChangePasswordFormValues) => {
    setFormError(null);
    try {
      await changePassword(values.current_password, values.new_password);
      await refreshUser();
      navigate(postLoginPath(nextPath, user), { replace: true });
    } catch (err) {
      if (!(err instanceof ApiClientError)) {
        setFormError('Unable to reach the TRACE server. Check your connection and try again.');
        return;
      }
      if (err.status === 400) {
        setError('current_password', { type: 'server', message: err.detail });
        return;
      }
      const fieldEntries = Object.entries(err.fieldErrors).filter(([field]) =>
        (FIELDS as string[]).includes(field),
      );
      if (fieldEntries.length > 0) {
        for (const [field, message] of fieldEntries) {
          setError(field as keyof ChangePasswordFormValues, { type: 'server', message });
        }
      } else if (err.status === 422) {
        // Password-policy failures arrive as a plain `detail` string.
        setError('new_password', { type: 'server', message: err.detail });
      } else {
        setFormError(`Password change failed (HTTP ${err.status}): ${err.detail}`);
      }
    }
  };

  const fieldClass =
    'w-full px-3 py-2 text-xs bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]';

  return (
    <AuthCard
      title="Change password"
      subtitle={
        forced
          ? 'Your account was issued a temporary password. Choose a new password to continue.'
          : `Signed in as ${user.email}.`
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label htmlFor="current-password" className="block text-xs font-semibold text-[#0F1E36] mb-1">
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            {...register('current_password')}
            className={fieldClass}
          />
          {errors.current_password && (
            <p role="alert" className="mt-1 text-xs text-[#B91C1C] font-medium">
              {errors.current_password.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="new-password" className="block text-xs font-semibold text-[#0F1E36] mb-1">
            New password (12–128 characters)
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            {...register('new_password')}
            className={fieldClass}
          />
          {errors.new_password && (
            <p role="alert" className="mt-1 text-xs text-[#B91C1C] font-medium">
              {errors.new_password.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-xs font-semibold text-[#0F1E36] mb-1">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            {...register('confirm_password')}
            className={fieldClass}
          />
          {errors.confirm_password && (
            <p role="alert" className="mt-1 text-xs text-[#B91C1C] font-medium">
              {errors.confirm_password.message}
            </p>
          )}
        </div>

        {formError && (
          <p
            role="alert"
            className="border border-[#FECACA] bg-[#FEF2F2] p-3 text-xs font-medium text-[#7F1D1D]"
          >
            {formError}
          </p>
        )}

        <div className="pt-2 flex items-center justify-between gap-3 border-t border-[#CBD5E1]">
          {forced ? (
            <button
              type="button"
              onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
              className="text-xs font-semibold text-[#1B365D] hover:underline cursor-pointer"
            >
              Sign out
            </button>
          ) : (
            <Link
              to={postLoginPath(nextPath, user)}
              className="text-xs font-semibold text-[#1B365D] hover:underline"
            >
              Cancel
            </Link>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isSubmitting ? 'Changing password...' : 'Change password'}</span>
          </button>
        </div>
      </form>
    </AuthCard>
  );
}
