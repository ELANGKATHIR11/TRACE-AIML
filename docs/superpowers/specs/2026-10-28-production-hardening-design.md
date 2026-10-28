# TRACE Production Hardening & Full-Stack Integration — Design

**Date:** 2026-10-28
**Status:** Draft for review
**Scope:** `backend/` (FastAPI), `frontend/` (React/Vite), repository hygiene

---

## 1. Context & Goals

TRACE is moving from a hackathon demo (SIH26261) toward real use by AICTE officials. A read-only
audit of the repository on 2026-10-28 found that:

1. **The frontend cannot build.** 28 imports reference `frontend/src/lib/{api,schemas,permissions,utils}/*`,
   which was never committed: the root `.gitignore` Python rule `lib/` matches `frontend/src/lib/`.
   No copy exists in git history.
2. **The backend has no effective authentication.** `get_current_user` returns the reviewer when no
   token is sent; `POST /api/auth/switch` mints a JWT for any email without a password; `POST
   /api/auth/register` lets callers choose `role=admin`.
3. **Authorization is missing on most object-level routes** (IDOR across institutions), preview/ELA
   routes are unauthenticated, and any authenticated user can record approval decisions.
4. **Secrets are hardcoded** (`SECRET_KEY` default; file-encryption key derived from it), CORS is
   `*` with credentials, `/reports` is publicly served, and the audit "hash chain" is recomputed on
   read and always reports `VALID`.
5. **Frontend/backend contract gaps:** five endpoints the UI calls do not exist, the `intelligence`
   router is never mounted, and `/preview` returns AES ciphertext.

### Decisions made with the product owner

| Decision | Choice |
|---|---|
| Deployment target | **Full production mode.** No demo persona switcher, no dev fallbacks, no default credentials. |
| Account provisioning | **Admin-provisioned only.** No public registration. First admin via CLI bootstrap. |
| Committed demo uploads/reports | **Untrack going forward**; no history rewrite (files are generated demo data). |
| Session model | **Short-lived in-memory access JWT + rotating httpOnly refresh cookie.** |

### Success criteria

- `npm run lint` (tsc) and `npm run build` succeed in `frontend/`.
- Every backend route except `GET /api/health` and `POST /api/auth/login|refresh|logout` returns
  401 without a valid access token.
- The authorization matrix (§4) is enforced and covered by parameterised tests.
- Startup fails when any required secret is missing, short, or a known legacy default.
- Editing any audit row in the database causes `GET /api/audit/verify-chain` to report `BROKEN`.
- A Playwright smoke run completes the full admin → applicant → reviewer lifecycle (§9.3).

### Non-goals

MFA; distributed (multi-process) rate limiting; migrating the default DB to PostgreSQL
(still supported via `DATABASE_URL`); background job queue for AI review; flag-resolution endpoint;
manual penetration testing.

---

## 2. Authentication (backend)

### 2.1 Removed

- `POST /api/auth/switch`, `POST /api/auth/register`, `GET /api/auth/demo-personas`.
- The no-token fallback in `app/services/security.py::get_current_user`.
- Seeding of demo users and `password123` in `app/database.py::init_db_and_seed`. Institution and
  checklist-rule seeding remain.
- `SQLModel.metadata.create_all` at startup (replaced by Alembic, §2.6).

### 2.2 Endpoints

| Endpoint | Access | Behaviour |
|---|---|---|
| `POST /api/auth/login` | public | OAuth2 password form (`username` = email). Returns `{access_token, token_type, expires_in, user}`; sets refresh cookie. |
| `POST /api/auth/refresh` | refresh cookie | Rotates refresh token; returns new access token + user. |
| `POST /api/auth/logout` | refresh cookie | Revokes the token family; clears cookie. Always 204. |
| `GET /api/auth/me` | bearer | Current user (`UserRead`). |
| `POST /api/auth/change-password` | bearer | `{current_password, new_password}`. Bumps `token_version`, revokes all refresh families, clears `must_change_password`. |
| `POST /api/admin/users` | admin | Create user `{email, full_name, role, institution_id?, temporary_password}`. Sets `must_change_password=true`. |
| `GET /api/admin/users` | admin | List users. |
| `PATCH /api/admin/users/{id}` | admin | Update `full_name`, `role`, `institution_id`, `is_active`; `reset_password` sets a new temporary password. Role/active/password changes bump `token_version`. |

