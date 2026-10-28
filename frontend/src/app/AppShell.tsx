import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FilePlus2, KeyRound, LogOut, Menu, UserCheck, X } from 'lucide-react';
import { landingPathFor, useAuth } from '../features/auth/AuthContext';
import type { Role } from '../lib/permissions/roles';
import { StatutoryBanner } from '../components/StatutoryBanner';

/** Primary navigation per role (spec §7.4). */
const NAV_ITEMS: Record<Role, { to: string; label: string }[]> = {
  applicant: [
    { to: '/applicant/applications', label: 'My Applications' },
    { to: '/applications/new', label: 'New Application' },
  ],
  reviewer: [
    { to: '/', label: 'Dashboard' },
    { to: '/applications', label: 'Dossier Registry' },
    { to: '/audit', label: 'Audit Trail' },
  ],
  admin: [
    { to: '/', label: 'Dashboard' },
    { to: '/applications', label: 'Dossier Registry' },
    { to: '/audit', label: 'Audit Trail' },
    { to: '/admin/users', label: 'Users' },
  ],
};

const ROLE_LABELS: Record<Role, string> = {
  applicant: 'Institution Applicant',
  reviewer: 'Scrutiny Reviewer',
  admin: 'Administrator',
};

export function AppShell() {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // RequireAuth guarantees a user; render nothing during the instant a sign-out takes effect.
  if (!user) return null;

  const navItems = NAV_ITEMS[user.role];
  const changePasswordHref = `/change-password?next=${encodeURIComponent(
    `${location.pathname}${location.search}`,
  )}`;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
    }
    navigate('/login', { replace: true });
  };

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
            to={landingPathFor(user.role)}
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
            {user.role === 'applicant' && (
              <Link
                to="/applications/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#C2410C] hover:bg-[#9A3412] transition-colors whitespace-nowrap shrink-0"
              >
                <FilePlus2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Application Intake</span>
              </Link>
            )}

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

      {/* Workspace Context & User Bar (Below Header) */}
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

          {/* Right: Signed-in user menu */}
          <div
            role="group"
            aria-label="Signed-in user"
            className="flex flex-wrap items-center gap-3"
          >
            <span className="inline-flex items-center gap-2">
              <UserCheck className="w-3.5 h-3.5 text-[#1B365D]" aria-hidden="true" />
              <span className="font-semibold text-[#0F1E36] whitespace-nowrap">{user.full_name}</span>
              <span className="font-mono text-[#475569] whitespace-nowrap">
                {ROLE_LABELS[user.role]}
                {user.role === 'applicant' && user.institution_id !== null
                  ? ` · Inst #${user.institution_id}`
                  : ''}
              </span>
            </span>

            <span className="text-[#CBD5E1]" aria-hidden="true">|</span>

            <Link
              to={changePasswordHref}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#1B365D] border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F4F6F9] whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3 h-3" aria-hidden="true" />
              <span>Change password</span>
            </Link>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3 h-3" aria-hidden="true" />
              <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
            </button>
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
            <span>Zero-Mock Enforcement Active</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
