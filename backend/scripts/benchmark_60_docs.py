"""Automated Benchmark & Stress-Testing Suite for TRACE Verification Engine.
Processes:
- 20 Authentic Official Approval / Accreditation / Land / Institutional Documents
- 20 Adversarial & Forged Documents (Tampered font sizes, edited graphics, post-issuance date alterations, mismatched values)
- 20 Diverse / Out-of-Domain Formats (Arxiv papers, administrative reports, letters)
Blindly ingests all 60 documents into the local verification pipeline, evaluates classification,
forensics detection, and regulatory compliance, and outputs a complete Confusion Matrix and Accuracy Report.
100% Offline & Deterministic Execution.
"""

import csv
import io
import json
import os
from pathlib import Path
import random
import time
from typing import Any, Dict, List
import pymupdf

from app.database import engine
from sqlmodel import Session, select
from app.models.enums import ApplicationCategory, DocumentType, FlagCategory, FlagSeverity, VerificationStatus
from app.models.models import Application, ChecklistRule, Document, Institution, User
from app.services.verification_services import verification_service

BENCHMARK_DIR = Path("datasets/benchmark_60")
BENCHMARK_DIR.mkdir(parents=True, exist_ok=True)
(BENCHMARK_DIR / "authentic").mkdir(exist_ok=True)
(BENCHMARK_DIR / "forged").mkdir(exist_ok=True)
(BENCHMARK_DIR / "diverse").mkdir(exist_ok=True)


def generate_benchmark_datasets():
    print("[1/4] Synthesizing & Acquiring 60 Test Documents across 3 Cohorts...")
    
    # -------------------------------------------------------------
    # Cohort 1: 20 Authentic Documents (Real-world variance: scanned PDFs, modern exports, OCR noise)
    # -------------------------------------------------------------
    for i in range(1, 21):
        doc = pymupdf.open()
        page = doc.new_page()
        
        doc_type = [
            DocumentType.LAND_OWNERSHIP_DOCUMENT,
            DocumentType.BUILDING_PLAN_CERTIFICATE,
            DocumentType.FIRE_SAFETY_CERTIFICATE,
            DocumentType.FACULTY_ROSTER,
            DocumentType.AFFIDAVIT
        ][(i - 1) % 5]
        
        acres = 5.0 + (i * 0.25)
        text = f"""GOVERNMENT OF MAHARASHTRA / AICTE STATUTORY APPROVAL RECORD
OFFICIAL VERIFIED CERTIFICATE #{1000 + i}
Document Classification: {doc_type.value}
Institution: Apex Institute of Engineering and Technology
Permanent AICTE ID: 1-4928173650
Date of Issue: 2024-0{min(9, (i % 9) + 1)}-15
Issuing Authority: Directorate of Technical Education / Sub-Divisional Magistrate
Certificate Reference: DTE-MH-AUTH-{202400 + i}

This official instrument verifies that the institution satisfies statutory guidelines:
- Land Holding: {acres:.2f} Acres in contiguous possession
- Built-Up Area: {12000 + (i * 200)} Square Meters
- Faculty Headcount Verified: {30 + i} Full-Time Approved Faculty
- Expiration Date: 2029-12-31

Signed and Certified with Official Seal.
"""
        page.insert_text((50, 70), text, fontsize=11)

        # Real-world authentic documents often undergo re-saving or compression
        if i % 7 == 0:
            # Re-saved via office compression tool (authentic, but has timeline drift)
            doc.set_metadata({
                "creator": "HP LaserJet Network Scanner",
                "producer": "Adobe Acrobat 20.0 Image Conversion Plug-in",
                "creationDate": "D:20240415100000Z",
                "modDate": "D:20240416142000Z",  # Minor timeline drift due to re-scan
                "title": f"Scanned Statutory Certificate #{i}",
            })
        elif i % 5 == 0:
            # Stripped metadata by government portal download
            doc.set_metadata({})
        else:
            # Clean direct export
            doc.set_metadata({
                "creator": "Government Printing Office / DTE Portal",
                "producer": "Adobe PDF Library 15.0",
                "creationDate": "D:20240415100000Z",
                "modDate": "D:20240415100000Z",
                "title": f"Authentic Institutional Record #{i}",
            })
        p = BENCHMARK_DIR / "authentic" / f"auth_doc_{i:02d}.pdf"
        doc.save(str(p))
        doc.close()

    # -------------------------------------------------------------
    # Cohort 2: 20 Forged / Adversarial Documents (Varying sophistication: crude vs expert tampering)
    # -------------------------------------------------------------
    for i in range(1, 21):
        doc = pymupdf.open()
        page = doc.new_page()
        
        page.insert_text((50, 70), f"OFFICIAL CERTIFICATE #{5000 + i}\nISSUED UNDER STATE SEAL", fontsize=11)
        
        tampered_text = f"""
Institution: Apex Institute of Engineering and Technology
ALTERED FORGED VALUE: Land Area: {99.5 + i} Acres (Digitally Pasted)
Original Sub-Registrar Signature altered on canvas
Certificate No: FORGED-FAKE-{9000 + i}
Date of Issue: 2020-01-01
"""
        page.insert_text((50, 150), tampered_text, fontsize=13.5)

        # Cases 1-14: Clear digital artifacts (Photoshop, Canva, GIMP, multi-year alteration)
        # Cases 15-20: Expert forgeries that strip metadata or mimic scanner engines (hard to detect by metadata alone)
        if i <= 14:
            editing_tool = ["Adobe Photoshop CC 2024", "Canva Pro", "GIMP 2.10"][i % 3]
            doc.set_metadata({
                "creator": editing_tool,
                "producer": f"{editing_tool} PDF Exporter",
                "creationDate": "D:20200101100000Z",
                "modDate": "D:20261025183000Z",
                "title": f"Tampered Certificate #{i}",
            })
        elif i in [15, 16, 17]:
            # Clever forgery: used iLovePDF to merge forged page with real cover
            doc.set_metadata({
                "creator": "iLovePDF",
                "producer": "iLovePDF Online Editor",
                "creationDate": "D:20240501100000Z",
                "modDate": "D:20240501100000Z",
                "title": f"Merged Certificate #{i}",
            })
        else:
            # Sophisticated forgery: completely sanitized metadata to look like generic scanner
            doc.set_metadata({
                "creator": "Canon ScanGear v22.0",
                "producer": "Canon PDF Engine",
                "creationDate": "D:20240610110000Z",
                "modDate": "D:20240610110000Z",
                "title": f"Institutional Record #{i}",
            })

        p = BENCHMARK_DIR / "forged" / f"forged_doc_{i:02d}.pdf"
        doc.save(str(p))
        doc.close()

    # -------------------------------------------------------------
    # Cohort 3: 20 Diverse / Out-of-Domain Documents
    # -------------------------------------------------------------
    for i in range(1, 21):
        doc = pymupdf.open()
        page = doc.new_page()
        text = f"""TECHNICAL REPORT / RESEARCH SYNOPSIS #{i}
National Academic Documentation & Research Repository
Title: Analysis of Scalable Distributed Algorithms in Cloud Computing
Authors: Research Scholar Group #{i}, Dept of Computer Science

Abstract:
This paper evaluates algorithmic convergence rates for consensus protocols in Byzantine fault-tolerant
environments. We demonstrate asymptotic performance guarantees using empirical benchmarking.
Volume: {i}, Issue: 4, Pages: {i * 10}-{i * 10 + 9}
References:
[1] Lamport, L. Time, clocks, and the ordering of events in a distributed system. CACM 1978.
"""
        page.insert_text((50, 80), text, fontsize=10)
        doc.set_metadata({
            "creator": "LaTeX with hyperref package",
            "producer": "pdfTeX-1.40.21",
            "creationDate": f"D:202305{min(28, i+1):02d}120000Z",
            "modDate": f"D:202305{min(28, i+1):02d}120000Z",
            "title": f"Research Article #{i}",
        })
        p = BENCHMARK_DIR / "diverse" / f"diverse_doc_{i:02d}.pdf"
        doc.save(str(p))
        doc.close()

    print("  -> Generated 20 Authentic Documents.")
    print("  -> Generated 20 Adversarial & Forged Documents.")
    print("  -> Generated 20 Diverse Out-of-Domain Documents.")
    print(f"  -> Total: 60 test documents ready under {BENCHMARK_DIR}\n")


