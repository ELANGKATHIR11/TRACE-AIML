# TRACE Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn TRACE into a production-safe full-stack app: real authentication, enforced authorization, hardened secrets/transport/audit, a complete API contract, and a frontend that builds and talks to it.

**Architecture:** FastAPI + SQLModel backend gains Alembic migrations, a token service (access JWT + DB-backed rotating refresh tokens), a central access-guard module, and an HMAC audit chain. The React/Vite frontend's missing `src/lib` layer is rebuilt around an in-memory token transport with cookie-based refresh, and persona switching is replaced by a real `AuthProvider`.

**Tech Stack:** Python 3.14, FastAPI, SQLModel/SQLAlchemy, Alembic, PyJWT, bcrypt, cryptography (AES-GCM), pytest, uv · React 19, TypeScript 7.0.2, Vite 8, TanStack Query 5, Zod 4, react-hook-form, Vitest, Testing Library · Playwright (MCP) for E2E.

**Spec:** `docs/superpowers/specs/2026-10-28-production-hardening-design.md` — section references below (§N) point into it. Read it before starting any task.

## Global Constraints

- Work on branch `production-hardening`; one commit per task; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Backend commands run from `backend/` with `uv run …`; frontend commands from `frontend/` with `npm …`.
- Access token: HS256, 15 min, claims `sub`(user id str), `role`, `tv`, `iat`, `exp`, `jti`, `iss="trace-api"`, `aud="trace-web"`.
- Refresh token: `secrets.token_urlsafe(32)`, stored as SHA-256 hex only, family lifetime 8 h absolute, cookie `trace_refresh`, `HttpOnly`, `Path=/api/auth`, `SameSite`/`Secure` from settings.
- Passwords 12–128 chars, bcrypt; lockout at 5 failures for 15 min; per-IP login limit 20 / 5 min.
- Login failure body is always `{"detail": "Incorrect email or password"}` with 401.
- Cross-institution or missing object → 404 `"Application not found"` / `"Document not found"`; invalid transition → 409 with `current_status`.
- Upload limit `MAX_UPLOAD_MB` = 25 (media/inspect 50 MB); allowed signatures PDF/PNG/JPEG only.
- Never write passwords, tokens, or key material to logs, audit details, or HTTP responses.
- All datetimes stored and compared as UTC; values read back from SQLite are naive and must pass through `as_utc()` (Task 5) before comparison.
- Frontend never uses `localStorage`/`sessionStorage` for tokens or records; API origin only from build-time `VITE_API_BASE_URL` (default `/fastapi-proxy`).
- Decision enum everywhere: `APPROVE | REQUEST_RECTIFICATION | REJECT`. Roles everywhere: `applicant | reviewer | admin`.

## Review Focus

1. **Two tabs refresh at once** — both send the same old cookie; the second looks like token reuse and revokes the family, logging the user out everywhere. Expected: user stays logged in. Pinned in Task 16 (refresh serialised across tabs with `navigator.locks`).
2. **Naive datetimes from SQLite** — `locked_until`/`expires_at` come back without tzinfo; comparing with `datetime.now(timezone.utc)` raises `TypeError` → 500 on login/refresh. Expected: lockout and expiry work after a DB round-trip. Pinned in Tasks 5 and 6.
3. **Concurrent requests writing audit rows** — two writers read the same `prev_hash`, forking the chain so `verify-chain` falsely reports `BROKEN`. Expected: chain stays `INTACT`. Pinned in Task 10.
4. **Applicant re-uploads a document type while in DRAFT** — two current documents of one type; checklist picks an arbitrary one. Expected: the new upload supersedes the old. Pinned in Task 13.
5. **Unicode / quote characters in an uploaded filename** — naive `Content-Disposition` breaks or allows header injection. Expected: RFC 5987 `filename*` header, preview loads. Pinned in Task 9.

---

## File Structure

**Backend — new**
- `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/versions/0001_baseline.py` … `0004_workflow.py`
- `backend/app/cli.py` — `generate-keys`, `create-admin`
- `backend/app/http.py` — security-headers middleware, exception handler, CORS setup
- `backend/app/services/tokens.py` — access JWT + refresh-token lifecycle
- `backend/app/services/rate_limit.py` — in-process sliding-window limiter
- `backend/app/services/access.py` — `load_application`, `load_document`
- `backend/app/services/document_storage.py` — encrypt/decrypt/store/read document bytes, chunked upload read
- `backend/app/services/workflow.py` — application status transitions
- `backend/app/api/admin.py`, `backend/app/api/health.py`
- `backend/tests/conftest.py` and `backend/tests/test_*.py`
- `backend/scripts/` — relocated non-test scripts

**Backend — modified:** `app/config.py`, `app/database.py`, `app/main.py`, `app/models/models.py`, `app/schemas/schemas.py`, `app/services/security.py`, `app/services/audit_service.py`, `app/services/production_security.py`, `app/services/ocr_service.py`, `app/services/verification_services.py`, `app/services/ml_training_platform.py`, `app/services/multi_agent_workflow.py`, `app/services/soup_llm_optimizer.py`, `app/services/multi_source_ingestion.py`, all `app/api/*.py`, `pyproject.toml`, `.env.example`.

**Frontend — new:** `src/lib/api/{transport,endpoints,cacheSync}.ts`, `src/lib/schemas/apiSchemas.ts`, `src/lib/permissions/roles.ts`, `src/lib/utils/formatters.ts`, `src/features/auth/{AuthContext,LoginPage,ChangePasswordPage}.tsx`, `src/features/admin/AdminUsersPage.tsx`, co-located `*.test.ts(x)`, `vitest.config.ts`, `src/test/setup.ts`.

**Frontend — modified/removed:** `src/App.tsx`, `src/app/AppShell.tsx`, `src/types/api.ts`, the 7 feature files using identity, `ApplicationIntakePage.tsx`, `ScrutinyCockpitPage.tsx`; delete `src/features/identity/IdentityContext.tsx`, `src/components/OpenApiInspectorModal.tsx`; rewrite `frontend/docs/*`.

---

## Phase 1 — Setup & hygiene

### Task 1: Repository hygiene, dependency manifest, pytest scaffold

**Files:**
- Modify: `.gitignore`, `backend/pyproject.toml`, `frontend/.gitignore` (none expected)
- Delete: `requirements.txt`
- Move: `backend/{test_external_image_datasets,test_litellm_ollama,test_offline_verification,test_production_security_suite,benchmark_60_docs,generate_ai_report,generate_all_flaggings_report,generate_visual_ai_report,harvest_official_datasets,scrape_and_test_images,scrape_nic_official_datasets,scrape_official_aicte_pdfs,download_official_aicte_dataset,evaluate_official_scraped_dataset,crewai_autonomous_agent_pipeline}.py` → `backend/scripts/`
- Create: `backend/tests/__init__.py`, `backend/tests/test_repo_hygiene.py`

- [ ] **Step 1: Write the failing test** `tests/test_repo_hygiene.py`

