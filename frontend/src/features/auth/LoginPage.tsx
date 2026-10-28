import React, { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn } from 'lucide-react';
import { LoginFormSchema, LoginFormValues } from '../../lib/schemas/apiSchemas';
import { ApiClientError } from '../../lib/api/transport';
import { AuthLoadingState, landingPathFor, safeNextPath, useAuth } from './AuthContext';
import type { User } from '../../types/api';

const GENERIC_LOGIN_ERROR = 'Incorrect email or password';

/** Where to go once signed in: a safe `next` path, else the role's landing page. */
export function postLoginPath(next: string | null, user: User): string {
  const safe = safeNextPath(next);
  return safe === '/' ? landingPathFor(user.role) : safe;
}

function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.status === 401) return GENERIC_LOGIN_ERROR;
    if (err.status === 429) return err.detail;
    return `Sign-in failed (HTTP ${err.status}). Please try again.`;
  }
  return 'Unable to reach the TRACE server. Check your connection and try again.';
}

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F9] text-[#0F1E36]">
      <header className="bg-[#1B365D] text-white border-b border-[#0F1E36]">
        <div className="max-w-[1440px] mx-auto px-6 py-3.5">
          <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
            AICTE TRACE
          </span>
        </div>
      </header>
      <main id="main-workspace" className="flex-1 flex items-start justify-center px-6 py-12">
        <section className="w-full max-w-md bg-white border border-[#CBD5E1] p-6 space-y-5">
          <div className="border-b border-[#CBD5E1] pb-3">
            <h1 className="text-xl font-bold text-[#0F1E36] tracking-tight">{title}</h1>
            <p className="text-xs text-[#334155] mt-1">{subtitle}</p>
          </div>
          {children}
        </section>
      </main>
    </div>
  );
}

export function LoginPage() {
  const { status, user, login } = useAuth();
  const [searchParams] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  if (status === 'loading') return <AuthLoadingState />;
  if (status === 'authenticated' && user) {
    return <Navigate to={postLoginPath(searchParams.get('next'), user)} replace />;
  }

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    try {
      await login(values.email, values.password);
    } catch (err) {
      setFormError(loginErrorMessage(err));
    }
  };

  return (
    <AuthCard
      title="Sign in to AICTE TRACE"
      subtitle="Use the account issued by your AICTE administrator."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-xs font-semibold text-[#0F1E36] mb-1">
            Email address
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            {...register('email')}
            className="w-full px-3 py-2 text-xs bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-[#B91C1C] font-medium">Enter a valid email address.</p>
          )}
        </div>

        <div>
          <label htmlFor="login-password" className="block text-xs font-semibold text-[#0F1E36] mb-1">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
            className="w-full px-3 py-2 text-xs bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-[#B91C1C] font-medium">{errors.password.message}</p>
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

        <div className="pt-2 flex justify-end border-t border-[#CBD5E1]">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isSubmitting ? 'Signing in...' : 'Sign in'}</span>
          </button>
        </div>
      </form>
    </AuthCard>
  );
}
