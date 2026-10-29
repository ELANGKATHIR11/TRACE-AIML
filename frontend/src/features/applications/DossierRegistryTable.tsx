import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpDown, Filter, RefreshCw, Search } from 'lucide-react';
import { fetchApplications } from '../../lib/api/endpoints';
import {
  formatApiTimestamp,
  formatApiValue,
} from '../../lib/utils/formatters';
import {
  ApiEmptyState,
  ApiErrorState,
  ApiLoadingState,
  StatusIndicator,
} from '../../components/ApiStateFeedback';
import { ApplicationRecord } from '../../types/api';

const PAGE_SIZE = 10;

export function DossierRegistryTable({
  institutionIdFilter,
  detailRoutePrefix = '/applications',
  title = 'Dossier Registry',
}: {
  institutionIdFilter?: number;
  detailRoutePrefix?: '/applications' | '/applicant/applications';
  title?: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sortField, setSortField] = useState<'id' | 'created_at' | 'status'>('id');
  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const applicationsQuery = useQuery({
    queryKey: ['applications', { institutionIdFilter }],
    queryFn: ({ signal }) =>
      fetchApplications(
        institutionIdFilter !== undefined ? { institution_id: institutionIdFilter } : undefined,
        signal
      ),
    retry: 1,
    refetchInterval: 10_000,
  });

  const rawRecords: ApplicationRecord[] = applicationsQuery.data ?? [];

  const distinctStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of rawRecords) {
      if (r.status) set.add(r.status);
    }
    return Array.from(set);
  }, [rawRecords]);

  const distinctCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rawRecords) {
      const cat = r.category || r.application_category;
      if (cat) set.add(cat);
    }
    return Array.from(set);
  }, [rawRecords]);

  const filteredRecords = useMemo(() => {
    return rawRecords
      .filter((item) => {
        if (statusFilter !== 'ALL' && item.status !== statusFilter) {
          return false;
        }
        const cat = item.category || item.application_category;
        if (categoryFilter !== 'ALL' && cat !== categoryFilter) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const matchId = String(item.id).toLowerCase().includes(q);
          const matchNum = (item.application_number || '').toLowerCase().includes(q);
          const matchInst = (item.institution_name || '').toLowerCase().includes(q);
          const matchCat = (cat || '').toLowerCase().includes(q);
          const matchYear = (item.academic_year || '').toLowerCase().includes(q);
          return matchId || matchNum || matchInst || matchCat || matchYear;
        }
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'id') {
          cmp = String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
        } else if (sortField === 'status') {
          cmp = String(a.status || '').localeCompare(String(b.status || ''));
        } else {
          cmp = String(a.created_at || a.updated_at || '').localeCompare(
            String(b.created_at || b.updated_at || '')
          );
        }
        return sortAsc ? cmp : -cmp;
      });
  }, [rawRecords, statusFilter, categoryFilter, searchQuery, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRecords = filteredRecords.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const handleSort = (field: 'id' | 'created_at' | 'status') => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <section aria-labelledby="dossier-registry-heading" className="bg-white border border-[#CBD5E1]">
      {/* Header & Filter Bar */}
      <div className="p-5 border-b border-[#CBD5E1] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 id="dossier-registry-heading" className="text-base font-bold text-[#0F1E36]">
              {title}
            </h2>
            <p className="text-xs text-[#334155]">
              Source endpoint: <code className="font-mono">GET /api/applications</code>
              {institutionIdFilter !== undefined && (
                <span> · Filtered for Institution ID #{institutionIdFilter}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void applicationsQuery.refetch()}
              disabled={applicationsQuery.isFetching}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1B365D] bg-[#F4F6F9] border border-[#CBD5E1] hover:bg-[#E2E8F0] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${applicationsQuery.isFetching ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Refresh Registry</span>
            </button>

            <Link
              to="/applications/new"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] whitespace-nowrap shrink-0"
            >
              <span>New Application Intake</span>
            </Link>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="relative">
            <label htmlFor="dossier-search-input" className="sr-only">
              Search dossiers by ID, institution, category, or academic year
            </label>
            <Search
              className="w-3.5 h-3.5 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              id="dossier-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Filter returned records by ID, institution, year..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[#475569] shrink-0" aria-hidden="true" />
            <label htmlFor="dossier-status-filter" className="text-xs font-medium text-[#334155] whitespace-nowrap">
              Status:
            </label>
            <select
              id="dossier-status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
            >
              <option value="ALL">All Returned Statuses</option>
              {distinctStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="dossier-category-filter" className="text-xs font-medium text-[#334155] whitespace-nowrap">
              Category:
            </label>
            <select
              id="dossier-category-filter"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36]"
            >
              <option value="ALL">All Returned Categories</option>
              {distinctCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Body States */}
      <div className="p-5">
        {applicationsQuery.isLoading ? (
          <ApiLoadingState label="Fetching application dossiers from GET /api/applications..." rows={5} />
        ) : applicationsQuery.isError ? (
          <ApiErrorState
            title="Failed to Retrieve Application Registry"
            error={applicationsQuery.error}
            endpoint="GET /api/applications"
            onRetry={() => void applicationsQuery.refetch()}
            isRetrying={applicationsQuery.isFetching}
          />
        ) : rawRecords.length === 0 ? (
          <ApiEmptyState
            title="No Application Dossiers Returned by Backend"
            description="The backend returned an empty application list. Submit a new application dossier via Application Intake to populate the registry."
            endpoint="GET /api/applications"
            action={
              <Link
                to="/applications/new"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36]"
              >
                Create Application Dossier
              </Link>
            }
          />
        ) : filteredRecords.length === 0 ? (
          <ApiEmptyState
            title="No Dossiers Match Current Client Filter"
            description="Clear the search query or status/category filter to view the returned backend records."
            action={
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setCategoryFilter('ALL');
                }}
                className="px-4 py-2 text-xs font-semibold text-[#1B365D] border border-[#CBD5E1] bg-white hover:bg-[#F4F6F9] cursor-pointer"
              >
                Reset Filter Controls
              </button>
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto border border-[#CBD5E1]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F4F6F9] border-b border-[#CBD5E1] text-[#0F1E36]">
                    <th className="py-2.5 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => handleSort('id')}
                        className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <span>App ID</span>
                        <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-semibold">Institution</th>
                    <th className="py-2.5 px-3 font-semibold">Category</th>
                    <th className="py-2.5 px-3 font-semibold">Academic Year</th>
                    <th className="py-2.5 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => handleSort('status')}
                        className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <span>Status</span>
                        <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-right">Land (Acres)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Built-Up (m²)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Intake</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Faculty</th>
                    <th className="py-2.5 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => handleSort('created_at')}
                        className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <span>Updated / Created</span>
                        <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {paginatedRecords.map((app) => {
                    const landArea = app.declared_land_area ?? app.land_area_acres;
                    const builtUp = app.built_up_area ?? app.built_up_area_sqm;
                    const intake = app.total_intake ?? app.intake;
                    const category = app.category ?? app.application_category;
                    const timestamp = app.updated_at ?? app.created_at ?? app.submitted_at;

                    return (
                      <tr key={String(app.id)} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="py-2.5 px-3 font-mono font-semibold text-[#1B365D]">
                          <Link
                            to={`${detailRoutePrefix}/${encodeURIComponent(String(app.id))}`}
                            className="hover:underline"
                          >
                            #{String(app.application_number || app.id)}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3 text-[#0F1E36]">
                          {app.institution_name
                            ? app.institution_name
                            : app.institution_id !== undefined && app.institution_id !== null
                            ? `Institution #${app.institution_id}`
                            : 'Not provided by API'}
                        </td>
                        <td className="py-2.5 px-3 text-[#334155]">{formatApiValue(category)}</td>
                        <td className="py-2.5 px-3 font-mono text-[#334155]">
                          {formatApiValue(app.academic_year)}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusIndicator value={app.status} />
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#0F1E36]">
                          {formatApiValue(landArea)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#0F1E36]">
                          {formatApiValue(builtUp)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#0F1E36]">
                          {formatApiValue(intake)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#0F1E36]">
                          {formatApiValue(app.faculty_count)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#475569]">
                          {formatApiTimestamp(timestamp)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Link
                            to={`${detailRoutePrefix}/${encodeURIComponent(String(app.id))}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#1B365D] hover:bg-[#E2E8F0] whitespace-nowrap shrink-0"
                          >
                            <span>Open Dossier</span>
                            <ArrowRight className="w-3 h-3" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bounded Client-Side Presentation Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#475569]">
              <div>
                Showing {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, filteredRecords.length)} of{' '}
                <strong className="font-mono text-[#0F1E36]">{filteredRecords.length}</strong>{' '}
                returned backend records (Bounded client-side page presentation)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 border border-[#CBD5E1] bg-white text-[#0F1E36] disabled:opacity-40 cursor-pointer"
                >
                  Previous
                </button>
                <span className="font-mono">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 border border-[#CBD5E1] bg-white text-[#0F1E36] disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