```python
import subprocess, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]

def _ignored(path: str) -> bool:
    return subprocess.run(["git", "check-ignore", "-q", path], cwd=ROOT).returncode == 0

def test_frontend_lib_is_not_ignored():
    assert not _ignored("frontend/src/lib/api/transport.ts")

def test_generated_outputs_are_ignored():
    for p in ["backend/uploads/app_1/x.pdf", "reports/x.md", "backend/reports/x.md", "backend/aicte_platform.db", "backend/.env"]:
        assert _ignored(p), p

def test_no_uploads_tracked():
    out = subprocess.run(["git", "ls-files", "backend/uploads", "reports", "backend/reports"], cwd=ROOT, capture_output=True, text=True).stdout
    assert out.strip() == ""
```

- [ ] **Step 2: Configure pytest and run to verify it fails**

Add to `pyproject.toml`: `[tool.pytest.ini_options] testpaths = ["tests"]`. Restructure dependencies per spec §5.6 (core / `ai` extra / `dev` group with `pytest`, `httpx`), remove `[tool.pyright].extraPaths`. Then `uv sync --group dev`.
Run: `uv run pytest tests/test_repo_hygiene.py -v` — Expected: FAIL (lib ignored, uploads tracked).

- [ ] **Step 3: Fix `.gitignore`, untrack, relocate**

Replace root Python-template entries (`build/`, `develop-eggs/`, `dist/`, `downloads/`, `eggs/`, `lib/`, `lib64/`, `parts/`, `sdist/`, `var/`, `wheels/`, …) with `backend/`-prefixed forms; add `reports/`, `backend/reports/`, `backend/aicte_platform.db`. Then `git rm -r --cached backend/uploads reports backend/reports crewai_autonomous_agent_pipeline.py backend/test_annotated.png`, `git mv` the scripts listed above into `backend/scripts/`, `git rm requirements.txt`. Leave `backend/test_master_verification_suite.py` in place (outside `testpaths`; ported in Task 14).

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest -v` — Expected: 3 passed.

- [ ] **Step 5: Commit** — `chore: fix gitignore shadowing frontend/src/lib, untrack generated files, consolidate deps`

### Task 2: Alembic baseline and swappable engine

**Files:**
- Create: `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako`, `backend/alembic/versions/0001_baseline.py`, `backend/tests/conftest.py`, `backend/tests/test_migrations.py`
- Modify: `backend/app/database.py`, `backend/app/main.py:10-13`

**Interfaces:**
- Produces: `app.database.get_engine() -> Engine`, `app.database.set_engine(url: str) -> None` (rebinds module engine; `get_session` uses `get_engine()`), `app.database.seed_reference_data(session) -> None` (institution + checklist rules + SYSTEM_SEEDED audit row only; idempotent; no users).
- Produces (conftest): fixture `client` (TestClient over a fresh migrated SQLite file per test), fixture `session`. Template DB migrated once per session with `alembic upgrade head`, copied per test, then `set_engine("sqlite:///<copy>")`. Conftest sets env before importing `app`: `ENVIRONMENT=development`, `SECRET_KEY`/`AUDIT_HMAC_KEY` (fixed 48-char test strings), `FILE_ENCRYPTION_KEY` (fixed urlsafe-b64 32 bytes), `COOKIE_SECURE=false`, `CORS_ORIGINS=http://localhost:3000`, `UPLOAD_DIR=<tmp>`.

- [ ] **Step 1: Write the failing test** `tests/test_migrations.py`

```python
from sqlalchemy import inspect
def test_head_creates_all_tables(session):
    names = set(inspect(session.get_bind()).get_table_names())
    assert {"users","institutions","checklist_rules","applications","documents","validation_flags","audit_logs","alembic_version"} <= names

def test_startup_seeds_reference_data_but_no_users(client, session):
    from sqlmodel import select
    from app.models.models import User, ChecklistRule
    assert session.exec(select(User)).first() is None
    assert len(session.exec(select(ChecklistRule)).all()) == 4
```

- [ ] **Step 2: Run** `uv run pytest tests/test_migrations.py -v` — Expected: FAIL (no alembic, fixtures missing).

- [ ] **Step 3: Implement** — `alembic init` layout; `env.py` uses `SQLModel.metadata` and `settings.DATABASE_URL` (overridable via `-x url=`); autogenerate `0001_baseline` from current models and hand-check it; `render_as_batch=True` for SQLite. In `database.py` replace `init_db_and_seed` with `seed_reference_data` (drop user seeding and `create_all`); lifespan calls `seed_reference_data`.

- [ ] **Step 4: Run** `uv run pytest -v` — Expected: all pass.

- [ ] **Step 5: Commit** — `feat(db): adopt Alembic migrations and stop seeding demo users`

---

## Phase 2 — Configuration & platform

### Task 3: Validated settings and `generate-keys` CLI

**Files:**
- Modify: `backend/app/config.py`, `backend/.env.example`, `backend/app/services/production_security.py:27-29`
- Create: `backend/app/cli.py`, `backend/tests/test_config.py`

**Interfaces:**
- Produces: `Settings` fields per spec §3 table (incl. `COOKIE_SAMESITE`, `REFRESH_TOKEN_EXPIRE_HOURS`, `MAX_UPLOAD_MB`); `settings.file_encryption_key_bytes -> bytes` (property, 32 bytes); `settings.cors_origin_list -> list[str]`; `LEGACY_SECRET_DEFAULTS: frozenset[str]`; `app.cli.main(argv: list[str] | None = None) -> int`.

- [ ] **Step 1: Write failing tests** `tests/test_config.py` — construct `Settings(_env_file=None, **overrides)` and assert `pydantic.ValidationError` whose message names the field (and does not contain the value) for: missing `SECRET_KEY`; `SECRET_KEY` of 31 chars; `SECRET_KEY="super-secret-aicte-sih26261-local-offline-key"`; `FILE_ENCRYPTION_KEY` decoding to 16 bytes; `AUDIT_HMAC_KEY == SECRET_KEY`; `CORS_ORIGINS="*"`; `ENVIRONMENT="production", COOKIE_SECURE=False`; `COOKIE_SAMESITE="none", COOKIE_SECURE=False`. Plus `test_generate_keys_output_is_valid`: run `cli.main(["generate-keys"])` with `capsys`, parse `KEY=VALUE` lines, build `Settings(**parsed, CORS_ORIGINS="https://x")` without error.
- [ ] **Step 2: Run** `uv run pytest tests/test_config.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** with pydantic `field_validator`/`model_validator`. `generate-keys` uses `secrets.token_urlsafe(48)` for the two secrets and `base64.urlsafe_b64encode(os.urandom(32))` for the file key. `.env.example` gets placeholders + pointer to the CLI. `production_security.py` builds `AESGCM(settings.file_encryption_key_bytes)` (format change itself is Task 9).
- [ ] **Step 4: Run** `uv run pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `feat(config): require strong secrets and validate settings at startup`

### Task 4: HTTP platform — CORS, headers, errors, docs toggle, health

