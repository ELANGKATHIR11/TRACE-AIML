import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CheckCircle2,
  FilePlus2,
  Menu,
  RefreshCw,
  Server,
  ShieldCheck,
  UserCheck,
  WifiOff,
  X,
} from 'lucide-react';
import { useIdentity } from '../features/identity/IdentityContext';
import { PersonaRole } from '../types/api';
import { StatutoryBanner } from '../components/StatutoryBanner';
import { OpenApiInspectorModal } from '../components/OpenApiInspectorModal';

export function AppShell() {
  const {
    activePersona,
    switchPersona,
    isSwitchingPersona,
    authMode,
    connectionState,
    apiBaseUrl,
    recheckBackendConnection,
  } = useIdentity();

  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const isOfficial =
    activePersona.role === PersonaRole.OFFICIAL ||
    activePersona.role === PersonaRole.REVIEWER;

  const navItems = isOfficial
    ? [
        { to: '/', label: 'Dashboard' },
        { to: '/applications', label: 'Dossier Registry' },
        { to: '/applications/new', label: 'New Intake' },
        { to: '/audit', label: 'Audit Trail' },
      ]
    : [
        { to: '/applicant/applications', label: 'My Applications' },
        { to: '/applications/new', label: 'Submit Application' },
      ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F9] text-[#0F1E36]">
      {/* Skip to main content link for keyboard accessibility */}
      <a
        href="#main-workspace"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#1B365D] focus:text-white focus:text-xs focus:font-semibold"
      >
        Skip to main regulatory workspace
      </a>

      {/* Top Navigation Bar — Strictly follows 3-Zone Top Bar Contract */}
      <header className="bg-[#1B365D] text-white border-b border-[#0F1E36]">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8 px-6 py-3.5">
          {/* Zone 1: Single text element wordmark */}
          <Link
            to={isOfficial ? '/' : '/applicant/applications'}
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            AICTE TRACE
          </Link>

          {/* Zone 2: 4 concise single-line text navigation links */}
          <nav
            aria-label="Primary Regulatory Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-200"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/' || item.to === '/applications'}
                className={({ isActive }) =>
                  `py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    isActive
                      ? 'text-white border-[#C2410C] font-semibold'
                      : 'border-transparent hover:text-white hover:border-slate-400'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Zone 3: 1 primary action + mobile menu button */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/applications/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#C2410C] hover:bg-[#9A3412] transition-colors whitespace-nowrap shrink-0"
            >
              <FilePlus2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Application Intake</span>
            </Link>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-expanded={isMobileMenuOpen}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2 text-white hover:bg-[#0F1E36] cursor-pointer"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile navigation drawer */}
        {isMobileMenuOpen && (
          <nav
            aria-label="Mobile Navigation"
            className="md:hidden border-t border-[#0F1E36] bg-[#0F1E36] px-6 py-3 space-y-2"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-1.5 text-sm font-medium text-white hover:underline"
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* Workspace Control & Persona Context Bar (Below Header) */}
      <div className="bg-white border-b border-[#CBD5E1]">
        <div className="max-w-[1440px] mx-auto px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs">
          {/* Left: Institutional Bureau Context & Breadcrumb */}
          <div className="flex flex-wrap items-center gap-2 text-[#334155]">
            <span className="font-semibold text-[#0F1E36]">
              AICTE Regulation Bureau
            </span>
            <span aria-hidden="true">/</span>
            <span>PS 26261 Compliance & Forensic Engine</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[#475569]">{location.pathname}</span>
          </div>

          {/* Right: Real API Connection Status & Requested Persona Selector */}
          <div className="flex flex-wrap items-center gap-4">
            {/* API Connection Status */}
            <div className="flex items-center gap-2">
              {connectionState === 'ONLINE' ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-[#15803D]">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>API Connected ({apiBaseUrl})</span>
                </span>
              ) : connectionState === 'CHECKING' ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-[#1B365D]">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Probing {apiBaseUrl}...</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#B91C1C]">
                  <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    API {connectionState === 'UNAUTHORIZED' ? '401 Unauthorized' : 'Unreachable'} ({apiBaseUrl})
                  </span>
                </span>
              )}

              <button
                type="button"
                onClick={() => void recheckBackendConnection()}
                aria-label="Retry backend health check"
                className="px-2 py-1 text-xs font-medium text-[#1B365D] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Retry Probe
              </button>

              <button
                type="button"
                onClick={() => setIsInspectorOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#1B365D] border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F4F6F9] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Server className="w-3 h-3" aria-hidden="true" />
                <span>API Contract</span>
              </button>
            </div>

            <span className="text-[#CBD5E1]" aria-hidden="true">|</span>

            {/* Persona Selector */}
            <div className="flex items-center gap-2">
              <UserCheck className="w-3.5 h-3.5 text-[#1B365D]" aria-hidden="true" />
              <label htmlFor="persona-select" className="font-semibold text-[#0F1E36] whitespace-nowrap">
                Active Identity:
              </label>
              <select
                id="persona-select"
                value={activePersona.id}
                disabled={isSwitchingPersona}
                onChange={(e) =>
                  void switchPersona(e.target.value as 'official' | 'applicant')
                }
                className="px-2.5 py-1 text-xs font-medium bg-[#F4F6F9] border border-[#CBD5E1] text-[#0F1E36] cursor-pointer"
              >
                <option value="official">
                  AICTE Scrutiny Officer — official@aicte-india.org (REVIEWER/OFFICIAL)
                </option>
                <option value="applicant">
                  Institution Applicant — applicant@apexedu.ac.in (APPLICANT · Inst #1)
                </option>
              </select>

              <span
                title={
                  authMode === 'BACKEND_VERIFIED'
                    ? 'Verified via backend authentication endpoint'
                    : 'Backend has not exposed an auth endpoint; running in disclosed Dev UI Persona mode'
                }
                className="inline-flex items-center gap-1 text-xs font-mono text-[#475569] whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#9A3412]" aria-hidden="true" />
                <span>
                  {authMode === 'BACKEND_VERIFIED' ? 'Auth: Verified' : 'Auth: Dev Mode'}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Prominent Statutory Safeguard Banner — Always Visible */}
      <StatutoryBanner />

      {/* Main Content Workspace */}
      <main id="main-workspace" className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        <Outlet />
      </main>

      {/* Quiet Institutional Footer */}
      <footer className="bg-white border-t border-[#CBD5E1] mt-auto">
        <div className="max-w-[1440px] mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#475569]">
          <div>
            AICTE TRACE — Trustworthy Regulatory Assurance & Compliance Engine · Smart India Hackathon 2026 (PS 26261)
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsInspectorOpen(true)}
              className="hover:text-[#0F1E36] underline cursor-pointer"
            >
              OpenAPI Contract Matrix
            </button>
            <span>·</span>
            <span>Zero-Mock Enforcement Active</span>
          </div>
        </div>
      </footer>

      <OpenApiInspectorModal
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
      />
    </div>
  );
}
