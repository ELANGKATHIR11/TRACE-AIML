# AICTE TRACE: Enterprise Architecture Blueprint & Technical Specification
**Smart India Hackathon 2026 | Problem Statement ID: 26261 | Organization: AICTE (Regulation Bureau)**  
**System Classification:** High-Security Air-Gapped Sovereign AI Decision-Support Platform  

---

## 1. High-Level Enterprise Architecture Diagram

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

## 2. Subsystem Architecture Specifications

### 2.1 Layer 1: React & TypeScript Presentation Cockpit
- **Technology Stack**: React 18, TypeScript, Vite 5, Vanilla CSS Design System with Glassmorphism and Lucide icons.
- **Portals**:
  - **Applicant Portal**: Submits multi-stream packets, monitors OCR progress, views required documents checklist.
  - **Scrutiny Officer Cockpit**: Interactive split-screen review, dual-resolution bounding box evidence viewer, one-click CrewAI agent audit trigger, human-in-the-loop verdict buttons (`APPROVE`, `REJECT`, `REQUEST_CORRECTION`, `ESCALATE`).
  - **Admin & Vigilance Dashboard**: Monitors cryptographic Merkle audit chain verification status, inspects ML training metrics, and analyzes cross-institutional ghost certificate recycling.

### 2.2 Layer 2: Zero-Trust Security Gateway
- **Privilege Escalation Protection**: Public registration can only create `APPLICANT` accounts. Administrative and reviewer accounts require authenticated authorization.
- **In-Depth IDOR Mitigation**: Validates institutional ownership on application retrieval, document uploads, document listing, and verification triggering.
- **Cryptographic Storage**: AES-256-GCM authenticated encryption at rest with 96-bit random nonces and 128-bit authentication tags.
- **Magic-Byte Polyglot Defense**: Validates headers (`%PDF-`, `PNG`, `JPEG`) to neutralize polyglot files, shellcode, and decompression bombs.

### 2.3 Layer 3: Six Input Streams Ingestion Tier
1. **Stream 1 (Portal Application Form)**: Validates JSON declarations, resolves category (EoA, New Institution, Intake Increase), and generates dynamic checklists.
2. **Stream 2 (Uploaded Certificates)**: Extracts digital vector text and executes offline Tesseract OCR on scanned instruments.
3. **Stream 3 (Infrastructure Media)**: Samples video frames at 25%, 50%, and 75% intervals using OpenCV, verifying temporal continuity and room/floor plans.
4. **Stream 4 (Historical Institutional DB)**: Queries previous EoA baselines, historical deficiencies, and authorized student intake figures.
5. **Stream 5 (Authority Verification)**: Decodes 2D QR codes and verifies against allowlisted government domains (`aicte-india.org`, `gov.in`, `nic.in`).
6. **Stream 6 (Regulatory Rulebook)**: Parses official APH regulatory clauses from PDFs and HTML using BeautifulSoup4.

### 2.4 Layer 4: Autonomous CrewAI Multi-Agent Swarm
- **`ForensicDocumentAuditor`**: Uncovers graphic designer signatures (`Canva`, `Adobe Photoshop`, `GIMP`), timestamp modifications, and metric splices.
- **`RegulatoryComplianceOfficer`**: Enforces AICTE APH Chapter 1 & 7 norms (SFR 1:20 ratio, Cadre 1:2:6:12, Land acreage).
- **`VisualEvidenceCompiler`**: Localizes anomalies with vector bounding boxes and compiles comprehensive scrutiny dossiers.
- **Deterministic Fallback**: Automatically activates deterministic rules engine if agent loops encounter timeouts or constrained hardware.

### 2.5 Layer 5: Air-Gapped Verification, Vector RAG & Machine Learning
- **PyMuPDF + Tesseract OCR**: Native vector extraction for digital PDFs; embedded Tesseract OCR (`eng.traineddata`) for scanned PDFs and raster images.
- **Local ChromaDB Vector RAG**: Persistent local embeddings for VRAG (statutory APH clauses) and MRAG (multi-hop document reconciliation).
- **Trainable ML/DL Subsystem**: Scikit-learn TF-IDF Document Classifier and Random Forest multi-modal Forgery Detector with precision, recall, and F1 tracking.
- **Local GPU Inference Core**: Ollama running `qwen2.5:1.5b-instruct` on NVIDIA GeForce RTX GPU.

### 2.6 Layer 6: Court-Ready Evidence & Audit Ledger
- **Visual Evidence Cards**: Dual-view screenshots (Micro-Zoom Highlight with red bounding frame + Macro Layout Context).
- **Multi-Format Export**: Generates court-ready Markdown (`CREWAI_AUTONOMOUS_REGULATORY_AUDIT_REPORT.md`), self-contained HTML (`scrutiny_dossier_*.html` with embedded base64 images), and machine-readable JSON packages.
- **Tamper-Evident Merkle Ledger**: Persists `prev_record_hash` and `record_hash` on every action, providing end-to-end cryptographic verification via `GET /api/audit/verify-chain`.

### 2.7 Layer 7: Statutory Human-in-the-Loop Determination
- **In Accordance with SIH Problem Statement 26261 Essential Safeguards**, AI agents are strictly advisory decision-support tools.
- **Only an authenticated AICTE Scrutiny Officer** can finalize approval or rejection decisions, with all determinations recorded in the tamper-evident audit ledger.
