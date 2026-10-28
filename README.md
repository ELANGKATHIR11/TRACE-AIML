# AICTE TRACE: Autonomous Regulatory Compliance & Forensic Document Authentication Platform
### Smart India Hackathon 2026 | Problem Statement ID: 26261 | Organization: AICTE (Regulation Bureau)

[![Python: 3.11](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green.svg)](https://fastapi.tiangolo.com/)
[![Local LLM: Ollama](https://img.shields.io/badge/Ollama-qwen2.5%3A1.5b--instruct-orange.svg)](https://ollama.com/)
[![Security: AES-256-GCM](https://img.shields.io/badge/Security-AES--256--GCM-red.svg)]()
[![Vector DB: ChromaDB](https://img.shields.io/badge/Vector%20Store-ChromaDB%20VRAG%2FMRAG-blueviolet.svg)]()

---

## 1. Project Overview & Statutory Mission

The **TRACE Platform** (*Trust, Regulatory Authentication, and Compliance Engine*) is an enterprise-grade, 100% air-gapped, offline-sovereign decision-support platform engineered specifically for the **All India Council for Technical Education (AICTE), Ministry of Education, Government of India (Regulation Bureau)** in direct alignment with **SIH Problem Statement 26261**.

### The Problem (SIH 26261 Background):
Every year, technical institutions across India submit tens of thousands of complex application dossiers requesting **Extension of Approval (EoA)**, introduction of new programs, variations in approved student intake, or institutional status changes. Manual scrutiny of multi-page land deeds, building stability certificates, fire safety NOCs, affidavits, and faculty rosters is extremely time-consuming and vulnerable to:
* **Digital Alterations & Tampering:** Splices and digital manipulation made using consumer graphics editors (`Canva`, `Adobe Photoshop`, `GIMP`).
* **Cross-Document Discrepancies:** Contradictory metrics across documents (e.g., 99.5 Acres claimed in an affidavit vs. 7.5 Acres in the municipal survey baseline).
* **Missing & Expired Statutory Certificates:** Expired fire safety certificates, land lease expiries, or non-compliant Faculty-Student Ratios (SFR).
* **Difficulty in Confirmation from Issuing Authorities:** Slow or inconclusive manual verification with state registries and issuing portals.

### The Sovereign Air-Gapped Solution:
TRACE delivers an automated, evidence-grounded screening pipeline operating **100% locally on-premises without external cloud APIs**:
1. **Multi-Source Ingestion (6 Streams):** Ingests portal declarations, certificate files (PDF/PNG/JPEG), infrastructure floor plans and walkthrough videos (OpenCV frame sampling), historical AICTE databases, official issuing-authority verification gateways, and Approval Process Handbook (APH) regulatory rules.
2. **Multi-Channel Issuing Authority Hub:** Connects to 5 statutory issuing registries (`DIGILOCKER_ESTAMP`, `STATE_BHULEKH`, `FIRE_PORTAL`, `AICTE_NBA_PORTAL`, `FACULTY_REGISTRY`), inspects PDF PKCS#7/PAdES digital signatures, and decodes QR code payloads, mapping results into all 6 statutory states (`VERIFIED`, `MISMATCH`, `EXPIRED`, `PENDING`, `SOURCE_UNAVAILABLE`, `MANUAL_REVIEW_REQUIRED`).
3. **Forensic & Machine Learning Inspection:** Employs Error Level Analysis (ELA), scikit-learn TF-IDF document classification, Random Forest forgery detection, and PyMuPDF vector span parsing with dynamic red bounding-box page preview overlays (`/api/documents/{id}/preview`).
4. **Local Vector RAG & Grounded AI Review:** Indexes official APH clauses in ChromaDB for semantic retrieval, paired with an offline 3-role AI advisory review team running on local Ollama (`qwen2.5:1.5b-instruct`).
5. **Closed-Loop Rectification Workflow:** Allows applicants to view identified deficiencies, upload replacement certificates, amend declared metrics, and trigger automated re-validation prior to final administrative action.
6. **Standalone Enterprise Headless Backend API:** A robust, high-performance RESTful API architecture providing OpenAPI/Swagger interactive endpoints, automated JSON scrutiny packages, and zero frontend dependencies for seamless integration into any client portal.

> **Statutory Safeguard (PRD & SIH 26261):** All AI inferences, tamper alerts, and compliance flags are strictly **advisory decision-support signals**. Statutory scrutiny, physical inspections where required, and final regulatory determinations remain exclusively with competent AICTE authorities.

---

## 2. End-to-End Enterprise System Architecture

```mermaid
graph TB
    %% STYLING DIRECTIVES
    classDef clientLayer fill:#F8FAFC,stroke:#1F3A6E,stroke-width:2px,color:#0F172A;
    classDef securityLayer fill:#FFF1F2,stroke:#BE123C,stroke-width:2px,color:#881337;
    classDef streamLayer fill:#EEF2FF,stroke:#4338CA,stroke-width:2px,color:#1E1B4B;
    classDef authorityLayer fill:#FDF4FF,stroke:#A21CAF,stroke-width:2px,color:#701A75;
    classDef aiMlLayer fill:#F0FDF4,stroke:#15803D,stroke-width:2px,color:#14532D;
    classDef ledgerLayer fill:#FFFBEB,stroke:#B45309,stroke-width:2px,color:#78350F;
    classDef decisionLayer fill:#F0F9FF,stroke:#0369A1,stroke-width:2px,color:#0C4A6E;

    %% LAYER 1: API INTEGRATION & INTERACTIVE SWAGGER SPEC
    subgraph L1 ["LAYER 1: REST API & OPENAPI SWAGGER SPECIFICATION"]
        direction TB
        C1["AICTE Portal Client Integration<br/>- Stream 1 Institutional Declaration<br/>- Closed-Loop Rectification Payloads<br/>- Application Tracking & Status Endpoints"]:::clientLayer
        C2["Bureau Scrutiny & Regulatory Gateway<br/>- Dual-Pane Evidence Endpoints<br/>- Dynamic Red Bounding Box Page PNG Previews<br/>- Side-by-Side Authority Record Comparison APIs"]:::clientLayer
        C3["Vigilance & Admin Intelligence Endpoints<br/>- Handbook Semantic RAG Search (`/api/rag/search`)<br/>- ML Model Registry & Performance Metrics (`/api/models/metrics`)<br/>- Grounded 3-Role AI Advisory Reviews<br/>- SHA-256 Tamper-Evident Merkle Ledger (`/api/audit/verify-chain`)"]:::clientLayer
    end

    %% LAYER 2: SECURITY & ZERO-TRUST GATEWAY
    subgraph L2 ["LAYER 2: ZERO-TRUST ACCESS GATEWAY & STORAGE VAULT"]
        direction TB
        S1["RBAC & Public Privilege Escalation Guard<br/>Strict Public Applicant Registration · Admin-Provisioned Officers"]:::securityLayer
        S2["Institutional IDOR Data Isolation Shield<br/>Institution-Scoped Scrutiny · Cross-Institution Access Denied"]:::securityLayer
        S3["At-Rest AES-256-GCM Cryptographic Storage<br/>Encrypted PDF & Image Vault · 96-bit Nonce + 128-bit Auth Tag"]:::securityLayer
        S4["Magic-Byte & Polyglot File Defense<br/>Header Verification (%PDF-, PNG, JPEG) · Shellcode Disarmed"]:::securityLayer
    end

    %% LAYER 3: MULTI-SOURCE INGESTION TIER
    subgraph L3 ["LAYER 3: MULTI-SOURCE INGESTION ENGINE (6 INPUT STREAMS)"]
        direction TB
        ST1["Stream 1: Portal Application Form<br/>JSON Declarations & Category-Specific Checklist Router"]:::streamLayer
        ST2["Stream 2: Uploaded Certificates<br/>PyMuPDF Vector Text & Offline Tesseract OCR"]:::streamLayer
        ST3["Stream 3: Infrastructure Media<br/>Floor Plan Dimension Parsing & OpenCV Walkthrough Sampling"]:::streamLayer
        ST4["Stream 4: Historical AICTE Records<br/>Previous EoA Intakes, Approvals & Deficiency History"]:::streamLayer
        ST5["Stream 5: Issuing Authority Verification<br/>PKCS#7 PAdES Signatures & 2D QR Payload Verification"]:::streamLayer
        ST6["Stream 6: Regulatory Rulebook (APH)<br/>AICTE Approval Process Handbook Rules & Norms Engine"]:::streamLayer
    end

    %% LAYER 4: MULTI-CHANNEL ISSUING AUTHORITY VERIFICATION HUB
    subgraph L4 ["LAYER 4: ISSUING AUTHORITY VERIFICATION HUB (5 REGISTRIES)"]
        direction TB
        AH1["DigiLocker & State e-Stamp Gateway<br/>Affidavit & e-Stamp Registry"]:::authorityLayer
        AH2["State Bhulekh & Land Registry<br/>Khasra / Title Deed Ownership"]:::authorityLayer
        AH3["State Fire Service NOC Registry<br/>Validity & Coverage Verification"]:::authorityLayer
        AH4["AICTE / NBA Accreditation Portal<br/>Tier-1 / Tier-2 Accreditation Records"]:::authorityLayer
        AH5["National Faculty Registry / DigiLocker<br/>Aadhaar-Seeded Faculty Records"]:::authorityLayer
        AHOUT["6 Statutory Verification Outcomes<br/>VERIFIED | MISMATCH | EXPIRED | PENDING | SOURCE_UNAVAILABLE | MANUAL_REVIEW_REQUIRED"]:::authorityLayer
    end

    %% LAYER 5: AIR-GAPPED AI, ML & REGULATORY COMPLIANCE SUITE
    subgraph L5 ["LAYER 5: AIR-GAPPED ML, FORENSICS & RAG INTELLIGENCE"]
        direction TB
        ML1["TF-IDF + Calibrated LinearSVC Classifier<br/>Automated Document Type Identification"]:::aiMlLayer
        ML2["Random Forest Multi-Modal Forgery Detector<br/>ELA Standard Deviation, Font Entropy & Timestamp Analysis"]:::aiMlLayer
        ML3["ChromaDB Vector RAG Engine<br/>Official APH Clause Retrieval & Statutory Justifications"]:::aiMlLayer
        ML4["Grounded 3-Role AI Advisory Team<br/>Forensic Auditor · Compliance Officer · Evidence Compiler (Ollama)"]:::aiMlLayer
        ML5["Computer Vision & Infrastructure Triage<br/>Room Schedule Area Summation & EVC Physical Inspection Checklist"]:::aiMlLayer
    end

    %% LAYER 6: COURT-READY EVIDENCE & AUDIT LEDGER
    subgraph L6 ["LAYER 6: COURT-READY EVIDENCE & TAMPER-EVIDENT AUDIT"]
        direction TB
        E1["Dynamic Red Bounding Box Page Previews<br/>Decrypted PNG Render with Targeted Evidence Marks"]:::ledgerLayer
        E2["Evidence-Linked Finding Deficiencies<br/>Advisory Flags Linked to Clauses, Sources & Fields"]:::ledgerLayer
        E3["Tamper-Evident SHA-256 Merkle Ledger<br/>Cryptographically Chained Audit Trail with Verification"]:::ledgerLayer
    end

    %% LAYER 7: STATUTORY HUMAN-IN-THE-LOOP DETERMINATION
    subgraph L7 ["LAYER 7: STATUTORY HUMAN-IN-THE-LOOP DETERMINATION"]
        direction TB
        DEC["Authorized AICTE Scrutiny Officer<br/>- APPROVE: Grant Extension of Approval / New Institution Approval<br/>- REJECT: Issue Regulatory Rejection Notice with Evidence Citations<br/>- REQUEST_RECTIFICATION: Issue Deficiency Notice for Applicant Rectification<br/>- ESCALATE: Refer to Standing Hearing Committee / Physical EVC Inspection"]:::decisionLayer
    end

    %% CONNECTIVITY FLOW
    C1 & C2 & C3 --> S1
    S1 --> S2 --> S3 --> S4
    S4 --> ST1 & ST2 & ST3 & ST4 & ST5 & ST6
    ST2 & ST5 --> AH1 & AH2 & AH3 & AH4 & AH5 --> AHOUT
    ST1 & ST2 & ST3 & ST4 & ST6 --> ML1 & ML2 & ML3 & ML4 & ML5
    AHOUT & ML1 & ML2 & ML3 & ML4 & ML5 --> E1 & E2 & E3
    E1 & E2 & E3 --> C2
    C2 --> DEC
    DEC -. Deficiency Rectification Loop .-> C1
```

---

## 3. Technology Stack & Packages

### Backend (Python 3.11 Air-Gapped Environment)
| Category | Library / Tool | Exact Role in Platform |
| :--- | :--- | :--- |
| **Framework & API** | `fastapi`, `uvicorn`, `starlette` | High-performance asynchronous REST API runtime |
| **Data Validation & Settings** | `pydantic`, `pydantic-settings` | Request/response schema validation and environment management |
| **Database & ORM** | `sqlmodel`, `sqlalchemy` | Relational SQLite / PostgreSQL ORM with automatic schema migrations |
| **Cryptography & Security** | `cryptography`, `bcrypt`, `pyjwt` | AES-256-GCM file encryption, password hashing, and JWT tokens |
| **Document Processing & OCR** | `pymupdf` (PyMuPDF / fitz), `pypdf` | Vector text extraction, PDF metadata analysis, and annotated PNG page rendering |
| **Computer Vision & Forensics** | `opencv-python`, `pillow`, `scipy` | ELA compression analysis, QR code decoding, and video frame sampling |
| **Vector Database & RAG** | `chromadb` | Embedded vector database for AICTE Approval Process Handbook semantic search |
| **Machine Learning** | `scikit-learn`, `joblib`, `numpy` | Document classification (TF-IDF + Calibrated LinearSVC) and Forgery Detection (Random Forest) |
| **Local LLM Inference** | `ollama` (`qwen2.5:1.5b-instruct`) | Local on-premises structured advisory analysis without cloud APIs |
| **Testing & Quality Assurance**| `pytest`, `pytest-asyncio` | Automated security, verification, and regression test suites |

---

## 4. Key Functional Modules & Endpoints

### 1. Multi-Channel Issuing Authority Hub
- **Service:** `backend/app/services/issuing_authority_hub.py`
- Connects documents to authoritative registries:
  - `DIGILOCKER_ESTAMP`: e-Stamp certificate verification.
  - `STATE_BHULEKH`: Land record title and Khasra validation.
  - `FIRE_PORTAL`: State fire safety NOC validity checks.
  - `AICTE_NBA_PORTAL`: Course accreditation status.
  - `FACULTY_REGISTRY`: Faculty verification against authorized databases.
- Evaluates **PDF PKCS#7 / PAdES digital signatures** and **2D QR payloads**.
- Returns one of the 6 statutory verification outcomes: `VERIFIED`, `MISMATCH`, `EXPIRED`, `PENDING`, `SOURCE_UNAVAILABLE`, `MANUAL_REVIEW_REQUIRED`.

### 2. Live Page Rendering with Red Bounding Box Overlays
- **Endpoint:** `GET /api/documents/{document_id}/preview?page=0&mark=term1&mark=term2`
- Decrypts the stored AES-256-GCM file on-the-fly and renders the requested page as an authenticated PNG.
- Automatically searches for matched words or evidence snippets and draws highlighted red bounding boxes directly on the document image.

### 3. Golden Dossiers & Seed Records
- **Service:** `backend/app/services/golden_dossiers_service.py`
- Seeds four comprehensive prototype dossiers covering major AICTE regulatory workflows:
  1. `AICTE-2026-EOA-GOLD-A`: Extension of Approval with verified NOCs and compliance.
  2. `AICTE-2026-NEW-GOLD-B`: New Institution application with fire NOC mismatch and land acreage deficiency.
  3. `AICTE-2026-INC-GOLD-C`: Increase in Intake with expired fire certificate and building plan review.
  4. `AICTE-2026-EOA-GOLD-D`: Extension of Approval with unresolved land dispute and manual review requirements.

### 4. Grounded 3-Role AI Advisory Review
- **Endpoint:** `POST /api/applications/{application_id}/agent-review`
- Executes a multi-perspective advisory review using local Ollama:
  - **Forensic Document Auditor:** Analyzes document metadata, alterations, and digital integrity.
  - **Regulatory Compliance Officer:** Compares declared metrics with APH requirements retrieved from ChromaDB.
  - **Evidence Compiler:** Synthesizes observations and compiles physical inspection (EVC) recommendations.

### 5. Closed-Loop Rectification
- **Endpoints:**
  - `POST /api/documents/{document_id}/rectify`: Uploads a replacement document for a deficient record.
  - `POST /api/applications/{application_id}/submit-rectification`: Updates declared metrics and re-triggers automated validation.

---

## 5. Verification & Acceptance Testing

The platform includes a master automated verification suite covering all statutory requirements:

```bash
# Execute Master Verification Suite
cd backend
python -m pytest -v test_master_verification_suite.py
```

### Verification Suite Coverage (12/12 Passing):
1. `test_public_registration_privilege_escalation_blocked`: Strict public registration checks.
2. `test_idor_cross_institution_protection`: Cross-institution data segregation.
3. `test_tamper_evident_merkle_chain`: SHA-256 chained audit trail integrity.
4. `test_offline_aes256_gcm_storage_and_decryption`: Cryptographic at-rest encryption.
5. `test_vector_rag_retrieval`: ChromaDB semantic retrieval of APH clauses.
6. `test_real_ml_document_and_forgery_classifiers`: Real model evaluation against registered weights.
7. `test_issuing_authority_hub_six_statutory_states`: All 6 issuing authority verification outcomes.
8. `test_infrastructure_cv_floor_plan_and_evc_triage`: Room dimension parsing and EVC inspection checks.
9. `test_golden_dossiers_and_closed_loop_rectification`: End-to-end dossier seeding and rectification.
10. `test_ml_endpoints_use_real_registry`: ML registry metrics reporting.
11. `test_rag_search_returns_cited_clauses`: Semantic RAG search endpoint.
12. `test_preview_renders_page_and_marks_terms`: Live page preview generation with red bounding box highlights.

---

## 6. How to Run Locally

### Prerequisites
- Python 3.11 with [uv](https://docs.astral.sh/uv/), and Node.js 20+.
- (Optional) Local Ollama on `http://localhost:11434` for AI review. When Ollama is down, `POST /api/applications/{id}/agent-review` returns `503`.
- (Optional) The `ai` extra for the CrewAI / LangGraph / ChromaDB features: `uv sync --extra ai`.

### 1. Configure and migrate the backend
```bash
cd backend
uv sync
cp .env.example .env
uv run python -m app.cli generate-keys     # prints SECRET_KEY, AUDIT_HMAC_KEY, FILE_ENCRYPTION_KEY; paste into .env
```
For local HTTP development also set these in `backend/.env`:
```ini
ENVIRONMENT=development
COOKIE_SECURE=false
```
Create the schema and the first administrator (the password is prompted, 12-128 characters):
```bash
uv run python -m alembic upgrade head
uv run python -m app.cli create-admin --email admin@example.org --full-name "Site Admin"
```
A local `aicte_platform.db` created before the Alembic migrations must be deleted and recreated, or stamped with `uv run python -m alembic stamp 0001` and then upgraded.

### 2. Run the API and the frontend
```bash
uv run python -m uvicorn app.main:app --host 127.0.0.1 --port 8000   # backend/
npm install && npm run dev                                          # frontend/, http://127.0.0.1:3000
```
The Vite dev server proxies `/fastapi-proxy` to `http://localhost:8000` (override with `TRACE_API_ORIGIN`). Sign in as the admin and use **Users** to create reviewer and applicant accounts; new users must change their temporary password at first sign-in. There are no built-in demo accounts.

### 3. Production notes
See [`frontend/README.md`](frontend/README.md) section 4 (same-origin reverse proxy, cookie path, forwarded IPs).

### 4. Tests
```bash
cd backend && uv run python -m pytest -q
cd frontend && npm test && npm run lint && npm run build
```
