# AICTE TRACE — Backend Gaps & Unverified Capabilities

This document records backend capabilities that could not be live-verified in the build container or that may be absent depending on the active FastAPI branch running at `http://localhost:8000`.

---

## 1. Build-Environment Connectivity Observation

When probing `http://localhost:8000/openapi.json` inside the cloud build container, port `8000` is bound by the container host's internal `control-plane-api` process, which responds with:

```json
HTTP/1.1 401 Unauthorized
{"error":"Unauthorized: Missing Authorization header"}
```

Because the actual AICTE TRACE FastAPI server runs on the evaluator's or developer's local host (`http://localhost:8000`), all frontend data views are wired to query `VITE_API_BASE_URL` (`http://localhost:8000`) directly from the client browser without any mock fallbacks.

---

## 2. Potential Backend Capability Gaps & How the Frontend Handles Them

In strict adherence to the **Absolute Zero-Mock Policy (Section 2)**:

1. **Authentication & Persona Switching (`/api/auth/login` or `/api/auth/switch`)**
   - **Requirement:** Switch between `official@aicte-india.org` (`REVIEWER` / `OFFICIAL`) and `applicant@apexedu.ac.in` (`APPLICANT`, Institution ID `1`).
   - **Frontend Behavior:** On persona selection, the frontend checks whether `/openapi.json` exposes an authentication endpoint (`/api/auth/login`, `/api/auth/token`, or `/api/auth/switch`). If absent, the header badge explicitly displays `Unverified Dev Identity (No Backend Auth Endpoint)` and documents that client-side role scoping is active for UI navigation only while backend authorization remains unverified.

2. **ML Model Registry (`GET /api/models`)**
   - **Requirement:** Display TF-IDF document-classifier and Random Forest forgery-detector metrics only if exposed by the backend.
   - **Frontend Behavior:** The dashboard checks `metrics.models` from `GET /api/dashboard/metrics` and probes `GET /api/models`. If neither returns model evaluation data, the ML Model Registry panel displays an explicit **Capability Unavailable** notice rather than inventing accuracy, precision, recall, or F1 scores.

3. **Error Level Analysis (ELA) (`GET /api/documents/{id}/ela`)**
   - **Requirement:** Expose an ELA control only when the backend implements a genuine server-side ELA endpoint.
   - **Frontend Behavior:** The Evidence Canvas queries the backend for ELA availability. When the backend returns `404 Not Found` or omits an ELA route from `/openapi.json`, the ELA mode displays **Server-Side ELA Endpoint Unavailable** and never simulates a browser-side canvas filter.

4. **Bounding-Box Coordinates on Document Previews**
   - **Requirement:** Render red evidence bounding boxes only if the backend returns real coordinates or server-annotated preview images.
   - **Frontend Behavior:** If `GET /api/documents/{id}/preview` returns a binary image (`image/png`, `image/jpeg`) or `application/pdf`, the viewer renders the exact server stream. Red SVG coordinate overlays are drawn only when the backend response (or finding metadata) explicitly includes normalized or pixel bounding-box coordinates (`bbox` / `coordinates`).

5. **Standalone Document Metadata (`GET /api/documents/{id}`)**
   - **Requirement:** Route `/documents/:id` for document details or preview.
   - **Frontend Behavior:** Requests `GET /api/documents/{id}` and `GET /api/documents/{id}/preview`. If `GET /api/documents/{id}` is not implemented separately from application details, the view still attempts direct preview via `GET /api/documents/{id}/preview` and reports the exact status of the metadata endpoint.