**Files:**
- Create: `backend/app/http.py`, `backend/app/api/health.py`, `backend/tests/test_http.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Produces: `app.http.install(app: FastAPI) -> None` (CORS per spec §5.3, `SecurityHeadersMiddleware`, unhandled-exception handler returning `{"detail": "Internal server error", "error_id": <uuid4 str>}`); `GET /api/health`.

- [ ] **Step 1: Write failing tests** `tests/test_http.py`:
  - `test_health_ok`: 200, body == `{"status": "ok", "database": "ok"}`.
  - `test_security_headers`: `/api/health` response has `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, CSP `default-src 'none'; frame-ancestors 'none'`.
  - `test_cors_allowed_origin` / `test_cors_disallowed_origin`: preflight from `http://localhost:3000` gets `access-control-allow-origin`; from `http://evil.test` does not.
  - `test_docs_disabled_by_default`: `/docs`, `/openapi.json` → 404.
  - `test_reports_not_served`: `/reports/TRACE_AI_AUDIT_REPORT.md` → 404.
  - `test_unhandled_error_hides_message`: register a temp route raising `RuntimeError("secret-path C:/x")`, use `TestClient(app, raise_server_exceptions=False)`; 500, body has `error_id`, `"secret-path"` not in text.
- [ ] **Step 2: Run** `uv run pytest tests/test_http.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** — `main.py` passes `docs_url/redoc_url/openapi_url=None` unless `ENABLE_API_DOCS`; calls `install(app)`; removes `StaticFiles` mount, the `/models` alias route, and `import os`. HSTS header only when `ENVIRONMENT=="production"`. Health runs `SELECT 1`, returns `"error"` on exception.
- [ ] **Step 4: Run** `uv run pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `feat(http): CORS allow-list, security headers, safe 500s, health endpoint`

---

## Phase 3 — Authentication

### Task 5: Token service, auth columns, migration 0002

**Files:**
- Create: `backend/app/services/tokens.py`, `backend/alembic/versions/0002_auth_hardening.py`, `backend/tests/test_tokens.py`
- Modify: `backend/app/models/models.py` (User fields + `RefreshToken` table per spec §2.3), `backend/app/models/__init__.py`

**Interfaces:**
- Produces in `tokens.py`:
  - `as_utc(dt: datetime | None) -> datetime | None` (naive → UTC-aware)
  - `create_access_token(user: User) -> tuple[str, int]` (token, expires_in seconds)
  - `decode_access_token(token: str) -> dict` (raises `jwt.PyJWTError`)
  - `issue_refresh_token(session, user, family_id: str | None = None, family_expires_at: datetime | None = None) -> tuple[str, RefreshToken]`
  - `rotate_refresh_token(session, raw: str) -> tuple[User, str, RefreshToken]` (raises `RefreshTokenError`; on reuse revokes family and logs `REFRESH_TOKEN_REUSE_DETECTED` before raising)
  - `revoke_family(session, family_id: str) -> None`, `revoke_all_for_user(session, user_id: int) -> None`
  - `class RefreshTokenError(Exception)`

- [ ] **Step 1: Write failing tests** `tests/test_tokens.py`, using a `make_user(role)` helper added to conftest (`make_user(session, role, *, email=None, password="Correct-Horse-9", institution_id=None, must_change_password=False) -> User`):
  - `test_access_token_claims`: decoded has `sub == str(user.id)`, `tv == 0`, `iss == "trace-api"`, `aud == "trace-web"`, `exp - iat == 900`; `expires_in == 900`.
  - `test_decode_rejects_alg_none`, `test_decode_rejects_wrong_audience`, `test_decode_rejects_tampered_signature`, `test_decode_rejects_expired`.
  - `test_refresh_rotation_returns_new_token_and_marks_old_replaced`.
  - `test_refresh_reuse_revokes_whole_family`: rotate t1→t2; rotating t1 again raises; rotating t2 now raises too.
  - `test_family_expiry_not_extended_by_rotation`: issue with `family_expires_at = now+1s`, rotate, the new row's `expires_at` equals the original.
  - `test_expired_refresh_after_db_roundtrip` (Review Focus 2): set `expires_at` in the past, `session.commit(); session.expire_all()`, rotation raises `RefreshTokenError` (not `TypeError`).
  - `test_inactive_user_cannot_refresh`.
- [ ] **Step 2: Run** `uv run pytest tests/test_tokens.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** models + migration (autogenerate, then verify server defaults `0`/`false`) + `tokens.py`. Store `sha256(raw).hexdigest()`; lookup by hash; compare datetimes via `as_utc`.
- [ ] **Step 4: Run** `uv run pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `feat(auth): token service with rotating refresh-token families`

### Task 6: Auth endpoints, current-user dependency, lockout

