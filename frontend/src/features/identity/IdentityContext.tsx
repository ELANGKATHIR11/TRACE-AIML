import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { OpenAPISpec, PersonaRole, RequestedPersona } from '../../types/api';
import { REQUESTED_PERSONAS } from '../../lib/permissions/roles';
import {
  apiRequest,
  getApiBaseUrl,
  setApiBaseUrlOverride,
  setRuntimeAuthToken,
} from '../../lib/api/transport';
import { fetchOpenApiSchema } from '../../lib/api/endpoints';

export type BackendConnectionState = 'CHECKING' | 'ONLINE' | 'UNAUTHORIZED' | 'OFFLINE';
export type AuthVerificationMode = 'BACKEND_VERIFIED' | 'DEV_ONLY_UNVERIFIED';

interface IdentityContextValue {
  activePersona: RequestedPersona;
  switchPersona: (personaId: 'official' | 'applicant') => Promise<void>;
  isSwitchingPersona: boolean;
  authMode: AuthVerificationMode;
  authStatusNote: string;
  connectionState: BackendConnectionState;
  connectionDetail: string;
  openApiSpec: OpenAPISpec | null;
  discoveredPaths: string[];
  apiBaseUrl: string;
  updateApiBaseUrl: (newUrl: string | null) => void;
  recheckBackendConnection: () => Promise<void>;
}

