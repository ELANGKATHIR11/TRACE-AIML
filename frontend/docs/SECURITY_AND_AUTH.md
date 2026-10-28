# AICTE TRACE — Security, Authentication & Access Control

## 1. Authentication Architecture & Limitations

### Requested Test Personas
1. **AICTE Scrutiny Officer**
   - Email: `official@aicte-india.org`
   - Role: `REVIEWER` / `OFFICIAL`
   - Permitted UI Workflows: Executive Scrutiny Dashboard (`/`), Application Registry (`/applications`), Dual-Pane Scrutiny Cockpit (`/applications/:id`), Officer Adjudication, and Cryptographic Audit Trail (`/audit`).

2. **Technical Institution Applicant**
   - Email: `applicant@apexedu.ac.in`
   - Role: `APPLICANT`
   - Institution ID: `1`
   - Permitted UI Workflows: Application Intake (`/applications/new`), Applicant Permitted Applications (`/applicant/applications`), and Closed-Loop Deficiency Rectification (`/applicant/applications/:id`).

### Honest Identity Resolution
- The frontend **never** fabricates JWTs, forges cryptographic role claims, or claims secure authentication when the backend does not enforce it.
- When a user selects a persona in the institutional masthead:
  1. The identity manager inspects discovered OpenAPI paths (`/openapi.json`) for a real authentication or persona-switching endpoint (`/api/auth/login`, `/api/auth/switch`, or `/api/auth/me`).
  2. If the backend exposes an authentication endpoint and returns a bearer token or session cookie, the API client attaches `Authorization: Bearer <token>` (or `credentials: 'include'`) on subsequent requests.
  3. If the backend does not expose an authentication endpoint, the UI explicitly labels the session as **`Dev Mode UI Persona (Unauthenticated Backend)`**.
- **UI Access Boundaries:** Route guards (`RequireRole`) prevent an `APPLICANT` persona from accessing Officer Adjudication controls or the Executive Scrutiny Cockpit, and prevent an `OFFICIAL` persona from submitting applicant rectifications by accident. However, the UI explicitly discloses that frontend route guards are presentation boundaries and that the FastAPI server is the sole authority for access control.

---

## 2. Data Protection & Transport Security

- **Zero Secret Leakage:** No API keys, private tokens, or credentials are embedded in client code. Only `VITE_API_BASE_URL` is read from environment configuration.
- **Safe Multipart Uploads:** `FormData` uploads (`POST /api/documents/upload`, `POST /api/documents/{id}/rectify`) never hardcode `Content-Type: multipart/form-data`, allowing the browser to generate a cryptographic multipart boundary.
- **Object URL Lifecycle:** Binary document previews (`Blob` responses from `GET /api/documents/{id}/preview`) are converted via `URL.createObjectURL` inside a managed `useEffect` hook and strictly revoked via `URL.revokeObjectURL` on component unmount or document/page change.
- **XSS Prevention:** Server-returned text, OCR snippets, and officer notes are rendered through React's escaped text nodes; `dangerouslySetInnerHTML` is never used.
- **Non-Idempotent Mutation Safety:** Consequential mutations (`POST /api/applications/{id}/decision`, `POST /api/applications`, `POST /api/documents/upload`, `POST /api/applications/{id}/submit-rectification`) disable submit controls while in flight and have automatic retries (`retry: false`) disabled in TanStack Query.
- **Zero LocalStorage Dossier Persistence:** Sensitive application records, documents, and audit logs are never cached in `localStorage` or `sessionStorage`.
