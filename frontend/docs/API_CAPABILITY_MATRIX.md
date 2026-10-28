# AICTE TRACE — API Capability Matrix

A = applicant (own institution), R = reviewer, Ad = admin. Authorization is enforced by the backend; the frontend only hides controls a role cannot use. A request for another institution's object returns `404`.

| Route | A | R | Ad |
|---|---|---|---|
| `GET /api/health` | public | public | public |
| `GET /api/institutions` | own only | yes | yes |
| `POST /api/institutions` | no | no | yes |
| `GET /api/rules` | yes | yes | yes |
| `POST /api/rules`, `PATCH /api/rules/{id}` | no | no | yes |
| `POST /api/applications` | yes (institution forced from user) | no | no |
| `GET /api/applications`, `/{id}`, `/{id}/flags`, `/{id}/verifications` | own | yes | yes |
| `POST /api/applications/{id}/submit` | own | no | no |
| `POST /api/applications/{id}/submit-rectification` | own | no | no |
| `POST /api/applications/{id}/validate` | no | yes | yes |
| `POST /api/applications/{id}/agent-review` | no | yes | yes |
| `POST /api/applications/{id}/decision` | no | yes | no |
| `POST /api/documents/upload` | own, editable | no | no |
| `POST /api/documents/{id}/rectify` | own, `RECTIFICATION_REQUESTED` | no | no |
| `GET /api/documents/application/{id}`, `/{id}`, `/{id}/preview` | own | yes | yes |
| `GET /api/documents/{id}/ela`, `POST /api/documents/{id}/verify` | no | yes | yes |
| `GET /api/dashboard/*`, `GET /api/models`, `GET /api/models/metrics` | no | yes | yes |
| `POST /api/models/predict-*`, `/api/rag/search`, `/api/media/inspect`, `/api/intake/authority-check` | no | yes | yes |
| `GET /api/audit/logs`, `/api/audit/verify-chain` | no | yes | yes |
| `/api/admin/users*` | no | no | yes |

Authentication routes (`/api/auth/login`, `/refresh`, `/logout`, `/me`, `/change-password`) are used by the sign-in flow described in `SECURITY_AND_AUTH.md`.

## Frontend behaviour worth knowing

- Decision values are `APPROVE`, `REQUEST_RECTIFICATION` and `REJECT`; decision notes are required.
- `POST /api/applications/{id}/submit` returns `409` with `missing_document_types` when required documents are absent; the intake page lists them.
- `POST /api/applications/{id}/agent-review` returns `503` when the local model server (Ollama) is down; the cockpit reports it as unavailable.
- `409` responses carry `current_status` for invalid status transitions.