**Files:**
- Modify: `backend/app/api/auth.py` (rewrite), `backend/app/services/security.py`, `backend/app/schemas/schemas.py`
- Create: `backend/app/services/rate_limit.py`, `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: Task 5 `tokens.*`.
- Produces: `security.get_current_user` (no fallback; validates via `decode_access_token`, `tv`, `is_active`; enforces `must_change_password` gate per spec §2.2 for every route not in `PASSWORD_CHANGE_EXEMPT = {"/api/auth/me", "/api/auth/change-password"}`), `security.get_current_user_allow_pending` (no gate), `security.require_roles(roles: list[UserRole])` (unchanged signature), `security.validate_password_policy(password: str, email: str) -> None` (raises `ValueError` with message), `rate_limit.SlidingWindowLimiter(limit: int, window_seconds: int).hit(key: str) -> bool`, schemas `LoginResponse {access_token, token_type, expires_in, user: UserRead}`, `ChangePasswordRequest`, `UserRead` adds `must_change_password: bool`. Helper `set_refresh_cookie(response, raw, expires_at)` / `clear_refresh_cookie(response)` in `auth.py`.

- [ ] **Step 1: Write failing tests** `tests/test_auth.py`:
  - `test_login_success_sets_cookie`: 200; `access_token`, `expires_in == 900`; `Set-Cookie` contains `trace_refresh=`, `HttpOnly`, `Path=/api/auth`, `SameSite=strict`.
  - `test_login_unknown_email_and_wrong_password_identical`: both 401 with body `{"detail": "Incorrect email or password"}`.
  - `test_lockout_after_five_failures`: 5 wrong → 6th with correct password → 401; after setting `locked_until` to past and `expire_all()` → 200 (Review Focus 2).
  - `test_ip_rate_limit`: 21st login attempt within window → 429.
  - `test_refresh_returns_new_access_token`, `test_refresh_without_cookie_401`, `test_logout_revokes_family` (refresh after logout → 401).
  - `test_no_token_is_401` on `/api/auth/me`.
  - `test_token_version_bump_invalidates_access_token`.
  - `test_must_change_password_gate`: user with flag → `/api/applications` 403 `"Password change required"`; `/api/auth/me` 200; after change-password → 200 and old access token 401.
  - `test_change_password_policy`: 11-char new password → 422; wrong current → 400.
  - `test_removed_auth_routes`: `/api/auth/switch` (POST), `/api/auth/register` (POST), `/api/auth/demo-personas` (GET) → 404.
  - `test_audit_never_contains_password`: after login + change-password, no audit row's JSON contains either password string.
- [ ] **Step 2: Run** `uv run pytest tests/test_auth.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** — unknown email runs `bcrypt.checkpw` against a module-level dummy hash; lockout uses `as_utc`; limiter keyed by `request.client.host`, module-level instance `login_limiter = SlidingWindowLimiter(20, 300)`; audit events per spec §2.4. Remove `UserCreate`, `TokenResponse`. Fix callers of `log_audit_event(actor=...)` unaffected.
- [ ] **Step 4: Run** `uv run pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `feat(auth): real login/refresh/logout, lockout, remove persona switching`

### Task 7: Admin user management and `create-admin`

**Files:**
- Create: `backend/app/api/admin.py`, `backend/tests/test_admin_users.py`
- Modify: `backend/app/cli.py`, `backend/app/schemas/schemas.py`, `backend/app/main.py`

**Interfaces:**
- Produces: schemas `AdminUserCreate {email, full_name, role, institution_id?, temporary_password}`, `AdminUserUpdate {full_name?, role?, institution_id?, is_active?, reset_password?}` (both `extra="forbid"`); routes per spec §2.2; CLI `create-admin --email --full-name` reading password via `getpass.getpass` twice.

- [ ] **Step 1: Write failing tests** `tests/test_admin_users.py`:
  - `test_admin_creates_applicant_with_institution` → 201, created user has `must_change_password=True`.
  - `test_applicant_requires_institution` → 422; `test_reviewer_rejects_institution` → 422; `test_unknown_institution` → 422.
  - `test_non_admin_forbidden` (reviewer and applicant → 403 on all three routes).
  - `test_deactivate_kills_sessions`: PATCH `is_active=false` → that user's access token 401 and refresh 401.
  - `test_role_change_bumps_token_version`.
  - `test_admin_cannot_deactivate_or_demote_self` → 400.
  - `test_reset_password_sets_must_change` and old password no longer logs in.
  - `test_cli_create_admin` (monkeypatch `getpass.getpass` → strong password twice): exit 0, user exists with role admin, `must_change_password=False`; second run with same email → non-zero; weak password → non-zero.
- [ ] **Step 2: Run** `uv run pytest tests/test_admin_users.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement**; CLI uses `Session(get_engine())`. Audit `USER_CREATED`/`USER_UPDATED` with changed field names only.
- [ ] **Step 4: Run** `uv run pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `feat(admin): admin-provisioned user management and create-admin CLI`

---

## Phase 4 — Authorization

### Task 8: Access guards and role matrix on existing routes

**Files:**
- Create: `backend/app/services/access.py`, `backend/tests/test_authorization.py`
- Modify: `backend/app/api/{applications,documents,dashboard,audit,rules,intelligence}.py`, `backend/app/main.py` (mount `intelligence.router`), `backend/app/schemas/schemas.py`

**Interfaces:**
- Produces: `load_application(session, application_id: int, user: User, *, write: bool = False) -> Application`, `load_document(session, document_id: int, user: User, *, write: bool = False) -> Document`, constant `APPLICANT_EDITABLE = {ApplicationStatus.DRAFT, ApplicationStatus.RECTIFICATION_REQUESTED}`. `write=True` for applicants raises 409 `{"detail": "Application is not editable in its current status", "current_status": ...}` when status ∉ `APPLICANT_EDITABLE`. Conftest fixtures `inst_a`, `inst_b`, `admin`, `reviewer`, `applicant_a`, `applicant_b`, `headers(user) -> dict`, `make_application(session, institution, status=DRAFT) -> Application`, `make_document(session, application, document_type=AFFIDAVIT, plaintext=b"%PDF-1.4 test") -> Document` (stored via Task 9's storage once available; until then writes raw bytes).

- [ ] **Step 1: Write failing tests** `tests/test_authorization.py`:
  - `test_every_non_public_route_requires_token`: iterate `app.routes` (APIRoute), skip `{"/api/health", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout"}`, substitute path params with `1`, request with no auth → 401 for each method.
  - `MATRIX` table: list of `(method, path_template, {role: expected_status_class})` covering every row of spec §4.2 that exists after this task; parameterised test asserts allowed roles do **not** get 401/403 and denied roles get 403. Rows for `submit`, `submit-rectification`, `rectify`, `verifications`, `GET /documents/{id}` are added to `MATRIX` by Tasks 12–13.
  - `test_cross_institution_is_404`: `applicant_a` on `inst_b`'s application for `GET /api/applications/{id}`, `/flags`, `/api/documents/application/{id}`, `/api/documents/{doc}/preview` → 404 with the exact detail strings.
  - `test_applicant_list_scoped` and `test_applicant_without_institution_sees_nothing` (Spec §9.1 regression).
  - `test_create_application_ignores_body_institution`: body may not contain `institution_id` (422 with `extra="forbid"`); created app has `applicant_a.institution_id`.
  - `test_applicant_cannot_create_institution` → 403.
  - `test_preview_and_ela_require_auth` → 401 without token.
  - `test_rag_search_unknown_application_404`: reviewer `POST /api/rag/search` with `application_id=99999` → 404 (monkeypatch `vector_rag_service` query methods to return `[]`).
- [ ] **Step 2: Run** `uv run pytest tests/test_authorization.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** — route dependencies per spec §4.2 using `require_roles`; replace every `session.get(Application|Document, id)` in routers with the guards; `GET /institutions` filters to own for applicants; `ApplicationCreate` drops `institution_id` (typed `declared_data` comes in Task 12). Remove the duplicate `agent-review` from `applications.py` (spec §6.4) so `intelligence.py`'s version is the only one.
- [ ] **Step 4: Run** `uv run pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `feat(authz): central ownership guards and role matrix on all routes`

---

## Phase 5 — Crypto, audit, execution surface

### Task 9: Document storage, decrypting preview/ELA, upload limits

**Files:**
- Create: `backend/app/services/document_storage.py`, `backend/tests/test_documents_storage.py`
- Modify: `backend/app/services/production_security.py`, `backend/app/services/ocr_service.py`, `backend/app/services/verification_services.py`, `backend/app/api/documents.py`, `backend/app/api/intelligence.py`

**Interfaces:**
- Produces:
  - `encrypt_document(plaintext: bytes, application_id: int) -> bytes` (format `b"\x01" + nonce12 + ct`, AAD `f"APP-{application_id}"`)
  - `decrypt_document(blob: bytes, application_id: int) -> bytes` (raises `ValueError` on unknown version / auth failure)
  - `async read_upload_limited(file: UploadFile, max_bytes: int) -> bytes` (1 MiB chunks; raises `HTTPException(413)`)
  - `store_document(application_id: int, document_type: DocumentType, plaintext: bytes, original_filename: str) -> tuple[Path, dict]` (sanitises via `production_security.sanitize_uploaded_document`, raising `HTTPException(422)` on signature failure; returns path and the sanitised meta)
  - `read_document_plaintext(doc: Document) -> bytes`
  - `content_disposition_inline(filename: str) -> str`
  - `ocr_service.extract_document_bytes(data: bytes, filename: str) -> dict` (replaces the path-based decrypt-guessing; `extract_document(path)` remains for scripts)

- [ ] **Step 1: Write failing tests** `tests/test_documents_storage.py`:
  - `test_roundtrip_and_ciphertext_differs`; `test_wrong_application_id_fails`; `test_unknown_version_byte_fails`.
  - `test_upload_then_preview_returns_plaintext`: applicant_a uploads `%PDF-1.4 hello` → stored file bytes ≠ plaintext; reviewer preview → body == plaintext, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Type: application/pdf`.
  - `test_upload_over_limit_413` (25 MB + 1 byte); `test_bad_signature_422` (`b"MZ\x90\x00..."`); `test_traversal_filename_sanitised` (`../../evil.pdf` → stored path inside `UPLOAD_DIR/app_<id>`).
  - `test_content_disposition_unicode_and_quotes` (Review Focus 5): filename `résumé "x".pdf` → header == `inline; filename*=UTF-8''r%C3%A9sum%C3%A9%20%22x%22.pdf`; no raw `"` or CR/LF.
  - `test_ela_runs_on_decrypted_png`: upload a small generated PNG; reviewer `/ela` → 200 with `anomaly_score` key, no `details` containing exception text.
- [ ] **Step 2: Run** `uv run pytest tests/test_documents_storage.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** — switch the conftest `make_document` fixture to `encrypt_document` so stored fixtures match production format; upload route uses `read_upload_limited(file, settings.MAX_UPLOAD_MB * 2**20)`; preview returns `Response(...)` (remove the JSON fallback, `page`, `mark`); ELA selects by `doc.mime_type in {"image/png","image/jpeg"}` and passes a temp file deleted in `finally`; `verification_services.process_document` reads via `read_document_plaintext` and `extract_document_bytes`, and its missing-file branch sets `VerificationStatus.MANUAL_REVIEW_REQUIRED` (spec §6.4 fix; regression test `test_missing_file_marks_manual_review` here). `/media/inspect` uses `read_upload_limited(file, 50 * 2**20)`; `/intake/authority-check` uses `MAX_UPLOAD_MB`.
- [ ] **Step 4: Run** `uv run pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `feat(docs): dedicated file key, decrypting preview/ELA, streamed upload limits`

### Task 10: HMAC audit chain (migration 0003)

**Files:**
- Create: `backend/alembic/versions/0003_audit_chain.py`, `backend/tests/test_audit_chain.py`
- Modify: `backend/app/models/models.py` (`AuditLog.prev_hash`, `AuditLog.record_hash`), `backend/app/services/audit_service.py`, `backend/app/api/audit.py`, `backend/app/api/documents.py`, `backend/app/services/verification_services.py`

**Interfaces:**
- Produces: `log_audit_event(session, *, action_type, entity_type, summary, application_id=None, entity_id=None, actor=None, actor_role_override=None, details=None) -> AuditLog` (signature unchanged; now chained); `compute_record_hash(row: AuditLog) -> str`; `verify_chain(session) -> dict` returning spec §5.4 shape. `AuditService`/`audit_service` deleted — callers switch to `log_audit_event(actor=current_user)` (for system calls `actor=None`).

- [ ] **Step 1: Write failing tests** `tests/test_audit_chain.py`:
  - `test_chain_intact_after_actions`: log in, create app, upload → `/api/audit/verify-chain` `status == "INTACT"`, `broken_at_id is None`, `verified_count == <row count>`.
  - `test_db_edit_breaks_chain`: `UPDATE audit_logs SET summary='x' WHERE id=<middle>` via raw SQL → `status == "BROKEN"`, `broken_at_id == <middle>`.
  - `test_logs_return_stored_hashes`: `/api/audit/logs` entries' `record_hash` equal DB values; `limit=501` → 422.
  - `test_concurrent_writers_keep_chain_intact` (Review Focus 3): 8 threads × 10 `log_audit_event` calls each with their own `Session(get_engine())` → verify `INTACT` and 80 distinct `prev_hash` values.
  - `test_migration_backfills_existing_rows`: downgrade to 0002, insert 3 rows with raw SQL, upgrade → verify `INTACT`.
- [ ] **Step 2: Run** `uv run pytest tests/test_audit_chain.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** — serialisation: SQLite `session.connection().exec_driver_sql("BEGIN IMMEDIATE")` before reading the tail (configure the engine with `isolation_level=None`-compatible event hook so SQLAlchemy does not emit its own `BEGIN`), PostgreSQL `SELECT pg_advisory_xact_lock(727274)`. SQLite engines get `connect_args={"check_same_thread": False, "timeout": 30}` in `set_engine`/module init so concurrent writers wait instead of raising `database is locked`. HMAC over canonical JSON per spec §5.4 with `AUDIT_HMAC_KEY`; `timestamp_iso` from `as_utc(row.timestamp).isoformat()`. Migration backfill reads `AUDIT_HMAC_KEY` from settings.
- [ ] **Step 4: Run** `uv run pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `feat(audit): HMAC-chained tamper-evident audit log`

### Task 11: Pinned model loading, remove `f:/` path injection, honest AI availability

**Files:**
- Create: `backend/models_registry/MODEL_HASHES.json`, `backend/tests/test_execution_surface.py`
- Modify: `backend/app/services/ml_training_platform.py`, `backend/app/services/multi_agent_workflow.py:20-40`, `backend/app/services/soup_llm_optimizer.py:12-16`, `backend/app/services/multi_source_ingestion.py:99`, `backend/app/api/intelligence.py`

**Interfaces:**
- Produces: `ml_training_platform.load_pinned(path: Path) -> object` (raises `ModelUnavailable` when hash missing/mismatched or file absent); `class ModelUnavailable(Exception)`; training methods rewrite `MODEL_HASHES.json` after dump; `multi_agent_workflow_service.is_available() -> bool` (Ollama reachable).

- [ ] **Step 1: Write failing tests** `tests/test_execution_surface.py`:
  - `test_no_hardcoded_drive_paths`: no file under `app/` contains `"f:/"` or `"F:\\"` (case-insensitive).
  - `test_tampered_model_returns_503`: copy registry to tmp, monkeypatch `MODELS_DIR`, append a byte to `forgery_detector_v1.pkl` → reviewer `POST /api/models/predict-forgery` → 503 `{"detail": "Model unavailable"}`.
  - `test_pinned_model_predicts`: unmodified registry → 200.
  - `test_agent_review_unavailable_is_503`: monkeypatch `is_available` → False; reviewer `POST /api/applications/{id}/agent-review` on a `SUBMITTED` app → 503 `{"detail": "AI review unavailable"}`, application status unchanged.
- [ ] **Step 2: Run** `uv run pytest tests/test_execution_surface.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** — generate `MODEL_HASHES.json` (`{"document_classifier_v1.pkl": "<sha256>", "forgery_detector_v1.pkl": "<sha256>"}`) from the committed files; delete `sys.path.insert` blocks and the tessdata `f:/` default (use `TESSDATA_PREFIX` env if set); agent-review checks `is_available()` first and raises 503.
- [ ] **Step 4: Run** `uv run pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `fix(security): pin pickled models, drop sys.path injection, 503 when AI unavailable`

---

## Phase 6 — API contract

### Task 12: Application lifecycle, typed bodies, decisions (migration 0004)

**Files:**
- Create: `backend/app/services/workflow.py`, `backend/alembic/versions/0004_workflow.py`, `backend/tests/test_lifecycle.py`
- Modify: `backend/app/models/models.py` (`Document.superseded_by_id`, `OfficerDecision` table per spec §6.3), `backend/app/schemas/schemas.py`, `backend/app/api/applications.py`, `backend/app/api/intelligence.py`, `backend/app/services/verification_services.py:185-192`

**Interfaces:**
- Produces:
  - `workflow.transition(session, application: Application, target: ApplicationStatus, *, allowed_from: set[ApplicationStatus]) -> None` (raises 409 with `current_status`)
  - `workflow.missing_mandatory_documents(session, application) -> list[str]`
  - `workflow.current_documents(session, application_id: int) -> list[Document]` (excludes superseded) — used by checklist, listings, verifications, submit
  - schemas `DeclaredData` (spec §6.2 ranges, all optional floats/ints with `ge/le`), `ApplicationCreate {category, academic_year, declared_data: DeclaredData}`, `OfficerDecisionRequest`, `OfficerDecisionResponse`, `DecisionRead`, `ApplicationDetailResponse` + `documents: list[DocumentRead]`, `decisions: list[DecisionRead]`, `latest_decision: DecisionRead | None`, `institution_name: str`
  - `POST /api/applications/{id}/submit`

- [ ] **Step 1: Write failing tests** `tests/test_lifecycle.py`:
  - `test_full_happy_path`: DRAFT → upload all 4 mandatory EOA types → submit (`SUBMITTED`) → reviewer validate (`READY_FOR_REVIEW` or `DEFICIENCY_FLAGGED`) → decision `APPROVE` → `APPROVED_BY_REVIEWER`; response `audit_hash` equals the stored `record_hash` of the `OFFICER_DECISION_APPROVE` row; detail shows `latest_decision.decision == "APPROVE"`.
  - `test_submit_missing_docs_409`: body `missing_document_types` lists the 4 types.
  - `test_invalid_transitions_409`: decision on `DRAFT`; validate on `DRAFT`; submit on `SUBMITTED`; upload on `SUBMITTED` (applicant) — each 409 with `current_status`.
  - `test_unknown_decision_422`, `test_notes_too_short_422`, `test_extra_field_422`.
  - `test_request_rectification_reopens`: decision → `RECTIFICATION_REQUESTED`.
  - `test_declared_data_ranges`: `total_intake=10001` → 422.
  - `test_application_numbers_unique`: two creates → distinct `application_number`.
  - Add `submit` row to `MATRIX` in `test_authorization.py`.
- [ ] **Step 2: Run** `uv run pytest tests/test_lifecycle.py tests/test_authorization.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** per spec §6.1–§6.3. Validate allowed from `{SUBMITTED, READY_FOR_REVIEW, DEFICIENCY_FLAGGED}`; agent-review allowed from the same set and never changes status. Decision mapping: `APPROVE→APPROVED_BY_REVIEWER`, `REJECT→REJECTED_BY_REVIEWER`, `REQUEST_RECTIFICATION→RECTIFICATION_REQUESTED`; writes `OfficerDecision` with the audit row id. App number: `AICTE-{year4}-{category.name}-{max_id+1:04d}`.
- [ ] **Step 4: Run** `uv run pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `feat(workflow): enforced application lifecycle and recorded officer decisions`

### Task 13: Rectification, document metadata, verifications

**Files:**
- Create: `backend/tests/test_rectification.py`
- Modify: `backend/app/api/documents.py`, `backend/app/api/applications.py`, `backend/app/schemas/schemas.py`

**Interfaces:**
- Consumes: Task 9 `store_document`, `read_upload_limited`; Task 12 `workflow.*`.
- Produces: `DocumentRead` without `file_path`, `raw_ocr_text` kept; `RectificationSubmitRequest {notes: str ≤4000, amended: DeclaredData}`; `RectificationSubmitResponse {application_id, status, submitted_at, updated_fields}`; `AuthorityVerificationRead {document_id, document_type, authority_name, status, checked_at, reference_id, details}`; routes `GET /api/documents/{id}`, `POST /api/documents/{id}/rectify`, `POST /api/applications/{id}/submit-rectification`, `GET /api/applications/{id}/verifications`.

- [ ] **Step 1: Write failing tests** `tests/test_rectification.py`:
  - `test_rectify_supersedes`: in `RECTIFICATION_REQUESTED`, rectify doc D → new doc D2; D has `superseded_by_id == D2.id`; `/api/documents/application/{id}` lists D2 not D; audit `DOCUMENT_RECTIFIED`.
  - `test_rectify_wrong_status_409` (in `SUBMITTED`).
  - `test_draft_reupload_supersedes_same_type` (Review Focus 4): upload AFFIDAVIT twice in DRAFT → one current AFFIDAVIT; checklist `document_id` is the newer one.
  - `test_submit_rectification_merges_and_resubmits`: amended `total_intake=360` → `declared_data.total_intake == 360`, status `SUBMITTED`, `updated_fields == ["total_intake"]`.
  - `test_document_metadata_has_no_file_path`: `GET /api/documents/{id}` JSON has no `file_path` key; same for list route.
  - `test_verifications_shape`: after reviewer `/verify`, entries contain the keys above, one per current document.
  - Add `rectify`, `submit-rectification`, `verifications`, `GET /documents/{id}` rows to `MATRIX`.
- [ ] **Step 2: Run** `uv run pytest tests/test_rectification.py tests/test_authorization.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement**; upload in DRAFT supersedes an existing current doc of the same type.
- [ ] **Step 4: Run** `uv run pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `feat(api): rectification flow, document metadata, authority verifications`

### Task 14: Honest dashboard and ported master suite

**Files:**
- Create: `backend/tests/test_dashboard.py`, `backend/tests/test_master_verification_suite.py` (ported)
- Delete: `backend/test_master_verification_suite.py`
- Modify: `backend/app/api/dashboard.py`

**Interfaces:**
- Produces: `dashboard.build_model_registry() -> list[dict]` used by `/api/dashboard/models`, `/api/models`, and `metrics["models"]`; gateway rows `{gateway, verified, mismatch, expired, pending, unavailable, total}` keyed by document type display name.

- [ ] **Step 1: Write failing tests** `tests/test_dashboard.py`:
  - `test_gateway_counts_are_real`: 2 VERIFIED fire certificates + 1 MISMATCH land deed → fire row `verified == 2, mismatch == 0, total == 2`; land row `mismatch == 1`; no row has a value not derivable from fixtures.
  - `test_model_metrics_from_file`: with metrics JSON lacking `recall` → that model's `recall is None`; no literal `0.942`/`0.965` anywhere in the response JSON.
  - `test_empty_db_zeroes`: all counts 0, no exceptions.
- [ ] **Step 2: Run** `uv run pytest tests/test_dashboard.py -v` — Expected: FAIL.
- [ ] **Step 3: Implement** per spec §6.5; port the old master suite into `tests/` using the conftest fixtures and auth headers, deleting assertions that depended on the removed fallback or fabricated values.
- [ ] **Step 4: Run** `uv run pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `fix(dashboard): report only measured values; port master verification suite`

---

## Phase 7 — Frontend

### Task 15: Tooling and pure `lib` modules

**Files:**
- Modify: `frontend/package.json`, `frontend/.env.example`, `frontend/vite.config.ts`
- Create: `frontend/vitest.config.ts`, `frontend/src/test/setup.ts`, `frontend/src/lib/utils/formatters.ts`, `frontend/src/lib/permissions/roles.ts`, `frontend/src/lib/schemas/apiSchemas.ts`, co-located `formatters.test.ts`, `roles.test.ts`, `apiSchemas.test.ts`

**Interfaces:**
- Produces:
  - `formatApiTimestamp(v: string | null | undefined): string`, `formatApiValue(v: unknown, unit?: string): string` (returns `"Not provided by API"` for null/undefined/""), `formatConfidencePercentage(v: number | null | undefined): string`, `validateUploadFile(f: File): string | null` (error message or null)
  - `type Role = 'applicant' | 'reviewer' | 'admin'`; `isStaff(r)`, `canDecide(r)` (reviewer only), `canValidate(r)` (reviewer/admin), `canSubmitRectification(user: {role: Role}, status: string): boolean` (applicant && status === 'RECTIFICATION_REQUESTED')
  - Zod schemas + inferred types: `LoginFormSchema`, `ChangePasswordFormSchema` (new ≥12, confirm matches), `ApplicationIntakeFormSchema` (fields `category`, `academic_year`, `land_area_acres`, `built_up_area_sqm`, `total_intake`, `faculty_count` with spec §6.2 ranges), `OfficerDecisionFormSchema` (`decision` enum, `notes` 10–4000), `ApplicantRectificationFormSchema` (`notes` ≤4000 + optional amended numbers), `AdminUserFormSchema` (applicant ⇒ `institution_id` required; staff ⇒ absent; `temporary_password` ≥12)

- [ ] **Step 1: Install & configure** — remove from `package.json` each of `express`, `@types/express`, `dotenv`, `tsx`, `esbuild` not referenced by `src/`, `vite.config.ts` or scripts (check with grep); rename to `trace-frontend`; dev script `--host=127.0.0.1`; add devDeps `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`; script `"test": "vitest run"`; keep `typescript ^7.0.2` (verified published). `npm install`. `.env.example`: `VITE_API_BASE_URL=/fastapi-proxy`; vite proxy target from `process.env.TRACE_API_ORIGIN || 'http://localhost:8000'`.
- [ ] **Step 2: Write failing tests** — formatter null handling and 25 MB / MIME rejection (`application/zip` → message; 25 MB + 1 → message; PDF 1 KB → null); role helper truth table; schema cases (decision `ESCALATE` rejected; notes of 9 chars rejected; applicant without institution rejected; reviewer with institution rejected).
- [ ] **Step 3: Run** `npm test` — Expected: FAIL (modules missing).
- [ ] **Step 4: Implement** the three modules.
- [ ] **Step 5: Run** `npm test` — Expected: PASS. Commit — `build(frontend): test tooling and rebuilt pure lib modules`

### Task 16: Transport and cross-tab sync

**Files:**
- Create: `frontend/src/lib/api/transport.ts`, `frontend/src/lib/api/cacheSync.ts`, `transport.test.ts`, `cacheSync.test.ts`

**Interfaces:**
- Produces: `class ApiClientError extends Error {status: number; detail: string; fieldErrors: Record<string,string>; errorId?: string; body: unknown}`; `apiRequest<T>(path: string, opts?: {method?: string; body?: unknown; formData?: FormData; signal?: AbortSignal; responseType?: 'json' | 'blob'; skipAuthRetry?: boolean}): Promise<T>`; `getApiBaseUrl(): string`; `setAccessToken(t: string | null): void`; `getAccessToken(): string | null`; `onAuthFailure(cb: () => void): () => void`; `refreshAccessToken(): Promise<string | null>` (deduplicated in-tab via one shared in-flight promise, and serialised across tabs by running the `POST /api/auth/refresh` inside `navigator.locks.request('trace-refresh', …)` when `navigator.locks` exists — because the browser's cookie jar is shared, the second tab's request then carries the already-rotated cookie and is not treated as reuse); `initCrossTabSync(qc: QueryClient): () => void`, `invalidateAllAppQueries(qc: QueryClient): void`, `broadcastLogout(): void`.

- [ ] **Step 1: Write failing tests** (mock `fetch` with `vi.fn`):
  - attaches `Authorization: Bearer t` and `credentials: 'include'`; no `Content-Type` set for `FormData`.
  - two parallel requests both 401 → exactly **one** `POST /api/auth/refresh`, both retried once and resolve.
  - refresh 401 → token cleared, `onAuthFailure` called once, original rejects with `status 401`.
  - auth endpoints (`/api/auth/login`, `/refresh`) never trigger refresh.
  - 422 `{"detail":[{"loc":["body","declared_data","total_intake"],"msg":"too big"}]}` → `fieldErrors.total_intake == "too big"`.
  - 500 `{"detail":"Internal server error","error_id":"abc"}` → `errorId == "abc"`.
  - Review Focus 1: with a fake `navigator.locks` that serialises callbacks, two "tabs" (two module instances via `vi.resetModules`) refreshing concurrently issue refresh calls strictly one after another (second starts after first resolves).
  - `vi.spyOn(Storage.prototype, 'setItem')` never called across the suite.
  - cacheSync: receiving `{type:'logout'}` clears token and calls `onAuthFailure`; `{type:'invalidate'}` calls `qc.invalidateQueries()`; messages never contain record data (assert posted payload keys ⊆ `{type}`).
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(frontend): token transport with single-flight cross-tab refresh`

### Task 17: Endpoints and types

**Files:**
- Create: `frontend/src/lib/api/endpoints.ts`, `endpoints.test.ts`
- Modify: `frontend/src/types/api.ts`

**Interfaces:**
- Consumes: Task 16 `apiRequest`.
- Produces: every function listed in spec §7.1 `endpoints.ts` row, each typed with `types/api.ts` records. Types: remove `PersonaRole`, `RequestedPersona`, `OpenAPISpec`; `OfficerDecisionType` = `'APPROVE' | 'REQUEST_RECTIFICATION' | 'REJECT'`; add `User {id, email, full_name, role: Role, institution_id: number | null, is_active, must_change_password, created_at}`, `LoginResponse`, `AdminUserCreate`, `AdminUserUpdate`, `Institution`; `ApplicationCreateRequest {category, academic_year, declared_data: {land_area_acres?, built_up_area_sqm?, total_intake?, faculty_count?}}`. Normalisers: `normalizeFlag(raw) -> ComplianceFlag` (`reason→description`, `flag_category→finding_type`, `page_number→page`, `document_id→source_document_id`), `normalizeApplication(raw) -> ApplicationDetailRecord` (flattens `declared_data` into `land_area_acres`/`built_up_area_sqm`/`total_intake`/`faculty_count`), `normalizeAuditEntry(raw) -> AuditLogEntry` (`action_type→action`, `record_hash→current_hash`, `prev_hash→previous_hash`), `normalizeChain(raw) -> ChainVerificationResponse` (`status === 'INTACT'` → `valid: true`).

- [ ] **Step 1: Write failing tests** — one per normaliser with a literal backend payload (shapes from Tasks 10, 12, 13) and the expected component-facing object; `createApplication` posts exactly `{category, academic_year, declared_data}`; `uploadApplicationDocument` posts `FormData` with `application_id`, `document_type`, `file`; `fetchDocumentPreview` requests `responseType: 'blob'`.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(frontend): typed endpoint layer normalising backend contracts`

### Task 18: AuthProvider, guards, login & change-password, shell

**Files:**
- Create: `frontend/src/features/auth/AuthContext.tsx`, `LoginPage.tsx`, `ChangePasswordPage.tsx`, `AuthContext.test.tsx`, `LoginPage.test.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/app/AppShell.tsx`, `frontend/src/features/applicant/{ApplicantApplicationsPage,ApplicantDossierRectificationPage}.tsx`, `frontend/src/features/applications/{ApplicationIntakePage,ScrutinyCockpitPage}.tsx`, `frontend/src/features/audit/CryptographicAuditPage.tsx`
- Delete: `frontend/src/features/identity/IdentityContext.tsx`, `frontend/src/components/OpenApiInspectorModal.tsx`

**Interfaces:**
- Consumes: Tasks 16–17.
- Produces: `AuthProvider`, `useAuth(): {user: User | null; status: 'loading' | 'authenticated' | 'anonymous'; login(email: string, password: string): Promise<void>; logout(): Promise<void>; refreshUser(): Promise<void>}`, `RequireAuth({children})`, `RequireRole({allowed: Role[], children})`; `safeNextPath(next: string | null): string` (accepts only paths starting with `/` and not `//`; else `/`).

- [ ] **Step 1: Write failing tests**:
  - AuthProvider on mount calls refresh; success → `authenticated` with user from `/api/auth/me`; failure → `anonymous`.
  - `RequireAuth` anonymous at `/audit` → navigates to `/login?next=%2Faudit`; `must_change_password` user → `/change-password`.
  - `RequireRole` applicant on reviewer route → 403 boundary text, no switch buttons.
  - `safeNextPath('//evil.test')`, `('https://evil.test')` → `/`; `('/applications/3')` → same.
  - LoginPage: 401 shows "Incorrect email or password"; submit disabled while pending.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** — routes: `/login`, `/change-password` outside the shell; everything else inside `RequireAuth`; role-gated routes wrapped per spec §7.4 nav mapping; default landing: applicant → `/applicant/applications`, staff → `/`. Replace all `useIdentity`/`activePersona`/`PersonaRole` uses with `useAuth().user`. Remove persona switcher, connection/OpenAPI badge and inspector button from `AppShell`; add user menu (name, role, Change password, Sign out).
- [ ] **Step 4: Run** `npm test && npm run lint` — Expected: PASS, `tsc` 0 errors.
- [ ] **Step 5: Commit** — `feat(frontend): real authentication replaces persona switching`

### Task 19: Admin users page, submit step, decision form, docs

**Files:**
- Create: `frontend/src/features/admin/AdminUsersPage.tsx`, `AdminUsersPage.test.tsx`
- Modify: `frontend/src/features/applications/ApplicationIntakePage.tsx`, `frontend/src/features/applications/ScrutinyCockpitPage.tsx`, `frontend/src/App.tsx`, `frontend/docs/SECURITY_AND_AUTH.md`, `frontend/docs/API_CAPABILITY_MATRIX.md`, `frontend/README.md`, `README.md`
- Delete: `frontend/docs/BACKEND_GAPS.md`

- [ ] **Step 1: Write failing tests**:
  - AdminUsersPage lists users; selecting role `applicant` reveals institution select (required); creating calls `createUser` with exactly the form fields; deactivate calls `updateUser(id, {is_active:false})`.
  - Intake: after uploads, "Submit application" calls `submitApplication(id)`; a 409 with `missing_document_types: ["AFFIDAVIT"]` renders "AFFIDAVIT".
  - Cockpit decision form offers exactly Approve / Request rectification / Reject; decision controls hidden for admin.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement**; rewrite docs to describe real auth, the endpoint table from spec §4.2, and setup (`generate-keys`, `alembic upgrade head`, `create-admin`, `npm run dev`).
- [ ] **Step 4: Run** `npm test && npm run lint && npm run build` — Expected: all succeed.
- [ ] **Step 5: Commit** — `feat(frontend): admin user management, application submit, aligned decisions`

---

## Phase 8 — Verification

### Task 20: End-to-end run and final review

**Files:** none expected beyond fixes found.

- [ ] **Step 1: Prepare** — `backend/.env` from `uv run python -m app.cli generate-keys` plus `ENVIRONMENT=development`, `COOKIE_SECURE=false`, `CORS_ORIGINS=http://127.0.0.1:3000`; fresh DB `uv run alembic upgrade head`; `uv run python -m app.cli create-admin --email admin@test.local --full-name "Admin"`; start `uv run uvicorn app.main:app --port 8000` and `npm run dev` (background).
- [ ] **Step 2: Drive the spec §9.3 scenario with Playwright MCP** using `backend/datasets/benchmark_60/authentic/auth_doc_0{1..4}.pdf` as the four mandatory documents. Expected end state: application `APPROVED_BY_REVIEWER`, audit page chain `INTACT`, applicant gets 403 boundary on `/audit` and not-found for another institution's `/applicant/applications/<id>`, no console errors, no `localStorage` keys set (`browser_evaluate` → `Object.keys(localStorage).length === 0`).
- [ ] **Step 3: Full suites** — `uv run pytest -v` and `npm test && npm run lint && npm run build`: all green.
- [ ] **Step 4: Security review of the branch diff** — run the `security-review` skill against `main...production-hardening`; fix confirmed findings with a test each.
- [ ] **Step 5: Commit** any fixes — `fix: address findings from end-to-end verification`
