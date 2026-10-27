# AICTE TRACE: Autonomous Regulatory Compliance & Forensic Document Authentication Platform
### Smart India Hackathon 2026 | Problem Statement ID: 26261 | Organization: AICTE (Regulation Bureau)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python: 3.11](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green.svg)](https://fastapi.tiangolo.com/)
[![React: 18](https://img.shields.io/badge/Frontend-React%2018%20TypeScript-61dafb.svg)](https://react.dev/)
[![CrewAI: Multi--Agent](https://img.shields.io/badge/Orchestration-CrewAI%20Local-red.svg)](https://www.crewai.com/)
[![Local LLM: Ollama](https://img.shields.io/badge/Ollama-qwen2.5%3A1.5b--instruct-orange.svg)](https://ollama.com/)
[![Hardware: RTX GPU](https://img.shields.io/badge/Inference-NVIDIA%20RTX%20GPU-76B900.svg)](https://www.nvidia.com/)
[![Security: AES-256-GCM](https://img.shields.io/badge/Security-AES--256--GCM-red.svg)]()
[![Vector DB: ChromaDB](https://img.shields.io/badge/Vector%20Store-ChromaDB%20VRAG%2FMRAG-blueviolet.svg)]()

---

## 1. Project Overview & Statutory Mission

The **TRACE Platform** (*Trust, Regulatory Authentication, and Compliance Engine*) is an enterprise-grade, 100% air-gapped, offline-sovereign decision-support platform engineered specifically for the **All India Council for Technical Education (AICTE), Ministry of Education, Government of India (Regulation Bureau)**.

### The Problem (SIH26261 Background):
Every year, technical institutions across India submit tens of thousands of complex application dossiers requesting **Extension of Approval (EoA)**, introduction of new programs, variations in approved student intake, or institutional status changes. Manual scrutiny of multi-page land deeds, building stability certificates, fire safety NOCs, affidavits, and faculty rosters is extremely time-consuming and vulnerable to:
* **Digital Alterations & Tampering:** Splices made using consumer graphics editors (`Canva`, `Adobe Photoshop`, `GIMP`).
* **Cross-Document Discrepancies:** Contradictory metrics (e.g. 99.5 Acres claimed in an affidavit vs. 7.5 Acres in the municipal survey baseline).
* **Missing & Expired Statutory Certificates:** Expired fire safety or non-compliant Faculty-Student Ratios (SFR).
* **Document Recycling & Ghost Facilities:** Submitting the same building safety certificate or faculty roster across multiple independent colleges.

### The Sovereign Air-Gapped Solution:
TRACE delivers an automated, evidence-grounded screening pipeline operating **100% locally on-premises without external cloud APIs (zero OpenAI, zero Anthropic, zero Google Gemini Cloud)**. It ingests 6 independent input streams, orchestrates autonomous **CrewAI multi-agent swarms**, runs local **ChromaDB VRAG/MRAG**, trains reproducible **scikit-learn ML models**, draws red bounding box overlays over tampered regions, and exports court-ready dossiers directly into an authenticated **Human-in-the-Loop Scrutiny Cockpit**.

> **Statutory Notice (PRD §Essential Safeguards):** All AI model inferences, tamper flags, and compliance discrepancy alerts are strictly **advisory decision-support signals**. Final administrative authority, physical inspection mandates, and regulatory dispositions remain exclusively vested in competent AICTE Hearing Committees and Regulatory Officers.

---

## 2. High-Level Enterprise Architecture Diagram

```mermaid
graph TB
    %% STYLING DIRECTIVES
    classDef clientLayer fill:#0F172A,stroke:#38BDF8,stroke-width:2px,color:#F8FAFC;
    classDef securityLayer fill:#881337,stroke:#FB7185,stroke-width:2px,color:#FFF1F2;
    classDef streamLayer fill:#1E1B4B,stroke:#818CF8,stroke-width:2px,color:#EEF2FF;
    classDef agentLayer fill:#0C4A6E,stroke:#38BDF8,stroke-width:2px,color:#F0F9FF;
    classDef coreEngine fill:#14532D,stroke:#4ADE80,stroke-width:2px,color:#F0FDF4;
    classDef evidenceLayer fill:#4A044E,stroke:#E879F9,stroke-width:2px,color:#FDF4FF;
    classDef decisionLayer fill:#064E3B,stroke:#34D399,stroke-width:2px,color:#ECFDF5;

    %% LAYER 1: CLIENT PRESENTATION TIER
    subgraph L1 ["LAYER 1: REACT & TYPESCRIPT PRESENTATION COCKPIT"]
        direction TB
        C1["Applicant Portal<br/>- Statutory Dossier Upload<br/>- Application Tracking & Status"]:::clientLayer
        C2["Scrutiny Officer Cockpit<br/>- Split-Screen Dual Visual Viewer<br/>- Glowing Red Highlight Bounding Boxes<br/>- Human-in-the-Loop Verdict Controls"]:::clientLayer
        C3["AICTE Admin & Vigilance Console<br/>- Merkle Audit Chain Verification<br/>- Model Registry & Training Metrics"]:::clientLayer
    end

    %% LAYER 2: SECURITY & ZERO-TRUST GATEWAY
    subgraph L2 ["LAYER 2: ZERO-TRUST SECURITY GATEWAY & INGESTION FILTER"]
        direction TB
        S1["Privilege Escalation Guard & RBAC<br/>Strict Public Applicant Registration<br/>Admin-Provisioned Reviewer Accounts"]:::securityLayer
        S2["Resource Authorization & IDOR Shield<br/>Institution-Level Data Isolation<br/>Cross-Institutional Access Blocked"]:::securityLayer
        S3["At-Rest Cryptographic Storage<br/>AES-256-GCM Authenticated Encryption<br/>(96-bit Nonce + 128-bit Tag at Rest)"]:::securityLayer
        S4["Magic-Byte & Polyglot Defense<br/>Header Verification (%PDF-, PNG, JPEG)<br/>Disarms Zip Bombs & Shellcode"]:::securityLayer
    end

    %% LAYER 3: SIX INPUT STREAMS INGESTION
    subgraph L3 ["LAYER 3: MULTI-SOURCE INGESTION TIER (6 INPUT STREAMS)"]
        direction TB
        ST1["Stream 1: Portal Application Form<br/>JSON Schema Validation & Category Router"]:::streamLayer
        ST2["Stream 2: Uploaded Certificates<br/>PDF/TIFF/Image Digital & Scanned Extraction"]:::streamLayer
        ST3["Stream 3: Infrastructure Media<br/>OpenCV Video Frame Sampling & Floor Plans"]:::streamLayer
        ST4["Stream 4: Historical AICTE Database<br/>Previous EoA Baseline & Historical Records"]:::streamLayer
        ST5["Stream 5: Authority Verification<br/>QR Code Decoder & Allowlisted Issuer URLs"]:::streamLayer
        ST6["Stream 6: Regulatory Rulebook<br/>BeautifulSoup4 HTML & APH PDF Parser"]:::streamLayer
    end

    %% LAYER 4: AUTONOMOUS CREWAI MULTI-AGENT SWARM
    subgraph L4 ["LAYER 4: CREWAI AUTONOMOUS AGENT ORCHESTRATION SWARM"]
        direction TB
        AG1["ForensicDocumentAuditor Agent<br/>Uncovers Graphic Footprints (Canva, Photoshop, GIMP)"]:::agentLayer
        AG2["RegulatoryComplianceOfficer Agent<br/>Evaluates APH Ch 1 & 7 (SFR 1:20, Cadre, Land Norms)"]:::agentLayer
        AG3["VisualEvidenceCompiler Agent<br/>Renders Red Bounding Boxes & Compiles Dossiers"]:::agentLayer
        AG4["Deterministic Fallback Engine<br/>High-Availability Fallback if Agent Loops Timeout"]:::agentLayer
    end

    %% LAYER 5: AIR-GAPPED VERIFICATION & REPRODUCIBLE ML
    subgraph L5 ["LAYER 5: AIR-GAPPED VERIFICATION, VECTOR RAG & TRAINABLE ML"]
        direction TB
        M1["Local Offline OCR Engine<br/>PyMuPDF 2.0 Vector Text + Tesseract OCR"]:::coreEngine
        M2["Local Vector RAG (ChromaDB)<br/>VRAG (APH Clauses) + MRAG (Multi-Hop Proofs)"]:::coreEngine
        M3["Trainable ML/DL Platform<br/>Scikit-Learn TF-IDF Classifier + RandomForest Forgery Detector"]:::coreEngine
        M4["Local GPU LLM Core<br/>Ollama qwen2.5:1.5b-instruct on NVIDIA RTX GPU"]:::coreEngine
    end

    %% LAYER 6: COURT-READY EVIDENCE & AUDIT LEDGER
    subgraph L6 ["LAYER 6: COURT-READY EVIDENCE & AUDIT LEDGER"]
        direction TB
        E1["Evidence Localization<br/>Red Bounding Box High-Res Screenshots (Crop + Full)"]:::evidenceLayer
        E2["Multi-Format Report Generator<br/>Downloadable HTML, JSON Package & Markdown Dossiers"]:::evidenceLayer
        E3["Tamper-Evident Merkle Ledger<br/>Cryptographic SHA-256 Chained Event Audit Trail"]:::evidenceLayer
    end

    %% LAYER 7: STATUTORY DECISION LAYER
    subgraph L7 ["LAYER 7: STATUTORY HUMAN-IN-THE-LOOP DETERMINATION"]
        direction TB
        DEC["Authorized AICTE Scrutiny Officer<br/>- APPROVE: Grant Full Regulatory Clearance<br/>- REJECT: Issue Rejection Notice<br/>- REQUEST_CORRECTION: Issue 15-Day Cure Notice<br/>- ESCALATE: Refer to Standing Hearing Committee"]:::decisionLayer
    end

    %% PIPELINE CONNECTIONS
    C1 & C2 & C3 --> S1
    S1 --> S2 --> S3 --> S4
    S4 --> ST1 & ST2 & ST3 & ST4 & ST5 & ST6
    ST1 & ST2 & ST3 & ST4 & ST5 & ST6 --> AG1 & AG2 & AG3
    AG1 & AG2 & AG3 -. Fallback .-> AG4
    AG1 & AG2 & AG3 --> M1 & M2 & M3 & M4
    M1 & M2 & M3 & M4 --> E1 & E2 & E3
    E1 & E2 & E3 --> C2
    C2 --> DEC
```

---

## 3. Core Features & Capabilities

### 1. Six Unified Ingestion Streams
* **Stream 1 (Portal Application Form)**: Validates JSON schemas, extracts requested intake, and routes applications to applicable Approval Process Handbook (APH) checklists.
* **Stream 2 (Uploaded Certificates)**: High-precision text parsing via PyMuPDF 2.0 vector spans and local offline Tesseract OCR (`eng.traineddata`) for scanned PDFs, TIFFs, and PNG/JPEGs.
* **Stream 3 (Infrastructure Media)**: OpenCV temporal video frame sampling (25%, 50%, and 75% intervals) and floor plan / layout bounding box analysis.
* **Stream 4 (Historical Institutional DB)**: Relational verification against previous EoA references, historical deficiencies, and baseline student intakes.
* **Stream 5 (Authority Verification)**: 2D Barcode & QR code decoding with domain allowlist validation (`aicte-india.org`, `gov.in`, `nic.in`).
* **Stream 6 (Regulatory Rulebook)**: Ingestion of official APH statutory clauses via BeautifulSoup4 and PDF parsing into local vector indexes.

### 2. Autonomous Multi-Agent Orchestration (CrewAI + Soup CLI)
* **`ForensicDocumentAuditor`**: Uncovers graphic designer signatures (`Canva`, `Adobe Photoshop`, `GIMP`), creation vs. modification timestamp deltas, and metric splices.
* **`RegulatoryComplianceOfficer`**: Evaluates APH Chapter 1 & 7 norms (SFR 1:20 ratio, Cadre 1:2:6:12, Land acreage).
* **`VisualEvidenceCompiler`**: Draws red bounding box highlights over tampered areas and compiles court-ready AICTE Scrutiny Dossiers.
* **Deterministic Fallback**: Automatically preserves workflow continuity using deterministic rules if agent loops timeout.

### 3. Local Vector Retrieval-Augmented Generation (VRAG + MRAG)
* **ChromaDB Local Vector Engine**: Persistent embedded vector storage under `backend/chroma_db/`.
* **VRAG (Verification RAG)**: Matches applicant metrics against official AICTE Approval Process Handbook clauses and cites exact statutory chapters.
* **MRAG (Multi-Hop RAG)**: Cross-reconciles facts across disparate submitted application documents (Land Deeds $\leftrightarrow$ Building Safety Plans $\leftrightarrow$ Notarized Affidavits).

### 4. Real Trainable ML/DL Platform
* **Document Type Classifier**: Scikit-learn TF-IDF Vectorizer + Calibrated Logistic Regression.
* **Multi-Modal Forgery Detector**: Random Forest Classifier evaluating Error Level Analysis (ELA) compression standard deviations, font diversity, and software footprints.
* **Model Registry & Tracking**: Persists models and evaluation metrics (Accuracy, Precision, Recall, F1) to `backend/models_registry/`.

### 5. Multi-Format Evidence Reporting & Human-in-the-Loop Cockpit
* **Dual-Resolution Evidence Cards**: Automatically outputs 2x super-sampled cropped thumbnails for fast human review alongside full-page layout context overviews.
* **Multi-Format Export**: Generates court-ready Markdown (`CREWAI_AUTONOMOUS_REGULATORY_AUDIT_REPORT.md`), self-contained HTML (`scrutiny_dossier_*.html` with embedded base64 images), and machine-readable JSON packages.
* **Human-in-the-Loop Review Queue**: Dedicated `PENDING_HUMAN_REVIEW` queue with statutory officer verdict endpoints (`APPROVE`, `REJECT`, `REQUEST_CORRECTION`, `ESCALATE`).

### 6. Production-Grade Enterprise Security
* **Privilege Escalation Guard**: Restricts public registration strictly to `APPLICANT` accounts.
* **IDOR Protection**: Enforces institution-level ownership checks across all document and application endpoints.
* **AES-256-GCM Storage Vault**: Encrypts files at rest with 96-bit random nonces and 128-bit authentication tags.
* **Tamper-Evident Merkle Ledger**: Cryptographically links all audit actions using SHA-256 block hashes (`prev_record_hash` and `record_hash`), verifiable via `GET /api/audit/verify-chain`.

---

## 4. Artificial Intelligence, Machine Learning & Deep Learning Stack

| Component | Technical Model / Algorithm | Library / Runtime | Exact Statutory Purpose |
| :--- | :--- | :--- | :--- |
| **Generative LLM Core** | **Qwen 2.5 (1.5B Instruct)** | Local Ollama (`localhost:11434`) | Generates structured entity extractions, cross-document discrepancy explanations, and formal audit narratives. |
| **Agent Orchestration** | **CrewAI Multi-Agent Swarm** | Local Source (`crewAI-main`) | Coordinates Forensic Document Auditor, Compliance Officer, and Evidence Compiler agents. |
| **Fine-Tuning Toolkit** | **Soup-CLI Engine** | Local Source (`Soup-main`) | Model evaluation, dataset alignment, and verification tuning. |
| **Vector RAG Engine** | **VRAG & MRAG Cosine Search** | Local ChromaDB | Retrieves grounded APH regulatory clauses and reconciles multi-hop document evidence. |
| **Document Classification** | **TF-IDF + Calibrated Classifier** | Scikit-Learn | Automatically classifies incoming institutional documents into statutory types. |
| **Forgery Detector** | **RandomForestClassifier (100 Trees)** | Scikit-Learn | Predicts forgery probability based on ELA error, font entropy, and timestamp deltas. |
| **Raster Splice Detection** | **Error Level Analysis (ELA)** | PIL (`ImageChops`) + OpenCV | Detects compression anomalies in 8x8 DCT blocks to reveal digitally spliced stamps, signatures, or altered metrics. |
| **Document OCR** | **Vector Text + Tesseract OCR** | PyMuPDF 2.0 (`eng.traineddata`) | 100% offline extraction from digital PDFs, scanned PDFs, and raster images. |
| **Video Preprocessing** | **Temporal Frame Sampling** | OpenCV (`cv2.VideoCapture`) | Samples video walkthroughs at 25%, 50%, and 75% intervals for infrastructure audits. |
| **Regulatory Inference** | **APH Forward-Chaining Expert System** | Python Rule Engine (`rules_engine.py`) | Enforces deterministic regulatory limits (SFR 1:20, Cadre norms, minimum land acreage). |

---

## 5. Verification & Acceptance Test Suite

The system includes automated regression, security, and integration test suites:

```bash
# Run Master Verification Test Suite (Security, IDOR, Merkle Chain, AES-GCM, Vector RAG, ML Classifiers)
cd backend
python -m pytest test_master_verification_suite.py -v

# Run Production-Grade Security & Forensics Suite
python test_production_security_suite.py
```

All tests pass 100% locally with zero external network connectivity.

---

## 6. How to Run Locally

### 1. Backend Server
```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
# Swagger API Documentation available at: http://localhost:8000/docs
```

### 2. Frontend Cockpit
```bash
cd frontend
npm run dev
# Scrutiny Cockpit available at: http://localhost:5173/
```

### 3. Run Autonomous CrewAI Multi-Agent Audit
```bash
cd backend
python crewai_autonomous_agent_pipeline.py
# Outputs Markdown, HTML, and JSON dossiers to backend/reports/
```