Validation: `applicant` **requires** `institution_id` referencing an existing institution;
`reviewer`/`admin` **must not** have one. An admin cannot deactivate or demote themselves.

While `must_change_password` is true, every route except `/auth/me`, `/auth/change-password`,
`/auth/logout` and `/auth/refresh` returns `403 {"detail": "Password change required"}`.

### 2.3 Tokens

**Access token:** JWT HS256 signed with `SECRET_KEY`, lifetime 15 min. Claims: `sub` (user id as
string), `role`, `tv` (token_version), `iat`, `exp`, `jti`, `iss="trace-api"`, `aud="trace-web"`.
Decoding pins `algorithms=["HS256"]`, requires `exp/iat/sub/tv`, and validates `iss`/`aud`.
Per request: user exists, `is_active`, and `tv == user.token_version`.

**Refresh token:** `secrets.token_urlsafe(32)`; stored only as SHA-256 hex in `refresh_tokens`:

| Column | Type |
|---|---|
| `id` | int PK |
| `user_id` | FK users |
| `family_id` | uuid str, indexed |
| `token_hash` | str, unique |
| `issued_at`, `expires_at` | datetime (UTC) |
| `revoked_at` | datetime, nullable |
| `replaced_by_id` | FK refresh_tokens, nullable |

Lifetime 8 h absolute per family (rotation does not extend the family's `expires_at`).
On refresh: token must exist, be unrevoked, unexpired, and its user active. Presenting a token that
is already revoked/replaced **revokes the entire family** and audits `REFRESH_TOKEN_REUSE_DETECTED`.

**Cookie:** name `trace_refresh`, `HttpOnly`, `Secure` = `settings.COOKIE_SECURE`,
`SameSite` = `settings.COOKIE_SAMESITE` (default `Strict`), `Path=/api/auth`, `Max-Age` =
remaining family lifetime.

### 2.4 Hardening

- Passwords: min 12 chars, max 128, bcrypt (existing `hash_password`). Reject passwords equal to the
  email local-part.
- Account lockout: `failed_login_count` ≥ 5 → `locked_until = now + 15 min`; reset on success.
- Per-IP limiter on `/auth/login`: 20 attempts / 5 min, in-process sliding window (documented
  single-process limitation).
- Unknown email performs a dummy bcrypt verify; response is always
  `401 {"detail": "Incorrect email or password"}` (locked accounts return the same message).
- Audited events: `LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGOUT`,
  `PASSWORD_CHANGED`, `REFRESH_TOKEN_REUSE_DETECTED`, `USER_CREATED`, `USER_UPDATED`.
  Passwords and tokens are never written to audit details.

### 2.5 CLI (`python -m app.cli`)

- `generate-keys` — prints a `.env` block with fresh `SECRET_KEY`, `FILE_ENCRYPTION_KEY`,
  `AUDIT_HMAC_KEY`.
- `create-admin --email E --full-name N` — prompts twice for a password (getpass), enforces policy,
  fails if the email exists.

### 2.6 Data model changes (Alembic)

Alembic is initialised in `backend/alembic/` with:
1. `0001_baseline` — current schema.
2. `0002_auth_hardening` — `users.token_version` (int, default 0), `users.failed_login_count`
   (int, default 0), `users.locked_until` (nullable), `users.must_change_password` (bool, default
   false); `refresh_tokens` table.
3. `0003_audit_chain` — `audit_logs.prev_hash`, `audit_logs.record_hash` (+ backfill, §5.4).
4. `0004_workflow` — `documents.superseded_by_id` (nullable FK documents), `officer_decisions`
   table (§6.3).

App startup runs no DDL. The README documents `alembic upgrade head`. The local
`aicte_platform.db` (demo data only) is recreated.

---

## 3. Configuration & secrets

`app/config.py` `Settings`:

| Setting | Default | Rule |
|---|---|---|
| `ENVIRONMENT` | `production` | `production` \| `development` |
| `DATABASE_URL` | `sqlite:///./aicte_platform.db` | — |
| `SECRET_KEY` | *(required)* | ≥ 32 chars; not a known legacy default |
| `FILE_ENCRYPTION_KEY` | *(required)* | urlsafe-base64 decoding to exactly 32 bytes |
| `AUDIT_HMAC_KEY` | *(required)* | ≥ 32 chars; distinct from `SECRET_KEY` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 15 | 5–60 |
| `REFRESH_TOKEN_EXPIRE_HOURS` | 8 | 1–24 |
| `CORS_ORIGINS` | empty | comma-separated exact origins; `*` rejected |
| `COOKIE_SECURE` | `true` | must be `true` when `ENVIRONMENT=production` |
| `COOKIE_SAMESITE` | `strict` | `strict` \| `lax` \| `none`; `none` requires `COOKIE_SECURE=true` |
| `ENABLE_API_DOCS` | `false` | toggles `/docs`, `/redoc`, `/openapi.json` |
| `MAX_UPLOAD_MB` | 25 | — |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `UPLOAD_DIR` | unchanged | — |

Legacy defaults rejected: `super-secret-aicte-sih26261-dev-key-change-in-production`,
`super-secret-aicte-sih26261-local-offline-key`. Validation errors abort startup with a message
naming the setting (never its value). `backend/.env.example` contains placeholders and a pointer to
`python -m app.cli generate-keys`.

---

## 4. Authorization

### 4.1 Central guards — `app/services/access.py`

- `load_application(session, application_id, user, *, write=False) -> Application`
- `load_document(session, document_id, user, *, write=False) -> Document`
- `require_roles(...)` stays in `security.py`.

Rules: reviewers/admins may read any application; applicants may read only applications whose
`institution_id == user.institution_id`. A cross-institution or nonexistent ID yields **404**
`"Application not found"` / `"Document not found"` (no existence oracle). `write=True` for
applicants additionally requires an editable status (§6.1), else **409**.

`GET /api/applications` for applicants filters by `user.institution_id` unconditionally (fixes the
current behaviour of returning every application to an applicant with no institution).

### 4.2 Matrix

A = applicant (own institution), R = reviewer, Ad = admin.

| Route | A | R | Ad |
|---|---|---|---|
| `GET /api/health` | public | public | public |
| `GET /api/institutions` | own only | ✓ | ✓ |
| `POST /api/institutions` | ✗ | ✗ | ✓ |
| `GET /api/rules` | ✓ | ✓ | ✓ |
| `POST /api/rules`, `PATCH /api/rules/{id}` | ✗ | ✗ | ✓ |
| `POST /api/applications` | ✓ (institution forced from user) | ✗ | ✗ |
| `GET /api/applications`, `/{id}`, `/{id}/flags`, `/{id}/verifications` | own | ✓ | ✓ |
| `POST /api/applications/{id}/submit` | own | ✗ | ✗ |
| `POST /api/applications/{id}/submit-rectification` | own | ✗ | ✗ |
| `POST /api/applications/{id}/validate` | ✗ | ✓ | ✓ |
| `POST /api/applications/{id}/agent-review` | ✗ | ✓ | ✓ |
| `POST /api/applications/{id}/decision` | ✗ | ✓ | ✗ |
| `POST /api/documents/upload` | own, editable | ✗ | ✗ |
| `POST /api/documents/{id}/rectify` | own, `RECTIFICATION_REQUESTED` | ✗ | ✗ |
| `GET /api/documents/application/{id}`, `/{id}`, `/{id}/preview` | own | ✓ | ✓ |
| `GET /api/documents/{id}/ela`, `POST /api/documents/{id}/verify` | ✗ | ✓ | ✓ |
| `GET /api/dashboard/*`, `GET /api/models`, `GET /api/models/metrics` | ✗ | ✓ | ✓ |
| `POST /api/models/predict-*`, `/api/rag/search`, `/api/media/inspect`, `/api/intake/authority-check` | ✗ | ✓ | ✓ |
| `GET /api/audit/logs`, `/api/audit/verify-chain` | ✗ | ✓ | ✓ |
| `/api/admin/users*` | ✗ | ✗ | ✓ |

The duplicate `GET /models` (no `/api` prefix) route in `main.py` is removed.
`rag/search` with `application_id` checks it exists (reviewer/admin only, so no ownership check).

### 4.3 Typed request bodies

All `payload: dict` parameters are replaced by Pydantic models with `extra="forbid"`:
`OfficerDecisionRequest`, `RectificationSubmitRequest`, `AdminUserCreate`, `AdminUserUpdate`,
`ChangePasswordRequest`, and a typed `DeclaredData` inside `ApplicationCreate` (§6.2).
`ApplicationCreate.institution_id` is removed; it is taken from the authenticated applicant.

---

## 5. Cryptography, transport & audit

### 5.1 Document encryption at rest

- Key: `FILE_ENCRYPTION_KEY` (decoded 32 bytes), no longer derived from `SECRET_KEY`.
- Stored format: `b"\x01"` (key version) ‖ 12-byte nonce ‖ AES-256-GCM ciphertext+tag.
  AAD = `f"APP-{application_id}"`.
- `decrypt_file_data` reads the version byte and rejects unknown versions.
- `ocr_service`, `/preview`, `/ela` and `verification_services` decrypt in memory via one helper
  `read_document_plaintext(doc) -> bytes`.
- `/preview` returns `Response(content=plaintext, media_type=doc.mime_type)` with
  `Content-Disposition: inline; filename*=UTF-8''<sanitised>`, `Cache-Control: no-store`,
  `X-Content-Type-Options: nosniff`. The `page`/`mark` JSON fallback is removed.
- `/ela` uses the decrypted bytes (via a temp file only if the forensics service requires a path,
  deleted in `finally`). ELA runs on PNG/JPEG MIME types, not file suffixes.

### 5.2 Uploads

- Read via `UploadFile` in 1 MiB chunks; abort with **413** once `MAX_UPLOAD_MB` is exceeded.
- `/media/inspect` limit 50 MB; `/intake/authority-check` uses `MAX_UPLOAD_MB`.
- Existing magic-byte allow-list (PDF/PNG/JPEG) and filename sanitisation remain; signature
  failures return **422** (currently an unhandled `ValueError` → 500).

### 5.3 Transport & HTTP

- CORS: `allow_origins=settings.CORS_ORIGINS`, `allow_credentials=True`,
  `allow_methods=["GET","POST","PATCH"]`, `allow_headers=["Authorization","Content-Type"]`.
- Security headers middleware on every response: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` (relaxed only for docs
  routes when enabled), `Strict-Transport-Security: max-age=31536000; includeSubDomains` when
  `ENVIRONMENT=production`.
- `FastAPI(docs_url=..., redoc_url=..., openapi_url=...)` set to `None` unless `ENABLE_API_DOCS`.
- Global exception handler for unhandled exceptions → `500 {"detail": "Internal server error",
  "error_id": "<uuid4>"}`, full traceback logged with the `error_id`. No `str(e)` in responses
  (removes leaks in agent-review fallback and ELA).
- Static mount `/reports` removed.

### 5.4 Tamper-evident audit chain

- One function `log_audit_event(...)` in `audit_service.py`; `AuditService.log_action` is deleted
  and its callers migrated.
- On insert, inside a write transaction serialised by `BEGIN IMMEDIATE` (SQLite) or
  `pg_advisory_xact_lock` (PostgreSQL): read the last row's `record_hash` (or 64×`"0"`), set
  `prev_hash`, flush to obtain `id`, compute
  `record_hash = HMAC-SHA256(AUDIT_HMAC_KEY, canonical_json({id, application_id, actor_user_id,
  actor_role, action_type, entity_type, entity_id, summary, details, timestamp_iso, prev_hash}))`,
  commit.
- `canonical_json` = `json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
  default=str)`; timestamps normalised to UTC ISO-8601.
- `GET /api/audit/logs` returns stored `prev_hash`/`record_hash` (no recomputation); supports
  `application_id`, `limit` (1–500, default 100), newest first.
- `GET /api/audit/verify-chain` walks rows by `id`, recomputes each HMAC and linkage, returns
  `{status: "INTACT" | "BROKEN", verified_count, latest_hash, broken_at_id, algorithm:
  "HMAC-SHA256 hash chain", verified_at}`.
- Migration `0003` backfills existing rows in `id` order.

### 5.5 Code-execution surface

- `ml_training_platform` loads a `.pkl` only if its SHA-256 matches
  `models_registry/MODEL_HASHES.json` (generated by the training script); otherwise the predict
  endpoints return `503 {"detail": "Model unavailable"}`.
- All `sys.path.insert(...)` of `f:/TRACE/...` paths are removed from `app/`. CrewAI/LangGraph
  are imported as optional installed packages; if unavailable, `agent-review` returns
  `503 {"detail": "AI review unavailable"}`. Standalone scripts that reference `f:/` move to
  `backend/scripts/` and are excluded from the app package.

### 5.6 Repository hygiene

- Root `.gitignore`: replace Python-template rules `lib/`, `lib64/`, `build/`, `dist/`, etc. with
  backend-anchored equivalents (`backend/**/lib/`, …) so they cannot match `frontend/src/lib`.
  Add `backend/reports/` generated outputs, `reports/`, `*.db`, `.env`.
- `git rm --cached -r backend/uploads reports backend/reports crewai_autonomous_agent_pipeline.py
  backend/test_annotated.png` (root `crewai_autonomous_agent_pipeline.py` is a duplicate of the
  backend copy). Files remain on disk. No history rewrite.
- `backend/datasets/` and `backend/models_registry/*.pkl` stay tracked (test fixtures / pinned
  models).
- Non-pytest scripts (`test_external_image_datasets.py`, `test_litellm_ollama.py`,
  `test_offline_verification.py`, `test_production_security_suite.py`, plus `benchmark_*`,
  `generate_*`, `harvest_*`, `scrape_*`, `download_*`, `evaluate_*`) move to `backend/scripts/`.
- `backend/pyproject.toml` becomes the single dependency manifest: core `dependencies` are the
  packages imported by `app/` at module load (adds `cryptography`, `opencv-python`, `numpy`,
  `pillow`, `scikit-learn`, `bcrypt`, `httpx`, etc.); heavy AI packages imported lazily (`crewai`,
  `langgraph`, `chromadb`, `torch`, `transformers`) go in `[project.optional-dependencies].ai`;
  `pytest` goes in a `dev` group. `[tool.pyright].extraPaths` with `f:/` is removed. Root
  `requirements.txt` (which disagrees on Python version) is deleted.

---

## 6. API contract completion

### 6.1 Application lifecycle

```
DRAFT --submit(A)--> SUBMITTED --validate(R/Ad)--> READY_FOR_REVIEW | DEFICIENCY_FLAGGED
READY_FOR_REVIEW | DEFICIENCY_FLAGGED --decision(R)--> APPROVED_BY_REVIEWER | REJECTED_BY_REVIEWER | RECTIFICATION_REQUESTED
RECTIFICATION_REQUESTED --rectify(A)*, submit-rectification(A)--> SUBMITTED
```

- Applicant-editable statuses: `DRAFT` (upload), `RECTIFICATION_REQUESTED` (rectify).
- `validate` allowed from `SUBMITTED`, `READY_FOR_REVIEW`, `DEFICIENCY_FLAGGED`.
- `agent-review` allowed from `SUBMITTED`, `READY_FOR_REVIEW`, `DEFICIENCY_FLAGGED`; it does not
  change status (the current code silently sets `READY_FOR_REVIEW` on failure).
- Disallowed transitions → **409** with `{"detail": "...", "current_status": "..."}`.
- `submit` requires every active mandatory `ChecklistRule` for the category to have a current
  document; otherwise **409** with `missing_document_types`.

### 6.2 Changed endpoints

- `POST /api/applications` body: `{category, academic_year, declared_data: {land_area_acres
  (0–1000), built_up_area_sqm (0–1_000_000), total_intake (0–10_000), faculty_count (0–5_000)}}`.
  Application number generation uses `max(id)+1` inside the transaction instead of
  `len(all())`.
- `POST /api/applications/{id}/decision` body `OfficerDecisionRequest {decision: "APPROVE" |
  "REQUEST_RECTIFICATION" | "REJECT", notes: str (10–4000)}`. Response `{id, application_id,
  decision, status, notes, officer_id, decided_at, audit_hash}` where `audit_hash` is the audit
  row's `record_hash`.
- `ApplicationDetailResponse` adds `documents` (current only), `decisions`, `latest_decision`,
  `institution_name`.
- Document listings and checklist matching exclude rows with `superseded_by_id` set.

### 6.3 New endpoints & tables

- `GET /api/health` → `{"status": "ok", "database": "ok" | "error"}` (runs `SELECT 1`).
- `GET /api/documents/{id}` → `DocumentRead` (without `file_path`; `file_path` is removed from
  `DocumentRead` entirely since it leaks server paths).
- `POST /api/documents/{id}/rectify` (multipart `file`) → new `Document` of the same type and
  application; old row gets `superseded_by_id`; audit `DOCUMENT_RECTIFIED`.
- `POST /api/applications/{id}/submit-rectification` body `{notes: str (≤4000), amended:
  DeclaredData partial}` → merges amended fields into `declared_data`, status `SUBMITTED`, audit
  `RECTIFICATION_SUBMITTED` with `updated_fields`. Response `{application_id, status,
  submitted_at, updated_fields}`.
- `POST /api/applications/{id}/submit` → status `SUBMITTED`, audit `APPLICATION_SUBMITTED`.
- `GET /api/applications/{id}/verifications` → list of `{document_id, document_type,
  authority_name, status, checked_at, reference_id, details}` built from current documents'
  `issuing_authority`, `verification_status`, `document_urn_or_id`, `verification_details`.
- `officer_decisions` table: `id, application_id (FK, idx), officer_user_id (FK), decision,
  notes, audit_log_id (FK), created_at`.

### 6.4 Wiring & bug fixes

- Mount `intelligence.router` in `main.py`. Remove the CrewAI-path `agent-review` from
  `applications.py`; the remaining one is `intelligence.py`'s `multi_agent_workflow` version.
- `verification_services.py:32` references nonexistent `VerificationStatus.REJECTED`; replace
  with `MANUAL_REVIEW_REQUIRED` and add a regression test.

### 6.5 Dashboard honesty

- Gateway breakdown is computed from current documents grouped by `document_type` →
  `{gateway, verified, mismatch, expired, pending, unavailable, total}` using real
  `verification_status` counts. Fabricated constants (`mismatch: 1`, `mismatch: 2`,
  `max(1, verified-1)`, `verified: total_apps`) are removed.
- Model registry reads `models_registry/training_evaluation_metrics.json`; any metric not present
  is `null`. Hardcoded accuracy/precision/recall/F1 values are removed. Ollama status remains live.
- `/api/models` and `/api/dashboard/models` return the same function's output.

---

## 7. Frontend

### 7.1 Rebuilt `src/lib/`

| Module | Exports |
|---|---|
| `api/transport.ts` | `apiRequest<T>(path, {method, body, formData, signal})`, `ApiClientError {status, detail, fieldErrors, errorId}`, `getApiBaseUrl()`, `setAccessToken(token \| null)`, `onAuthFailure(cb)` |
| `api/endpoints.ts` | `fetchDashboardMetrics`, `fetchModelRegistry`, `fetchApplications`, `fetchApplicationDetail`, `fetchApplicationFlags`, `fetchAuthorityVerifications`, `createApplication`, `submitApplication`, `uploadApplicationDocument`, `fetchDocumentMetadata`, `fetchDocumentPreview`, `fetchDocumentElaAnalysis`, `rectifyDocument`, `submitApplicationRectification`, `triggerAgentReview`, `submitOfficerDecision`, `fetchAuditLogs`, `verifyAuditChain`, `login`, `refreshSession`, `logout`, `changePassword`, `fetchMe`, `listUsers`, `createUser`, `updateUser`, `fetchInstitutions` |
| `api/cacheSync.ts` | `initCrossTabSync(queryClient)`, `invalidateAllAppQueries(queryClient)`, `broadcastLogout()` |
| `schemas/apiSchemas.ts` | `ApplicationIntakeFormSchema/Values`, `OfficerDecisionFormSchema/Values`, `ApplicantRectificationFormSchema/Values`, `LoginFormSchema/Values`, `ChangePasswordFormSchema/Values`, `AdminUserFormSchema/Values` |
| `permissions/roles.ts` | `Role` (`'applicant' \| 'reviewer' \| 'admin'`), `canSubmitRectification`, `canDecide`, `canValidate`, `isStaff` |
| `utils/formatters.ts` | `formatApiTimestamp`, `formatApiValue`, `formatConfidencePercentage`, `validateUploadFile` |

Transport behaviour:
- Base URL from `import.meta.env.VITE_API_BASE_URL` at build time; default `/fastapi-proxy` in dev.
  No runtime override.
- Every request sends `credentials: 'include'` and `Authorization: Bearer <in-memory token>` when
  set. Never touches `localStorage`/`sessionStorage`.
- On 401 (except auth endpoints): a single shared in-flight `POST /auth/refresh`; on success retry
  the original request once; on failure clear token, `broadcastLogout()`, invoke `onAuthFailure`.
- FastAPI 422 `detail[]` → `fieldErrors: Record<string, string>` keyed by last `loc` segment.
- `fetchDocumentPreview` returns a `Blob`; callers manage object URLs (existing pattern).

`endpoints.ts` normalisers map backend fields to the names components already read (e.g. flag
`reason` → `description`, `flag_category` → `finding_type`, `page_number` → `page`), keeping
component changes minimal. `types/api.ts` is updated: `PersonaRole`/`RequestedPersona`/
`OpenAPISpec` removed; `OfficerDecisionType` = `APPROVE | REQUEST_RECTIFICATION | REJECT`;
`ApplicationCreateRequest` matches §6.2; `User`, `AdminUser*` types added.

`BroadcastChannel('trace-sync')` carries only `{type: 'invalidate'}` and `{type: 'logout'}`.

### 7.2 Identity

`features/identity/IdentityContext.tsx` → `AuthProvider` / `useAuth()` exposing
`{user, status: 'loading' | 'authenticated' | 'anonymous', login(email, password), logout(),
refreshUser()}`. On mount it calls `refreshSession()` to restore the session from the cookie.
`RequireAuth` redirects anonymous users to `/login?next=<path>` (only same-app relative paths are
honoured) and users with `must_change_password` to `/change-password`. `RequireRole` takes `Role[]`
and renders the existing 403 boundary without persona-switch buttons. All 16 persona call sites
switch to `user.role` / `user.institution_id`.

### 7.3 Removed

Persona switcher in `AppShell`; `REQUESTED_PERSONAS`; OpenAPI probing and connection badge driven
by it; `OpenApiInspectorModal.tsx`; `setApiBaseUrlOverride` / `updateApiBaseUrl`; `docs/` notes
describing dev personas are rewritten (`SECURITY_AND_AUTH.md`) or deleted (`BACKEND_GAPS.md`,
`API_CAPABILITY_MATRIX.md` replaced by a short accurate endpoint table).

### 7.4 New pages & flow changes

- `/login` — email/password form, generic error text, disables submit while pending.
- `/change-password` — current + new + confirm; on success re-fetches user and continues.
- `/admin/users` (admin) — table, create form (role, institution picker for applicants, temporary
  password), deactivate/reactivate, reset password, change role/institution.
- Intake page: after document uploads, a **Submit application** action calling `submitApplication`;
  shows backend `missing_document_types` on 409.
- Scrutiny cockpit decision form uses the new decision enum and notes rules.
- Navigation shows items per role: applicant → My applications, New application; reviewer →
  Dashboard, Registry, Audit; admin → Dashboard, Registry, Audit, Users.

### 7.5 Hosting & housekeeping

- Default topology is same-origin: Vite dev proxy `/fastapi-proxy` → `localhost:8000`; production
  behind a reverse proxy serving the SPA and `/api`. Cross-origin is possible with `CORS_ORIGINS`
  and documented as requiring `SameSite=None; Secure` (configurable `COOKIE_SAMESITE`, default
  `strict`).
- `package.json`: rename to `trace-frontend`; remove each of `express`, `@types/express`, `dotenv`,
  `tsx`, `esbuild` that is not referenced by any file under `src/`, `vite.config.ts` or
  `package.json` scripts; pin `typescript` to a published version verified
  at implementation time; dev server `--host=127.0.0.1`; add `test` script (Vitest).
- `frontend/.env.example` documents `VITE_API_BASE_URL` (default `/fastapi-proxy`).

---

## 8. Error handling

| Situation | Backend | Frontend |
|---|---|---|
| No/invalid/expired access token | 401 | one refresh attempt → retry or redirect to `/login` |
| Password change pending | 403 `Password change required` | redirect to `/change-password` |
| Wrong role | 403 with role message | existing 403 boundary |
| Other institution / missing record | 404 | existing not-found state |
| Invalid transition | 409 + `current_status` | inline message on the action |
| Validation | 422 FastAPI format | field errors on forms, else `ApiErrorState` |
| Upload too large | 413 | inline file error (pre-checked client-side too) |
| AI/model unavailable | 503 | `ApiUnavailableState` |
| Unhandled | 500 + `error_id` | `ApiErrorState` showing `error_id` |

---

## 9. Testing

### 9.1 Backend (pytest, TDD)

`backend/tests/` with `conftest.py`: per-test SQLite file DB, Alembic `upgrade head`, test keys via
env, fixtures `admin`, `reviewer`, `applicant_a` (institution A), `applicant_b` (institution B),
`auth_headers(user)`, and an application+document factory. `test_master_verification_suite.py` is
ported into `tests/` and updated to authenticate.

Required test groups:
1. **Config:** missing/short/legacy keys abort; `COOKIE_SECURE=false` with production aborts.
2. **Auth:** login ok/fail; same error for unknown email and wrong password; lockout at 5; per-IP
   limit; refresh rotation; reuse revokes family; logout revokes; `token_version` bump invalidates;
   expired / tampered / wrong-`aud` / `alg:none` tokens → 401; `must_change_password` gate.
3. **Removed routes:** `/auth/switch`, `/auth/register`, `/auth/demo-personas`, `/reports/*` → 404;
   no token → 401 on every non-public route (enumerated from `app.routes`).
4. **Authorization matrix:** parameterised over §4.2 rows × roles; cross-institution → 404.
5. **Lifecycle:** each valid transition; each invalid transition → 409; unknown decision → 422;
   submit with missing mandatory docs → 409.
6. **Crypto & uploads:** stored bytes ≠ plaintext; preview returns plaintext with headers; wrong AAD
   fails; > limit → 413; bad signature → 422; traversal filename sanitised.
7. **Audit:** chain `INTACT` after mixed actions; direct DB edit of one row's `summary` →
   `BROKEN` at that id; decision `audit_hash` equals stored `record_hash`.
8. **HTTP:** CORS allowed vs disallowed origin; security headers present; docs disabled by default;
   500 handler hides exception text.
9. **Regression:** `VerificationStatus.REJECTED` path; applicant without institution sees no
   applications.

### 9.2 Frontend (Vitest + Testing Library)

`transport.ts` (shared refresh, retry once, logout on failure, 422 mapping, no storage access),
endpoint normalisers, `RequireAuth`/`RequireRole`, login form. Gates: `npm run lint`,
`npm run build`, `npm test`.

### 9.3 End-to-end (Playwright via MCP, manual run)

Both servers running with a fresh DB: `create-admin` → admin logs in, creates applicant (inst A) and
reviewer → applicant forced password change, creates application, uploads mandatory docs, submits →
reviewer validates, requests rectification → applicant rectifies and resubmits → reviewer
validates, approves → audit page shows chain `INTACT`; applicant cannot open reviewer routes and
gets 404 for another institution's application ID.

---

## 10. Delivery phases

Each phase ends with its tests passing and one commit on branch `production-hardening`.

1. **Setup & hygiene** — branch, `.gitignore`, untrack, move scripts, consolidate dependencies,
   install, Alembic baseline, pytest scaffold.
2. **Config & platform** — settings validation, CLI, CORS, headers, exception handler, docs toggle,
   remove `/reports` mount.
3. **Authentication** — §2.
4. **Authorization** — §4.
5. **Crypto, audit, execution surface** — §5.1, §5.2, §5.4, §5.5.
6. **API contract** — §6.
7. **Frontend** — §7.
8. **Verification** — §9.3 Playwright run, final security review of the full diff.
