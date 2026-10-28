# AICTE TRACE — Security, Authentication & Access Control

## 1. Authentication

- Sign-in is email and password at `/login` (`POST /api/auth/login`). A failed sign-in always shows the same message ("Incorrect email or password"). There are no built-in demo accounts; an administrator creates accounts (`/admin/users`, or `python -m app.cli create-admin` for the first one).
- The backend returns a short-lived access token (15 minutes) in the response body. The frontend keeps it **in memory only** and sends it as `Authorization: Bearer`.
- The refresh token is an `HttpOnly` cookie (`trace_refresh`, `Path=/api/auth`). On page load and on a `401` the frontend calls `POST /api/auth/refresh` once (shared across concurrent requests) and retries the original request once. If refresh fails, the session is cleared and the user is sent to `/login`. Sign-out and session loss in one tab propagate to other tabs.
- Accounts with a temporary password (`must_change_password`) are redirected to `/change-password` before anything else.
- Roles are `applicant`, `reviewer` and `admin`. Route guards (`RequireAuth`, `RequireRole`) and role-specific navigation are a presentation boundary only; the backend enforces every permission and is the sole authority.

## 2. Role boundaries

| Role | Can do |
|---|---|
| applicant | Create, upload to, submit and rectify applications of their own institution |
| reviewer | Read all applications, run validation and AI review, record decisions, read the audit trail |
| admin | Same read and review access as reviewer, no decisions; manages users |

See `API_CAPABILITY_MATRIX.md` for the per-endpoint table.

## 3. Data protection and transport

- The browser stores no tokens or records in `localStorage` or `sessionStorage`. The only configuration read from the environment is the build-time `VITE_API_BASE_URL`.
- Uploads use `FormData` without a hand-set `Content-Type`, so the browser supplies the multipart boundary.
- Document previews are blob responses turned into object URLs and revoked on unmount or when the document or page changes.
- Server text (OCR snippets, notes) is rendered as escaped React text; `dangerouslySetInnerHTML` is not used.
- Consequential mutations (application create, upload, submit, decision, rectification) disable their controls while in flight and are never auto-retried.
- Deployment: serve the SPA and `/api` from one origin over HTTPS; see `README.md` section 4 for cookie path, forwarded-IP and cross-origin settings.
