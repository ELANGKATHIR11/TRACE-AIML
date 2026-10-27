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

from app.models.enums import ApplicationStatus, DocumentType, FlagCategory, FlagSeverity, VerificationStatus
from app.models.models import Application, ChecklistRule, Document, Institution, ValidationFlag
from app.services.audit_service import audit_service
from app.services.AI_service import gemini_service
from app.services.issuing_authority_hub import issuing_authority_hub
from app.services.multi_source_ingestion import multi_source_ingestion
from app.services.ocr_service import ocr_service
from app.services.production_security import production_security
from app.services.rules_engine import rules_engine

logger = logging.getLogger(__name__)


class VerificationService:
    def process_document(self, db: Session, document: Document) -> Dict[str, Any]:
        """Execute full parsing, OCR, field extraction, issuing-authority check, and forensics on an uploaded document."""
        file_path = Path(document.file_path)
        if not file_path.exists():
            document.verification_status = VerificationStatus.MANUAL_REVIEW_REQUIRED
            document.verification_details = {"error": f"File not found on server: {document.file_path}"}
            db.add(document)
            db.commit()
            return {"error": "File missing"}

        # Read decrypted bytes for authority & CV inspection
        raw_bytes = file_path.read_bytes()
        is_magic = raw_bytes.startswith(b"%PDF-") or raw_bytes.startswith(b"\x89PNG") or raw_bytes.startswith(b"\xff\xd8")
        if not is_magic:
            try:
                raw_bytes = production_security.decrypt_file_data(
                    raw_bytes, associated_metadata=f"APP-{document.application_id}"
                )
            except Exception:
                pass

        # 1. OCR & Structural Extraction (with transparent decryption if encrypted)
        ocr_result = ocr_service.extract_document(file_path, app_id=document.application_id)
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
        if file_path.suffix.lower() in [".png", ".jpg", ".jpeg"]:
            try:
                from app.services.image_forensics_service import image_forensics
                ela_res = image_forensics.perform_error_level_analysis(file_path)
                forensics["ela_analysis"] = ela_res
                if ela_res.get("tamper_detected_by_ela"):
                    forensics["is_tampering_suspected"] = True
                    forensics.setdefault("anomalies_detected", []).append(
                        f"ELA Anomaly: {ela_res['reason']} (StdErr={ela_res['std_compression_error']})"
                    )
            except Exception as e:
                logger.warning(f"ELA analysis skipped: {e}")

        # Fetch Application & Institution context
        app_obj = db.get(Application, document.application_id)
        inst_obj = db.get(Institution, app_obj.institution_id) if app_obj else None
        declared_data = app_obj.declared_data if app_obj else {}
        historical_records = inst_obj.historical_records if inst_obj else {}

        # 4. Issuing Authority Verification Hub (PRD §4.3)
        authority_result = issuing_authority_hub.verify_document_with_authority(
            document_type=document.document_type,
            extracted_fields=extracted,
            raw_ocr_text=document.raw_ocr_text or "",
            file_bytes=raw_bytes,
            declared_data=declared_data,
        )
        if authority_result.get("urn_checked") and not document.document_urn_or_id:
            document.document_urn_or_id = authority_result["urn_checked"]
        if authority_result.get("authority_source") and not document.issuing_authority:
            document.issuing_authority = authority_result["authority_source"]

        # 5. Infrastructure Computer Vision & Floor Plan Analysis (PRD §4.4)
        infra_analysis = None
        if document.document_type in (DocumentType.INFRASTRUCTURE_EVIDENCE, DocumentType.BUILDING_PLAN_CERTIFICATE):
            infra_analysis = multi_source_ingestion.ingest_stream_3_infrastructure_media(
                file_bytes=raw_bytes,
                filename=document.filename,
                raw_ocr_text=document.raw_ocr_text or "",
            )

        document.verification_details = {
            "forensics": forensics,
            "authority_verification": authority_result,
            "infrastructure_analysis": infra_analysis,
            "page_count": ocr_result.get("total_pages", 1),
            "fonts": ocr_result.get("fonts", []),
            "is_scanned": ocr_result.get("is_scanned", False),
        }

        # Clear old flags for this document before re-evaluation
        old_flags = db.exec(select(ValidationFlag).where(ValidationFlag.document_id == document.id)).all()
        for f in old_flags:
            db.delete(f)

        total_flags_created = 0

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
                total_flags_created += 1

        # Flag Issuing Authority discrepancies
        for af in authority_result.get("flags", []):
            flag = ValidationFlag(
                application_id=document.application_id,
                document_id=document.id,
                flag_category=af["category"],
                severity=af["severity"],
                field_name=af.get("field_name"),
                reason=af["reason"],
                evidence_snippet=af.get("evidence"),
                is_advisory=True,
            )
            db.add(flag)
            total_flags_created += 1

        # Flag Infrastructure CV / Floor Plan discrepancies
        if infra_analysis:
            for inf_flag in infra_analysis.get("flags", []):
                flag = ValidationFlag(
                    application_id=document.application_id,
                    document_id=document.id,
                    flag_category=inf_flag["category"],
                    severity=inf_flag["severity"],
                    field_name=inf_flag.get("field_name"),
                    reason=inf_flag["reason"],
                    evidence_snippet=inf_flag.get("evidence"),
                    is_advisory=True,
                )
                db.add(flag)
                total_flags_created += 1

        # 6. Evaluate Document-Level Checklist Rules
        active_rules = db.exec(select(ChecklistRule).where(ChecklistRule.is_active == True)).all()
        rule_flags = rules_engine.evaluate_document_rules(
            document,
            active_rules,
            declared_data,
            historical_records=historical_records,
            institution_obj=inst_obj,
        )

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
            total_flags_created += 1

        # Set canonical 6-state VerificationStatus per PRD §4.3
        auth_status: VerificationStatus = authority_result["verification_status"]
        has_expired_rule = any(rf["category"] == FlagCategory.EXPIRED_DOCUMENT for rf in rule_flags)
        has_critical_rule = any(rf["severity"] == FlagSeverity.CRITICAL for rf in rule_flags)

        if auth_status == VerificationStatus.EXPIRED or has_expired_rule:
            document.verification_status = VerificationStatus.EXPIRED
        elif auth_status == VerificationStatus.SOURCE_UNAVAILABLE:
            document.verification_status = VerificationStatus.SOURCE_UNAVAILABLE
        elif forensics.get("is_tampering_suspected") or auth_status == VerificationStatus.MISMATCH or has_critical_rule:
            document.verification_status = VerificationStatus.MISMATCH
        elif auth_status == VerificationStatus.MANUAL_REVIEW_REQUIRED:
            document.verification_status = VerificationStatus.MANUAL_REVIEW_REQUIRED
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
            details={
                "status": document.verification_status.value,
                "authority_source": authority_result.get("authority_source"),
                "urn_checked": authority_result.get("urn_checked"),
                "flags_generated": total_flags_created,
            },
        )

        return {
            "document_id": document.id,
            "status": document.verification_status.value,
            "extracted_fields": document.extracted_fields,
            "authority_verification": authority_result,
            "infrastructure_analysis": infra_analysis,
            "forensics": forensics,
            "flags_count": total_flags_created,
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

        # Clear old application-level flags (where document_id is None) before re-evaluation
        old_app_flags = db.exec(
            select(ValidationFlag)
            .where(ValidationFlag.application_id == application_id)
            .where(ValidationFlag.document_id == None)  # noqa: E711
        ).all()
        for of in old_app_flags:
            db.delete(of)

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
        db.commit()

        # Include all document-level and application-level flags in summary
        all_app_flags = db.exec(
            select(ValidationFlag).where(ValidationFlag.application_id == application_id)
        ).all()
        has_doc_critical_or_mismatch = any(
            d.verification_status in (VerificationStatus.MISMATCH, VerificationStatus.EXPIRED)
            for d in documents
        ) or any(f.severity == FlagSeverity.CRITICAL for f in all_app_flags)

        # Compile EVC Physical Inspection Checklist across infrastructure documents
        evc_items: List[str] = []
        for d in documents:
            infra_info = (d.verification_details or {}).get("infrastructure_analysis")
            if infra_info and infra_info.get("evc_checklist"):
                evc_items.extend(infra_info["evc_checklist"])

        compliance["total_flags_including_documents"] = len(all_app_flags)
        compliance["evc_physical_inspection_required"] = has_doc_critical_or_mismatch or len(evc_items) > 1
        compliance["evc_inspection_checklist"] = list(dict.fromkeys(evc_items))

        # Update application validation summary and state
        if has_doc_critical_or_mismatch or compliance["overall_status"] == "NON_COMPLIANT_CRITICAL_DEFICITS":
            compliance["overall_status"] = "NON_COMPLIANT_CRITICAL_DEFICITS"
            application.status = ApplicationStatus.DEFICIENCY_FLAGGED
        elif compliance["overall_status"] == "FULLY_COMPLIANT" and len(all_app_flags) == 0:
            application.status = ApplicationStatus.READY_FOR_REVIEW
        else:
            application.status = ApplicationStatus.READY_FOR_REVIEW
        application.validation_summary = compliance

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
