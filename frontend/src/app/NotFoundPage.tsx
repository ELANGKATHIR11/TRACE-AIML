import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { landingPathFor, useAuth } from '../features/auth/AuthContext';

export function NotFoundPage() {
  const { user } = useAuth();
  const isApplicant = user?.role === 'applicant';
  return (
    <div className="my-12 border border-[#CBD5E1] bg-white p-10 text-center max-w-xl mx-auto">
      <Compass className="w-8 h-8 text-[#1B365D] mx-auto mb-3" aria-hidden="true" />
      <div className="text-xs font-mono font-semibold text-[#9A3412]">[HTTP 404 ROUTE NOT FOUND]</div>
      <h1 className="text-xl font-bold text-[#0F1E36] mt-1">
        Requested Regulatory Route Does Not Exist
      </h1>
      <p className="text-xs text-[#334155] mt-2 leading-relaxed">
        The requested path does not match any verified AICTE TRACE workflow route. Use the
        institutional navigation links to return to your workspace.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link
          to={user ? landingPathFor(user.role) : '/'}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36]"
        >
          {isApplicant ? 'Return to My Applications' : 'Return to Executive Dashboard'}
        </Link>
        {user && !isApplicant && (
          <Link
            to="/applications"
            className="px-4 py-2 text-xs font-semibold text-[#1B365D] border border-[#CBD5E1] bg-[#F4F6F9] hover:bg-[#E2E8F0]"
          >
            Open Dossier Registry
          </Link>
        )}
      </div>
    </div>
  );
}
