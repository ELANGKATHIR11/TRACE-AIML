# AICTE TRACE — Frontend (PS 26261)

React + TypeScript + Vite frontend for the AICTE TRACE scrutiny, document authentication and compliance platform. Every record shown comes from the FastAPI backend; when the backend errors or omits a field, the UI shows the real status or "Not provided by API". AI output, tamper alerts and compliance flags are advisory only.

## 1. Setup

Prerequisites: Node.js 20+ and the backend running on `http://localhost:8000` (see the repository README for `generate-keys`, `alembic upgrade head` and `create-admin`).

```bash
cp .env.example .env   # VITE_API_BASE_URL defaults to /fastapi-proxy
npm install
npm run dev            # http://127.0.0.1:3000
npm test               # Vitest
npm run lint           # tsc --noEmit
npm run build
```

`VITE_API_BASE_URL` is read at build time and is the only API origin the app uses. The default `/fastapi-proxy` is served by the Vite dev proxy, which forwards to `http://localhost:8000` (override with `TRACE_API_ORIGIN`) and rewrites the refresh-cookie path from `/api/auth` to `/fastapi-proxy/api/auth`.

Sign in at `/login` with an account created by an administrator. Administrators manage users at `/admin/users`.

## 2. Roles and routes

| Role | Navigation |
|---|---|
| applicant | My Applications, New Application (intake, document upload, submit), rectification |
| reviewer | Dashboard, Dossier Registry, Scrutiny Cockpit (records decisions), Audit Trail |
| admin | Dashboard, Dossier Registry, Scrutiny Cockpit (read-only, no decisions), Audit Trail, Users |

Route guards are a presentation boundary; the backend enforces access.

## 3. Troubleshooting

- `Failed to fetch` or `502` from `/fastapi-proxy`: the backend is not listening on `TRACE_API_ORIGIN` (default `http://localhost:8000`). Check `curl http://localhost:8000/api/health`.
- Signed out on every reload: for plain-HTTP local development set `ENVIRONMENT=development` and `COOKIE_SECURE=false` in `backend/.env`; a `Secure` cookie is not stored over HTTP.
- AI review shows "unavailable": the backend returns `503` when Ollama is not running.

## 4. Production deployment

1. Build with the public origin of the site as the API base, e.g. `VITE_API_BASE_URL=https://trace.example.org npm run build`. Requests then go to `https://trace.example.org/api/...`. (An empty value falls back to `/fastapi-proxy`, which only the Vite dev server provides.)
2. Serve `dist/` and the API from the **same origin** behind one reverse proxy (SPA fallback to `index.html`, `/api` forwarded to uvicorn). Use HTTPS and keep `COOKIE_SECURE=true`.
3. The refresh cookie (`trace_refresh`) has `Path=/api/auth`. The proxy must expose the API at `/api/auth`, or rewrite the cookie path the way the Vite dev proxy does.
4. Start uvicorn with `--forwarded-allow-ips=<proxy address>` (or set `FORWARDED_ALLOW_IPS`) so the per-IP login limiter sees client addresses rather than the proxy's.
5. `COOKIE_SAMESITE` (default `strict`) and `CORS_ORIGINS` matter only for a cross-origin deployment, which requires `COOKIE_SAMESITE=none` with HTTPS and an exact origin list.

## 5. Documentation

- [`docs/API_CAPABILITY_MATRIX.md`](docs/API_CAPABILITY_MATRIX.md) — endpoints and which roles may call them.
- [`docs/SECURITY_AND_AUTH.md`](docs/SECURITY_AND_AUTH.md) — authentication, session handling and data protection.
