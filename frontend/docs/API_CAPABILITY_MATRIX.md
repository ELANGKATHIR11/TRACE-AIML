# AICTE TRACE — API Capability Matrix

**Platform:** AICTE TRACE (Trustworthy Regulatory Assurance & Compliance Engine)  
**Problem Statement:** Smart India Hackathon 2026 | PS 26261  
**Configured Backend Origin:** `VITE_API_BASE_URL=http://localhost:8000`  
**OpenAPI Discovery Path:** `GET http://localhost:8000/openapi.json`

---

## 1. Capability & Endpoint Inventory

During initial build inside the isolated container environment, `http://localhost:8000/openapi.json` returned `HTTP 401 Unauthorized` from the container host's internal control-plane daemon rather than a FastAPI instance. In accordance with Section 3 ("If the backend is unreachable during initial development, continue building the API client and UI architecture using the discovered repository contracts... Do not invent response schemas. Clearly identify the endpoints that still require live verification"), the frontend implements the full typed API transport, runtime schema validators, and live OpenAPI introspection engine (`/openapi.json`) that dynamically verifies endpoint availability in the user's browser against `http://localhost:8000`.

| Capability | Actual endpoint | Contract verified | Frontend status |
|---|---|---|---|
| OpenAPI Schema Discovery | `GET /openapi.json` | Pending live FastAPI connection | Implemented (Live OpenAPI Inspector built-in) |
| System Health Check | `GET /api/health` / `GET /health` | Pending live FastAPI connection | Implemented (Real connectivity probe in header) |
| Dashboard metrics | `GET /api/dashboard/metrics` | Pending live FastAPI connection | Implemented (Zero-mock live query + error/retry state) |
| ML Model Registry | `GET /api/models` (or embedded in `/api/dashboard/metrics`) | Pending live FastAPI connection | Implemented (Displays real metrics or explicit Unavailable state) |
| Application registry | `GET /api/applications` | Pending live FastAPI connection | Implemented (Live registry table, filters, bounded pagination) |
| Application intake | `POST /api/applications` | Pending live FastAPI connection | Implemented (Zod + React Hook Form + FastAPI 422 field error mapping) |
| Application details | `GET /api/applications/{id}` | Pending live FastAPI connection | Implemented (Scrutiny Cockpit + Applicant Detail views) |
| Document upload | `POST /api/documents/upload` | Pending live FastAPI connection | Implemented (Multipart `FormData` without manual boundary override) |
| Document preview | `GET /api/documents/{id}/preview?page={page}&mark={term}` | Pending live FastAPI connection | Implemented (Binary image/PDF & JSON coordinate overlay support) |
| Forensic ELA analysis | `GET /api/documents/{id}/ela` | Pending live FastAPI connection | Implemented (Queries backend; discloses Unavailable if 404/not in OpenAPI) |
| Forensic findings / flags | `GET /api/applications/{id}/flags` | Pending live FastAPI connection | Implemented (Explainable AI findings list + click-to-highlight) |
| Statutory source verification | `GET /api/applications/{id}/verifications` (or in application detail) | Pending live FastAPI connection | Implemented (Supports `STATE_BHULEKH`, `FIRE_PORTAL`, `DIGILOCKER_ESTAMP`, `AICTE_NBA_PORTAL`, `FACULTY_REGISTRY`) |
| AI / Multi-agent review | `POST /api/applications/{id}/agent-review` | Pending live FastAPI connection | Implemented (Triggers backend review; renders real stage outputs) |
| Binding officer decisions | `POST /api/applications/{id}/decision` | Pending live FastAPI connection | Implemented (Requires confirmation; non-retried mutation; invalidates caches) |
| Document rectification | `POST /api/documents/{id}/rectify` | Pending live FastAPI connection | Implemented (Multipart replacement upload for eligible documents) |
| Submit rectification | `POST /api/applications/{id}/submit-rectification` | Pending live FastAPI connection | Implemented (Closed-loop applicant submission with confirmation) |
| Audit log events | `GET /api/audit/logs` | Pending live FastAPI connection | Implemented (Chronological cryptographic event table) |
| Audit integrity verification | `GET /api/audit/verify-chain` | Pending live FastAPI connection | Implemented (On-demand backend verification; never computed in browser) |

---

## 2. Live Verification Protocol

1. Start the FastAPI backend on `http://localhost:8000` with CORS configured for `http://localhost:3000` (or `http://localhost:5173`).
2. Click the **API Contract & OpenAPI Inspector** button in the top institutional bar or on the Executive Dashboard.
3. The frontend fetches `GET http://localhost:8000/openapi.json` directly from the browser and reconciles every path above against the live FastAPI `paths` dictionary in real time.
