import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Users } from 'lucide-react';
import {
  createUser,
  fetchInstitutions,
  listUsers,
  updateUser,
} from '../../lib/api/endpoints';
import { AdminUserFormSchema, AdminUserFormValues } from '../../lib/schemas/apiSchemas';
import { ApiClientError } from '../../lib/api/transport';
import { formatApiTimestamp } from '../../lib/utils/formatters';
import { ApiErrorState, ApiLoadingState } from '../../components/ApiStateFeedback';
import type { AdminUserUpdate, Institution, User } from '../../types/api';
import type { Role } from '../../lib/permissions/roles';

const ROLES: Role[] = ['applicant', 'reviewer', 'admin'];
const USERS_KEY = ['admin-users'];
const FIELD_CLASS = 'w-full px-3 py-2 text-xs bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]';
const FORM_FIELDS = ['email', 'full_name', 'role', 'institution_id', 'temporary_password'] as const;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-[#B91C1C] font-medium">
      {message}
    </p>
  );
}

function UserRow({
  user,
  institutions,
  onUpdate,
  pending,
}: {
  user: User;
  institutions: Institution[];
  onUpdate: (id: number, payload: AdminUserUpdate) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<Role>(user.role);
  const [institutionId, setInstitutionId] = useState<string>(
    user.institution_id === null ? '' : String(user.institution_id),
  );
  const [newPassword, setNewPassword] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const institutionName = institutions.find((i) => i.id === user.institution_id)?.name;

  const save = () => {
    if (role === 'applicant' && institutionId === '') {
      setEditError('Applicants require an institution');
      return;
    }
    if (newPassword !== '' && (newPassword.length < 12 || newPassword.length > 128)) {
      setEditError('Password must be 12-128 characters');
      return;
    }
    setEditError(null);
    const payload: AdminUserUpdate = {
      role,
      institution_id: role === 'applicant' ? Number(institutionId) : null,
    };
    if (newPassword !== '') payload.reset_password = newPassword;
    onUpdate(user.id, payload);
    setEditing(false);
    setNewPassword('');
  };

  return (
    <tr className="border-t border-[#CBD5E1] align-top">
      <td className="px-3 py-2 font-mono">{user.email}</td>
      <td className="px-3 py-2">{user.full_name}</td>
      <td className="px-3 py-2 font-mono">{user.role}</td>
      <td className="px-3 py-2">
        {user.institution_id === null ? '—' : (institutionName ?? `#${user.institution_id}`)}
      </td>
      <td className="px-3 py-2">{user.is_active ? 'Active' : 'Deactivated'}</td>
      <td className="px-3 py-2 font-mono">{formatApiTimestamp(user.created_at)}</td>
      <td className="px-3 py-2 space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => onUpdate(user.id, { is_active: !user.is_active })}
            aria-label={`${user.is_active ? 'Deactivate' : 'Reactivate'} ${user.email}`}
            className="px-2.5 py-1 text-xs font-semibold text-[#1B365D] border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F4F6F9] cursor-pointer disabled:opacity-60"
          >
            {user.is_active ? 'Deactivate' : 'Reactivate'}
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label={`Edit ${user.email}`}
            className="px-2.5 py-1 text-xs font-semibold text-[#1B365D] border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F4F6F9] cursor-pointer"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editing && (
          <div className="space-y-2 min-w-56">
            <select
              aria-label={`Role for ${user.email}`}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className={FIELD_CLASS}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {role === 'applicant' && (
              <select
                aria-label={`Institution for ${user.email}`}
                value={institutionId}
                onChange={(e) => setInstitutionId(e.target.value)}
                className={FIELD_CLASS}
              >
                <option value="">Select institution</option>
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="password"
              autoComplete="new-password"
              aria-label={`Reset password for ${user.email}`}
              placeholder="New temporary password (optional)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={FIELD_CLASS}
            />
            <FieldError message={editError ?? undefined} />
            <button
              type="button"
              onClick={save}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] cursor-pointer"
            >
              Save changes
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function AdminUsersPage() {
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: USERS_KEY,
    queryFn: ({ signal }) => listUsers(signal),
  });
  const institutionsQuery = useQuery({
    queryKey: ['institutions'],
    queryFn: ({ signal }) => fetchInstitutions(signal),
  });
  const institutions = institutionsQuery.data ?? [];

  const {
    register,
    handleSubmit,
    watch,
    setError,
    reset,
    formState: { errors },
  } = useForm<AdminUserFormValues>({
    resolver: zodResolver(AdminUserFormSchema),
    defaultValues: { role: 'reviewer' },
  });
  const selectedRole = watch('role');

  const createMutation = useMutation({
    mutationFn: (values: AdminUserFormValues) => createUser(values),
    retry: false,
    onSuccess: () => {
      reset({ role: 'reviewer' });
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        for (const [field, message] of Object.entries(err.fieldErrors)) {
          if ((FORM_FIELDS as readonly string[]).includes(field)) {
            setError(field as keyof AdminUserFormValues, { type: 'server', message });
          }
        }
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: AdminUserUpdate }) =>
      updateUser(id, payload),
    retry: false,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
    },
  });

  return (
    <div className="space-y-6 animate-dossier-settle">
      <div className="flex items-center gap-3 border-b border-[#CBD5E1] pb-4">
        <Users className="w-6 h-6 text-[#1B365D]" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-[#0F1E36] tracking-tight">User Administration</h1>
          <p className="text-xs text-[#334155] mt-1">
            Create accounts, change roles, reset passwords and deactivate users via{' '}
            <code className="font-mono">/api/admin/users</code>.
          </p>
        </div>
      </div>

      <section
        aria-labelledby="create-user-heading"
        className="bg-white border border-[#CBD5E1] p-6 space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-[#CBD5E1] pb-3">
          <UserPlus className="w-4 h-4 text-[#1B365D]" aria-hidden="true" />
          <h2 id="create-user-heading" className="text-base font-bold text-[#0F1E36]">
            Create user
          </h2>
        </div>
        <form
          onSubmit={handleSubmit((values) => createMutation.mutate(values))}
          noValidate
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div>
            <label htmlFor="user-email" className="block text-xs font-semibold text-[#0F1E36] mb-1">
              Email *
            </label>
            <input id="user-email" type="email" {...register('email')} className={FIELD_CLASS} />
            <FieldError message={errors.email?.message} />
          </div>
          <div>
            <label htmlFor="user-full-name" className="block text-xs font-semibold text-[#0F1E36] mb-1">
              Full name *
            </label>
            <input id="user-full-name" type="text" {...register('full_name')} className={FIELD_CLASS} />
            <FieldError message={errors.full_name?.message} />
          </div>
          <div>
            <label htmlFor="user-role" className="block text-xs font-semibold text-[#0F1E36] mb-1">
              Role *
            </label>
            <select id="user-role" {...register('role')} className={FIELD_CLASS}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <FieldError message={errors.role?.message} />
          </div>
          {selectedRole === 'applicant' && (
            <div>
              <label
                htmlFor="user-institution"
                className="block text-xs font-semibold text-[#0F1E36] mb-1"
              >
                Institution *
              </label>
              <select
                id="user-institution"
                {...register('institution_id', {
                  setValueAs: (v: string) => (v === '' || v == null ? undefined : Number(v)),
                })}
                className={FIELD_CLASS}
              >
                <option value="">Select institution</option>
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <FieldError message={errors.institution_id?.message} />
            </div>
          )}
          <div>
            <label htmlFor="user-password" className="block text-xs font-semibold text-[#0F1E36] mb-1">
              Temporary password (12-128 characters) *
            </label>
            <input
              id="user-password"
              type="password"
              autoComplete="new-password"
              {...register('temporary_password')}
              className={FIELD_CLASS}
            />
            <FieldError message={errors.temporary_password?.message} />
          </div>

          <div className="sm:col-span-2 space-y-3">
            {createMutation.isError && (
              <ApiErrorState
                title="User Creation Failed"
                error={createMutation.error}
                endpoint="POST /api/admin/users"
              />
            )}
            <div className="flex justify-end border-t border-[#CBD5E1] pt-3">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] disabled:opacity-60 cursor-pointer"
              >
                {createMutation.isPending ? 'Creating...' : 'Create user'}
              </button>
            </div>
          </div>
        </form>
      </section>

      <section aria-labelledby="user-list-heading" className="bg-white border border-[#CBD5E1] p-6 space-y-4">
        <h2 id="user-list-heading" className="text-base font-bold text-[#0F1E36]">
          Users
        </h2>
        {updateMutation.isError && (
          <ApiErrorState
            title="User Update Failed"
            error={updateMutation.error}
            endpoint="PATCH /api/admin/users/{id}"
          />
        )}
        {usersQuery.isLoading ? (
          <ApiLoadingState label="Loading users..." />
        ) : usersQuery.isError ? (
          <ApiErrorState
            title="Could Not Load Users"
            error={usersQuery.error}
            endpoint="GET /api/admin/users"
            onRetry={() => void usersQuery.refetch()}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[#475569]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Institution</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Created</th>
                  <th className="px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(usersQuery.data ?? []).map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    institutions={institutions}
                    pending={updateMutation.isPending}
                    onUpdate={(id, payload) => updateMutation.mutate({ id, payload })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
