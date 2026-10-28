"""Orchestrated Document Verification and Validation Service.
Combines:
1. PyMuPDF OCR & layout analysis
2. Local Ollama & regex field extraction
3. Metadata forensics & forgery indicators
4. Deterministic AICTE regulatory compliance evaluation
100% Offline, no external APIs.
"""

import hashlib
import logging
from pathlib import Path
from typing import Any, Dict, List

from sqlmodel import Session, select

from app.models.enums import ApplicationStatus, FlagCategory, FlagSeverity, VerificationStatus
from app.models.models import Application, ChecklistRule, Document, ValidationFlag
from app.services.audit_service import audit_service
from app.services.document_storage import ela_on_bytes, read_document_plaintext
from app.services.AI_service import gemini_service
from app.services.ocr_service import ocr_service
from app.services.rules_engine import rules_engine

logger = logging.getLogger(__name__)


class VerificationService:
    def process_document(self, db: Session, document: Document) -> Dict[str, Any]:
        """Execute full parsing, OCR, field extraction, and forensics on an uploaded document."""
        try:
            plaintext = read_document_plaintext(document)
        except (FileNotFoundError, ValueError) as exc:
            logger.warning("Document %s unreadable: %s", document.id, type(exc).__name__)
            document.verification_status = VerificationStatus.MANUAL_REVIEW_REQUIRED
            document.verification_details = {"error": "Stored document is missing or unreadable"}
            db.add(document)
            db.commit()
            return {"error": "File missing"}

        # 1. OCR & Structural Extraction (decrypted in memory)
        ocr_result = ocr_service.extract_document_bytes(plaintext, document.filename)
        document.raw_ocr_text = ocr_result.get("full_text", "")
        document.pdf_metadata = ocr_result.get("metadata", {})

        # 2. Local Field Extraction (100% Offline)
        extracted = gemini_service.extract_fields(document.document_type, document.raw_ocr_text)
        document.extracted_fields = extracted
        if extracted.get("document_id_or_number"):
            document.document_urn_or_id = extracted["document_id_or_number"]
        if extracted.get("issue_date"):
            document.issue_date = str(extracted["issue_date"])
        if extracted.get("expiry_date"):
            document.expiry_date = str(extracted["expiry_date"])
        if extracted.get("issuing_authority"):
            document.issuing_authority = str(extracted["issuing_authority"])

        # 3. Document Forensics & Tampering Anomaly Detection
        forensics = gemini_service.analyze_forensics(
            document.pdf_metadata,
            ocr_result.get("fonts", []),
        )

        # 3b. Advanced Image Forensics (Error Level Analysis for images)
        if document.mime_type in ("image/png", "image/jpeg"):
            try:
                ela_res = ela_on_bytes(plaintext, document.mime_type)
                forensics["ela_analysis"] = ela_res
                if ela_res.get("tamper_detected_by_ela"):
                    forensics["is_tampering_suspected"] = True
                    forensics.setdefault("anomalies_detected", []).append(
                        f"ELA Anomaly: {ela_res['reason']} (StdErr={ela_res['std_compression_error']})"
                    )
            except Exception as e:
                logger.warning(f"ELA analysis skipped: {e}")

        document.verification_details = {
            "forensics": forensics,
            "page_count": ocr_result.get("total_pages", 1),
            "fonts": ocr_result.get("fonts", []),
            "is_scanned": ocr_result.get("is_scanned", False),
        }

        # Clear old flags for this document before re-evaluation
        old_flags = db.exec(select(ValidationFlag).where(ValidationFlag.document_id == document.id)).all()
        for f in old_flags:
            db.delete(f)

        # Flag tampering anomalies if detected
        if forensics.get("is_tampering_suspected"):
            for anomaly in forensics.get("anomalies_detected", []):
                flag = ValidationFlag(
                    application_id=document.application_id,
                    document_id=document.id,
                    flag_category=FlagCategory.POTENTIAL_FORGERY_OR_ALTERATION,
                    severity=FlagSeverity.HIGH,
                    reason=anomaly,
                    evidence_snippet=str(forensics.get("metadata_audited", {})),
                    is_advisory=True,
                )
                db.add(flag)

        # 4. Evaluate Document-Level Checklist Rules
        app_obj = db.get(Application, document.application_id)
        declared_data = app_obj.declared_data if app_obj else {}

        active_rules = db.exec(select(ChecklistRule).where(ChecklistRule.is_active == True)).all()
        rule_flags = rules_engine.evaluate_document_rules(document, active_rules, declared_data)

        for rf in rule_flags:
            flag = ValidationFlag(
                application_id=document.application_id,
                document_id=document.id,
                rule_id=rf.get("rule_id"),
                flag_category=rf["category"],
                severity=rf["severity"],
                field_name=rf.get("field_name"),
                reason=rf["reason"],
                evidence_snippet=rf.get("evidence"),
                is_advisory=True,
            )
            db.add(flag)

        # Set status
        if forensics.get("is_tampering_suspected") or any(rf["severity"] == FlagSeverity.CRITICAL for rf in rule_flags):
            document.verification_status = VerificationStatus.MISMATCH
        else:
            document.verification_status = VerificationStatus.VERIFIED

        db.add(document)
        db.commit()
        db.refresh(document)

        audit_service.log_action(
            db,
            action_type="DOCUMENT_VERIFIED",
            entity_type="Document",
            entity_id=str(document.id),
            summary=f"Processed {document.filename} ({document.document_type.value}): status={document.verification_status.value}",
            application_id=document.application_id,
            details={"status": document.verification_status.value, "flags_generated": len(rule_flags)},
        )

        return {
            "document_id": document.id,
            "status": document.verification_status.value,
            "extracted_fields": document.extracted_fields,
            "forensics": forensics,
            "flags_count": len(rule_flags),
        }

    def verify_entire_application(self, db: Session, application_id: int) -> Dict[str, Any]:
        """Perform cross-document consistency checks and full application regulatory compliance verification."""
        application = db.get(Application, application_id)
        if not application:
            raise ValueError(f"Application {application_id} not found")

        documents = db.exec(select(Document).where(Document.application_id == application_id)).all()
        active_rules = db.exec(select(ChecklistRule).where(ChecklistRule.is_active == True)).all()

        # Step A: Ensure all uploaded documents have been parsed
        for doc in documents:
            if doc.verification_status == VerificationStatus.PENDING or not doc.extracted_fields:
                self.process_document(db, doc)

        # Refresh documents after individual processing
        documents = db.exec(select(Document).where(Document.application_id == application_id)).all()

        # Step B: Run Multi-Document Regulatory Compliance
        compliance = rules_engine.evaluate_application_compliance(application, documents, active_rules)

        # Record cross-document flags in DB
        for flag_data in compliance.get("flags", []):
            flag = ValidationFlag(
                application_id=application_id,
                rule_id=flag_data.get("rule_id"),
                flag_category=flag_data["category"],
                severity=flag_data["severity"],
                field_name=flag_data.get("field_name"),
                reason=flag_data["reason"],
                evidence_snippet=flag_data.get("evidence"),
                is_advisory=True,
            )
            db.add(flag)

        # Update application validation summary and state
        application.validation_summary = compliance
        if compliance["overall_status"] == "FULLY_COMPLIANT":
            application.status = ApplicationStatus.READY_FOR_REVIEW
        elif compliance["overall_status"] == "NON_COMPLIANT_CRITICAL_DEFICITS":
            application.status = ApplicationStatus.DEFICIENCY_FLAGGED
        else:
            application.status = ApplicationStatus.READY_FOR_REVIEW

        db.add(application)
        db.commit()
        db.refresh(application)

        audit_service.log_action(
            db,
            action_type="APPLICATION_VALIDATION_COMPLETED",
            entity_type="Application",
            entity_id=str(application.id),
            summary=f"Validation completed for {application.application_number}: status={application.status.value}",
            application_id=application.id,
            details=compliance,
        )

        # Automatically generate default Visual AI Forensic Audit Report with highlighted screenshots
        visual_report_path = None
        visual_report_markdown = None
        try:
            from generate_visual_ai_report import build_detailed_visual_ai_report
            visual_report_path = str(build_detailed_visual_ai_report(application.id))
            if Path(visual_report_path).exists():
                visual_report_markdown = Path(visual_report_path).read_text(encoding="utf-8")
        except Exception as e:
            logger.warning(f"Could not auto-generate visual AI report: {e}")

        return {
            "application_id": application.id,
            "application_number": application.application_number,
            "status": application.status.value,
            "compliance": compliance,
            "default_ai_report_path": visual_report_path,
            "default_ai_report_markdown": visual_report_markdown,
        }


verification_service = VerificationService()
