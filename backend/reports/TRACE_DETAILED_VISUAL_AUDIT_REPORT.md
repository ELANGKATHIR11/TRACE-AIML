# AICTE REGULATORY COMPLIANCE & FORENSIC AUDIT REPORT
**Application Number:** `AICTE-BENCH-60-57AF04`  
**Institution:** Apex Institute of Engineering and Technology (AICTE Permanent ID: `1-4928173650`)  
**Audit Pipeline:** TRACE 100% Offline Air-Gapped Verification Engine  
**Hardware Detected:** NVIDIA GeForce RTX 5060 Laptop GPU (Local Inference Active)  
**Total Documents Ingested:** 60  
**Total Identified Flags:** 131  

---

## 1. Executive Summary & Disposition
This regulatory audit was triggered autonomously by the **TRACE Verification Engine** following the ingestion of the institutional application packet. 

Out of 60 uploaded instruments, **20 documents exhibited critical evidentiary anomalies**, including digital cut-and-paste tampering, graphics software editor signatures (`Canva`, `Photoshop`, `GIMP`), and contradictory land area declarations.

### Application Disposition:
* **Current Status:** `DEFICIENCY_FLAGGED`
* **Recommended Action:** **REFER TO STANDING VIGILANCE COMMITTEE & ISSUE RECTIFICATION NOTICE**
* **Approval Verdict:** **HELD IN ABEYANCE** (Cannot be granted without physical original verification).

---

## 2. Visual Evidence Gallery: Flagged Areas with Bounding Box Highlights

### Visual Finding #1: forged_doc_19.pdf (`LAND_OWNERSHIP_DOCUMENT`)

#### High-Resolution Flagged Area Screenshot (Zoomed Highlight):
![Cropped Flagged Area Evidence](reports/visual_evidence/crop_case_66_forged_doc_19.png)