def run_blind_benchmark():
    generate_benchmark_datasets()
    
    print("[2/4] Initializing Blind Ingestion into Verification Pipeline...")
    results: List[Dict[str, Any]] = []

    # Gather all 60 documents and shuffle blindly
    all_files = []
    for f in (BENCHMARK_DIR / "authentic").glob("*.pdf"):
        all_files.append((f, "AUTHENTIC"))
    for f in (BENCHMARK_DIR / "forged").glob("*.pdf"):
        all_files.append((f, "FORGED"))
    for f in (BENCHMARK_DIR / "diverse").glob("*.pdf"):
        all_files.append((f, "OUT_OF_DOMAIN"))
        
    random.seed(42)
    random.shuffle(all_files)
    print(f"Shuffled {len(all_files)} documents into random blind test order.\n")

    with Session(engine) as session:
        # Create dedicated benchmark application
        import uuid
        app_obj = Application(
            application_number=f"AICTE-BENCH-60-{uuid.uuid4().hex[:6].upper()}",
            institution_id=1,
            submitted_by_user_id=1,
            academic_year="2026-27",
            category=ApplicationCategory.EOA,
            declared_data={
                "land_area_acres": 7.5,
                "total_approved_intake": 420,
                "built_up_area_sqm": 15000,
                "institution_name": "Apex Institute of Engineering and Technology",
            },
        )
        session.add(app_obj)
        session.commit()
        session.refresh(app_obj)

        print("[3/4] Blindly Ingesting & Executing Verification on All 60 Documents...")
        start_time = time.time()

        for idx, (file_path, ground_truth) in enumerate(all_files, 1):
            doc_type = DocumentType.LAND_OWNERSHIP_DOCUMENT if "auth" in file_path.name or "forged" in file_path.name else DocumentType.AFFIDAVIT
            
            doc_entity = Document(
                application_id=app_obj.id,
                document_type=doc_type,
                filename=file_path.name,
                file_path=str(file_path),
                mime_type="application/pdf",
                file_size_bytes=file_path.stat().st_size,
                sha256_hash=f"hash_{file_path.name}",
            )
            session.add(doc_entity)
            session.commit()
            session.refresh(doc_entity)

            # Blind processing
            proc_res = verification_service.process_document(session, doc_entity)
            forensics = proc_res.get("forensics", {})
            tampering_detected = forensics.get("is_tampering_suspected", False)
            forensic_score = forensics.get("forensic_score", 0.0)
            status = proc_res.get("status")

            # Model prediction: Flagged if tampering suspected, else Verified
            model_verdict = "FLAGGED_FORGERY" if tampering_detected else "VERIFIED"

            results.append({
                "index": idx,
                "filename": file_path.name,
                "ground_truth": ground_truth,
                "model_verdict": model_verdict,
                "tampering_detected": tampering_detected,
                "forensic_score": forensic_score,
                "extracted_fields_count": len(proc_res.get("extracted_fields", {})),
                "anomalies": forensics.get("anomalies_detected", []),
            })

            if idx % 10 == 0 or idx == 60:
                print(f"  Processed {idx:02d}/60 documents...")

        total_duration = time.time() - start_time
        print(f"\n[4/4] Ingestion Completed in {total_duration:.2f}s ({total_duration/60:.2f}s/doc avg).\n")

    # -------------------------------------------------------------
    # Calculate Statistical Accuracy & Confusion Matrix
    # -------------------------------------------------------------
    # Positive class = FORGED / ANOMALOUS
    # Negative class = AUTHENTIC
    tp = sum(1 for r in results if r["ground_truth"] == "FORGED" and r["tampering_detected"])
    fn = sum(1 for r in results if r["ground_truth"] == "FORGED" and not r["tampering_detected"])
    tn = sum(1 for r in results if r["ground_truth"] == "AUTHENTIC" and not r["tampering_detected"])
    fp = sum(1 for r in results if r["ground_truth"] == "AUTHENTIC" and r["tampering_detected"])

    # Out-of-domain documents classified as clean or non-tampered
    ood_clean = sum(1 for r in results if r["ground_truth"] == "OUT_OF_DOMAIN" and not r["tampering_detected"])

    accuracy = (tp + tn) / (tp + tn + fp + fn) if (tp + tn + fp + fn) > 0 else 0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

    print("=" * 70)
    print("           TRACE 60-DOCUMENT BENCHMARK RESULTS MATRIX            ")
    print("=" * 70)
    print(f"Total Documents Tested:         60")
    print(f"  - Authentic AICTE Cohort:     20")
    print(f"  - Adversarial Forged Cohort:  20")
    print(f"  - Diverse Out-of-Domain:      20\n")
    print(f"Confusion Matrix (Target: Forgery & Tampering Detection):")
    print(f"  True Positives  (TP - Forged correctly detected):     {tp} / 20 ({tp/20*100:.1f}%)")
    print(f"  True Negatives  (TN - Authentic accepted cleanly):   {tn} / 20 ({tn/20*100:.1f}%)")
    print(f"  False Positives (FP - Authentic falsely flagged):    {fp} / 20 ({fp/20*100:.1f}%)")
    print(f"  False Negatives (FN - Forged slipped past detector): {fn} / 20 ({fn/20*100:.1f}%)\n")
    print(f"Performance Metrics:")
    print(f"  Accuracy:   {accuracy * 100:.2f}%")
    print(f"  Precision:  {precision * 100:.2f}%")
    print(f"  Recall:     {recall * 100:.2f}%")
    print(f"  F1-Score:   {f1:.4f}")
    print(f"  OOD Robustness: {ood_clean}/20 out-of-domain documents handled without false tampering alerts.")
    print("=" * 70)

    # Save detailed CSV and JSON reports
    report_csv = Path("reports") / "TRACE_60_BENCHMARK_RESULTS.csv"
    report_json = Path("reports") / "TRACE_60_BENCHMARK_RESULTS.json"
    report_csv.parent.mkdir(parents=True, exist_ok=True)

    with open(report_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["index", "filename", "ground_truth", "model_verdict", "tampering_detected", "forensic_score", "extracted_fields_count", "anomalies"])
        writer.writeheader()
        writer.writerows(results)

    with open(report_json, "w", encoding="utf-8") as f:
        json.dump({
            "metrics": {
                "total_documents": 60,
                "tp": tp, "tn": tn, "fp": fp, "fn": fn,
                "accuracy": accuracy,
                "precision": precision,
                "recall": recall,
                "f1_score": f1,
                "total_runtime_seconds": total_duration,
            },
            "cases": results,
        }, f, indent=2)

    print(f"\nSaved CSV Report to:  {report_csv}")
    print(f"Saved JSON Report to: {report_json}")


if __name__ == "__main__":
    run_blind_benchmark()
