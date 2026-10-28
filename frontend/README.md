# AICTE TRACE — Standalone Frontend (PS 26261)

**Trustworthy Regulatory Assurance & Compliance Engine**  
Production-grade React + TypeScript + Vite standalone frontend for the AICTE Regulation Bureau scrutiny, forensic document authentication, and regulatory compliance platform.

---

## 1. Core Architectural Principles

- **Absolute Zero-Mock Policy:** Every metric, application dossier, compliance flag, statutory authority status, AI stage output, document preview, model score, and cryptographic audit verification displayed in this application comes strictly from live FastAPI backend responses (`VITE_API_BASE_URL`).
- **Truthful Failure & Missing-Data Handling:** When the backend is unreachable, returns an HTTP error (`401`, `403`, `404`, `422`, `500`), or omits optional fields, the UI displays the exact HTTP/network status, renders `"Not provided by API"` for absent fields, and provides a genuine retry trigger.
- **Statutory Safeguard:** Prominently enforces across the application shell and adjudication workflows that all AI inferences, tamper alerts, and compliance flags are strictly advisory decision-support signals.

---

## 2. Environment Setup & Installation

### Prerequisites
- Node.js `>= 20.x`
- FastAPI backend running at `http://localhost:8000` (Swagger UI at `http://localhost:8000/docs`, OpenAPI schema at `http://localhost:8000/openapi.json`)

### Environment Configuration
Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Ensure `VITE_API_BASE_URL` points to your FastAPI origin:

```ini
VITE_API_BASE_URL=http://localhost:8000
```

You can also inspect or override the active backend URL at runtime via the **API Connection & OpenAPI Inspector** drawer in the top navigation bar.

### Install & Run

```bash
# Install dependencies
npm install

# Start development server (Port 3000)
npm run dev

# Type-check (strict TypeScript)
npm run lint

# Run unit tests (API transport, validation schemas, formatters, permissions)
npx --yes tsx --test src/lib/utils/formatters.test.ts

# Production build
npm run build
```

---

## 3. Troubleshooting API Connectivity & CORS

1. **Network Error / Connection Refused (`Failed to fetch`)**
   - Verify the FastAPI server is listening on `http://localhost:8000`:
     ```bash
     curl -i http://localhost:8000/openapi.json
     ```
   - Ensure `FastAPI` has `CORSMiddleware` configured to allow your frontend origin (`http://localhost:3000` or `http://localhost:5173`):
     ```python
     from fastapi.middleware.cors import CORSMiddleware

     app.add_middleware(
         CORSMiddleware,
         allow_origins=["http://localhost:3000", "http://localhost:5173"],
         allow_credentials=True,
         allow_methods=["*"],
         allow_headers=["*"],
     )
     ```

2. **`HTTP 401 Unauthorized` on Port 8000**
   - If running inside a container environment where port `8000` is bound by another service (such as `control-plane-api`), either forward port `8000` to your local FastAPI instance or click **API Connection** in the header to point the frontend to your active FastAPI URL.

---

## 4. Production Deployment Guidance

1. Build the static production bundle:
   ```bash
   VITE_API_BASE_URL=https://api.trace.aicte-india.org npm run build
   ```
2. Serve the generated `dist/` directory using Nginx, Caddy, or a CDN with SPA fallback (`try_files $uri $uri/ /index.html;`).
3. Enforce HTTPS (TLS 1.3) in production; `http://localhost:8000` is strictly for local development.

---

## 5. Additional Documentation

- [`docs/API_CAPABILITY_MATRIX.md`](docs/API_CAPABILITY_MATRIX.md) — Endpoint inventory and contract status.
- [`docs/BACKEND_GAPS.md`](docs/BACKEND_GAPS.md) — Disclosed backend gaps and fallback-free handling.
- [`docs/SECURITY_AND_AUTH.md`](docs/SECURITY_AND_AUTH.md) — Persona resolution, route boundaries, and data protection.