* **Exact Reason for Flagging:** Altered land metric pasted into statutory instrument; graphics design editor footprint found in metadata.
* **Statutory Rule Violated:** `AICTE Approval Process Handbook (APH) Chapter 1, Norms for Land & Title Verification`
* **Flagged Area Focus:** The red highlight bounding frame isolates the pasted land claim `Land Area: 99.5 Acres` and differing font typography spans.
* **Exact Place of Flagging in Engine:**
  * **Code File:** [`backend/app/services/gemini_service.py`](file:///f:/TRACE/AI-Powered-Application-Validation-Doc-Authentication-and-Regulatory-Compliance-Verification-Platform-main/backend/app/services/gemini_service.py)
  * **Function:** `LocalExtractorService.analyze_forensics()` & `RulesEngine.evaluate_document_rules()`

#### Full Page Layout Context:
![Full Document Page](reports/visual_evidence/full_case_66_forged_doc_19.png)

---
### Visual Finding #2: forged_doc_04.pdf (`LAND_OWNERSHIP_DOCUMENT`)

#### High-Resolution Flagged Area Screenshot (Zoomed Highlight):
![Cropped Flagged Area Evidence](reports/visual_evidence/crop_case_67_forged_doc_04.png)

* **Exact Reason for Flagging:** Altered land metric pasted into statutory instrument; graphics design editor footprint found in metadata.
* **Statutory Rule Violated:** `AICTE Approval Process Handbook (APH) Chapter 1, Norms for Land & Title Verification`
* **Flagged Area Focus:** The red highlight bounding frame isolates the pasted land claim `Land Area: 99.5 Acres` and differing font typography spans.
* **Exact Place of Flagging in Engine:**
  * **Code File:** [`backend/app/services/gemini_service.py`](file:///f:/TRACE/AI-Powered-Application-Validation-Doc-Authentication-and-Regulatory-Compliance-Verification-Platform-main/backend/app/services/gemini_service.py)
  * **Function:** `LocalExtractorService.analyze_forensics()` & `RulesEngine.evaluate_document_rules()`

#### Full Page Layout Context:
![Full Document Page](reports/visual_evidence/full_case_67_forged_doc_04.png)

---
### Visual Finding #3: forged_doc_01.pdf (`LAND_OWNERSHIP_DOCUMENT`)

#### High-Resolution Flagged Area Screenshot (Zoomed Highlight):
![Cropped Flagged Area Evidence](reports/visual_evidence/crop_case_71_forged_doc_01.png)

* **Exact Reason for Flagging:** Altered land metric pasted into statutory instrument; graphics design editor footprint found in metadata.
* **Statutory Rule Violated:** `AICTE Approval Process Handbook (APH) Chapter 1, Norms for Land & Title Verification`
* **Flagged Area Focus:** The red highlight bounding frame isolates the pasted land claim `Land Area: 99.5 Acres` and differing font typography spans.
* **Exact Place of Flagging in Engine:**
  * **Code File:** [`backend/app/services/gemini_service.py`](file:///f:/TRACE/AI-Powered-Application-Validation-Doc-Authentication-and-Regulatory-Compliance-Verification-Platform-main/backend/app/services/gemini_service.py)
  * **Function:** `LocalExtractorService.analyze_forensics()` & `RulesEngine.evaluate_document_rules()`

#### Full Page Layout Context:
![Full Document Page](reports/visual_evidence/full_case_71_forged_doc_01.png)

---
### Visual Finding #4: forged_doc_14.pdf (`LAND_OWNERSHIP_DOCUMENT`)

#### High-Resolution Flagged Area Screenshot (Zoomed Highlight):
![Cropped Flagged Area Evidence](reports/visual_evidence/crop_case_74_forged_doc_14.png)

* **Exact Reason for Flagging:** Altered land metric pasted into statutory instrument; graphics design editor footprint found in metadata.
* **Statutory Rule Violated:** `AICTE Approval Process Handbook (APH) Chapter 1, Norms for Land & Title Verification`
* **Flagged Area Focus:** The red highlight bounding frame isolates the pasted land claim `Land Area: 99.5 Acres` and differing font typography spans.
* **Exact Place of Flagging in Engine:**
  * **Code File:** [`backend/app/services/gemini_service.py`](file:///f:/TRACE/AI-Powered-Application-Validation-Doc-Authentication-and-Regulatory-Compliance-Verification-Platform-main/backend/app/services/gemini_service.py)
  * **Function:** `LocalExtractorService.analyze_forensics()` & `RulesEngine.evaluate_document_rules()`

#### Full Page Layout Context:
![Full Document Page](reports/visual_evidence/full_case_74_forged_doc_14.png)

---

## 3. Deep AI Analysis from Local Ollama Core

```markdown
# Regulatory Audit Report: AICTE-BENCH-60-57AF04

## Overview
This report details the findings from a regulatory audit conducted on application number **AICTE-BENCH-60-57AF04**. The audit identified 131 flags across six documents, with a declared intake of 420 and land area of 7.5 square meters.

## Sample Visual Findings

### Document ID: 66
#### Filename: forged_doc_19.pdf
##### Reason: Altered land metric pasted into statutory instrument; graphics design editor footprint found in metadata.
##### Code Location: backend/app/services/gemini_service.py:analyze_forensics (Line 135)
##### Rule Citation: AICTE Approval Process Handbook (APH) Chapter 1, Norms for Land & Title Verification

![Cropped Flagged Area Evidence](reports/visual_evidence/crop_case_66_forged_doc_19.png)
![Full Document Context View](reports/visual_evidence/full_case_66_forged_doc_19.png)

### Document ID: 67
#### Filename: forged_doc_04.pdf
##### Reason: Altered land metric pasted into statutory instrument; graphics design editor footprint found in metadata.
##### Code Location: backend/app/services/gemini_service.py:analyze_forensics (Line 135)
##### Rule Citation: AICTE Approval Process Handbook (APH) Chapter 1, Norms for Land & Title Verification

![Cropped Flagged Area Evidence](reports/visual_evidence/crop_case_67_forged_doc_04.png)
![Full Document Context View](reports/visual_evidence/full_case_67_forged_doc_04.png)

### Document ID: 71
#### Filename: forged_doc_01.pdf
##### Reason: Altered land metric pasted into statutory instrument; graphics design editor footprint found in metadata.
##### Code Location: backend/app/services/gemini_service.py:analyze_forensics (Line 135)
##### Rule Citation: AICTE Approval Process Handbook (APH) Chapter 1, Norms for Land & Title Verification

![Cropped Flagged Area Evidence](reports/visual_evidence/crop_case_71_forged_doc_01.png)
![Full Document Context View](reports/visual_evidence/full_case_71_forged_doc_01.png)

### Document ID: 74
#### Filename: forged_doc_14.pdf
##### Reason: Altered land metric pasted into statutory instrument; graphics design editor footprint found in metadata.
##### Code Location: backend/app/services/gemini_service.py:analyze_forensics (Line 135)
##### Rule Citation: AICTE Approval Process Handbook (APH) Chapter 1, Norms for Land & Title Verification

![Cropped Flagged Area Evidence](reports/visual_evidence/crop_case_74_forged_doc_14.png)
![Full Document Context View](reports/visual_evidence/full_case_74_forged_doc_14.png)

## Human Reviewer Recommendations
### Acceptance: 
- The flagged documents need to be reviewed and verified for accuracy.
- If the discrepancies are found, they should be rectified according to the guidelines provided in the AICTE Approval Process Handbook (APH) Chapter 1.

### Rectification:
- Investigate the source of the altered land metric pasted into statutory instruments.
- Ensure that all documents used in the verification process are accurate and up-to-date.
- Implement stricter controls over graphics design editors to prevent such alterations from occurring.

### Refer to Vigilance Committee:
- The flagged documents should be referred to the vigilance committee for further investigation and action.
- The committee will provide expert guidance on how to rectify the issues identified in the flagged documents.

## Conclusion
The audit has highlighted several instances where land metrics have been altered, indicating a need for enhanced controls over document verification processes. Immediate attention is required to ensure accuracy and compliance with AICTE guidelines.
```

---

## 4. Human Reviewer Checkpoint & Decision Sign-Off

| Scrutiny Check | Engine Finding | Human Officer Verification | Action Required |
| :--- | :--- | :--- | :--- |
| **Land Holding Legitimacy** | 99.5 Acres claimed vs 7.5 Acres baseline | [ ] Confirmed Forgery &nbsp; [ ] Clarification | Issue Show-Cause Notice |
| **Metadata Integrity** | Canva/Photoshop tool signatures detected | [ ] Confirmed Tampering &nbsp; [ ] False Alarm | Request Original Physical Deed |
| **Faculty-Student Ratio** | 420 Intake / 32 Verified Faculty | [ ] Verified Deficient &nbsp; [ ] Compliant | Comply with SFR 1:20 norm |

**Audited By:** TRACE Autonomous Compliance Engine  
**Model Runtime:** Ollama Local LLM (`qwen2.5:1.5b-instruct`)  
**Date of Audit:** October 27, 2026  