const IdentityContext = createContext<IdentityContextValue | undefined>(undefined);

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [activePersona, setActivePersona] = useState<RequestedPersona>(REQUESTED_PERSONAS.official);
  const [isSwitchingPersona, setIsSwitchingPersona] = useState(false);
  const [authMode, setAuthMode] = useState<AuthVerificationMode>('DEV_ONLY_UNVERIFIED');
  const [authStatusNote, setAuthStatusNote] = useState<string>(
    'Development Mode Persona — Backend authentication endpoint not yet verified.'
  );
  const [connectionState, setConnectionState] = useState<BackendConnectionState>('CHECKING');
  const [connectionDetail, setConnectionDetail] = useState<string>('Probing FastAPI /openapi.json...');
  const [openApiSpec, setOpenApiSpec] = useState<OpenAPISpec | null>(null);
  const [discoveredPaths, setDiscoveredPaths] = useState<string[]>([]);
  const [apiBaseUrl, setApiBaseUrlState] = useState<string>(getApiBaseUrl());

  const recheckBackendConnection = useCallback(async () => {
    setConnectionState('CHECKING');
    setConnectionDetail(`Probing ${getApiBaseUrl()}/openapi.json...`);
    try {
      const spec = await fetchOpenApiSchema();
      setOpenApiSpec(spec);
      const paths = spec.paths ? Object.keys(spec.paths) : [];
      setDiscoveredPaths(paths);
      setConnectionState('ONLINE');
      setConnectionDetail(
        `Connected to ${spec.info?.title || 'FastAPI'} (${paths.length} paths discovered)`
      );

      const hasAuthEndpoint = paths.some(
        (p) =>
          p.includes('/auth/login') ||
          p.includes('/auth/switch') ||
          p.includes('/auth/token')
      );
      if (hasAuthEndpoint) {
        const switchPath =
          paths.find((p) => p.endsWith('/auth/switch') || p.endsWith('/auth/login')) ||
          '/api/auth/switch';
        try {
          const res = await apiRequest<Record<string, unknown>>(switchPath, {
            method: 'POST',
            body: {
              email: REQUESTED_PERSONAS.official.email,
              role: REQUESTED_PERSONAS.official.role,
              institution_id: REQUESTED_PERSONAS.official.institutionId,
            },
          });
          const token =
            typeof res?.access_token === 'string'
              ? res.access_token
              : typeof res?.token === 'string'
              ? res.token
              : null;
          if (token) {
            setRuntimeAuthToken(token);
            setAuthMode('BACKEND_VERIFIED');
            setAuthStatusNote(`Authenticated via backend ${switchPath} as ${REQUESTED_PERSONAS.official.email}`);
          }
        } catch {
          // Dev mode fallback active in backend
        }
      } else {
        setAuthMode('DEV_ONLY_UNVERIFIED');
        setAuthStatusNote(
          'OpenAPI schema verified: No /api/auth/* login endpoint exposed by backend. Operating in explicit Dev Persona mode.'
        );
      }
    } catch (err) {
      setOpenApiSpec(null);
      setDiscoveredPaths([]);
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('401') || message.includes('Unauthorized')) {
        setConnectionState('UNAUTHORIZED');
        setConnectionDetail(
          `HTTP 401 from ${getApiBaseUrl()}/openapi.json — Port 8000 requires authorization or is bound by another service.`
        );
      } else {
        setConnectionState('OFFLINE');
        setConnectionDetail(message);
      }
    }
  }, []);

  useEffect(() => {
    void recheckBackendConnection();
  }, [recheckBackendConnection]);

  const switchPersona = useCallback(
    async (personaId: 'official' | 'applicant') => {
      const target = REQUESTED_PERSONAS[personaId];
      setIsSwitchingPersona(true);
      try {
        const switchPath =
          discoveredPaths.find((p) => p.endsWith('/auth/switch') || p.endsWith('/auth/login')) ||
          '/api/auth/switch';
        if (switchPath) {
          const res = await apiRequest<Record<string, unknown>>(switchPath, {
            method: 'POST',
            body: {
              email: target.email,
              role: target.role,
              institution_id: target.institutionId,
            },
          });
          const token =
            typeof res?.access_token === 'string'
              ? res.access_token
              : typeof res?.token === 'string'
              ? res.token
              : null;
          setRuntimeAuthToken(token);
          setAuthMode('BACKEND_VERIFIED');
          setAuthStatusNote(`Authenticated via backend ${switchPath} as ${target.email}`);
        } else {
          setRuntimeAuthToken(null);
          setAuthMode('DEV_ONLY_UNVERIFIED');
          setAuthStatusNote(
            `Switched UI role to ${target.role} (${target.email}). Backend has no auth-switch endpoint; backend remains authority for protected endpoints.`
          );
        }
        setActivePersona(target);
      } catch (err) {
        // Still allow switching UI view in dev mode while reporting the backend auth failure truthfully
        setRuntimeAuthToken(null);
        setAuthMode('DEV_ONLY_UNVERIFIED');
        const msg = err instanceof Error ? err.message : String(err);
        setAuthStatusNote(
          `Backend auth switch failed (${msg}). Active in client-side Dev Persona mode (${target.email}).`
        );
        setActivePersona(target);
      } finally {
        setIsSwitchingPersona(false);
      }
    },
    [discoveredPaths]
  );

  const updateApiBaseUrl = useCallback(
    (newUrl: string | null) => {
      setApiBaseUrlOverride(newUrl);
      setApiBaseUrlState(getApiBaseUrl());
      void recheckBackendConnection();
    },
    [recheckBackendConnection]
  );

  return (
    <IdentityContext.Provider
      value={{
        activePersona,
        switchPersona,
        isSwitchingPersona,
        authMode,
        authStatusNote,
        connectionState,
        connectionDetail,
        openApiSpec,
        discoveredPaths,
        apiBaseUrl,
        updateApiBaseUrl,
        recheckBackendConnection,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity(): IdentityContextValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error('useIdentity must be used within an IdentityProvider');
  }
  return ctx;
}

export function RequireRole({
  allowedRoles,
  children,
}: {
  allowedRoles: PersonaRole[];
  children: React.ReactNode;
}) {
  const { activePersona, switchPersona } = useIdentity();

  if (!allowedRoles.includes(activePersona.role)) {
    return (
      <section
        role="alert"
        aria-live="assertive"
        className="my-8 border border-[#CBD5E1] bg-white p-6"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-[#B91C1C] font-mono text-sm font-semibold">[403 ROLE BOUNDARY]</div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-[#0F1E36]">
              Insufficient Role Permissions for Requested Workflow
            </h2>
            <p className="text-sm text-[#334155] max-w-2xl">
              The active persona (<strong>{activePersona.label}</strong> —{' '}
              <code className="font-mono">{activePersona.email}</code>, Role:{' '}
              <code className="font-mono">{activePersona.role}</code>) is not permitted to access
              this statutory view. Required role:{' '}
              <code className="font-mono">{allowedRoles.join(' or ')}</code>.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              {allowedRoles.includes(PersonaRole.OFFICIAL) && (
                <button
                  type="button"
                  onClick={() => void switchPersona('official')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Switch to AICTE Scrutiny Officer (official@aicte-india.org)
                </button>
              )}
              {allowedRoles.includes(PersonaRole.APPLICANT) && (
                <button
                  type="button"
                  onClick={() => void switchPersona('applicant')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1B365D] hover:bg-[#0F1E36] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Switch to Institution Applicant (applicant@apexedu.ac.in)
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
