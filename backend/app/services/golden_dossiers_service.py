"""Golden Statutory Dossiers & Jury Evaluation Seeder (SIH26261 PRD §6).
Generates real, cryptographically encrypted PDF documents with authentic metadata,
issuing-authority URNs, digital signature headers, and architectural layout specs
across 4 canonical SIH26261 evaluation scenarios:

1. Dossier A (AICTE-2026-EOA-GOLD-A): 100% Compliant Extension of Approval (EoA)
2. Dossier B (AICTE-2026-NEW-GOLD-B): Tampered Land Deed (Canva/Photoshop metadata + Bhulekh Acreage Mismatch)
3. Dossier C (AICTE-2026-INC-GOLD-C): Ghost Faculty Recycling & SFR 1:20 Violation + Undersized Lab Floor Plan
4. Dossier D (AICTE-2026-EOA-GOLD-D): Expired Fire Safety NOC Ready for Live Rectification Demo
"""

import hashlib
import logging
from pathlib import Path
from typing import Any, Dict, List

import pymupdf
from sqlmodel import Session, select

from app.config import settings
from app.models.enums import ApplicationCategory, ApplicationStatus, DocumentType, VerificationStatus
from app.models.models import Application, ChecklistRule, Document, Institution, User
from app.services.document_storage import encrypt_document
from app.services.verification_services import verification_service

logger = logging.getLogger(__name__)


def _build_pdf_bytes(
    title: str,
    lines: List[str],
    creator: str = "NIC e-Office Official PDF Producer v4.2",
    producer: str = "Govt of India CCA PKCS#7 Signer",
    tamper_mod_date: bool = False,
) -> bytes:
    """Generates a genuine multi-line PDF buffer using PyMuPDF with custom metadata."""
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)

    # Header banner
    page.draw_rect(pymupdf.Rect(36, 30, 559, 80), color=(0.08, 0.20, 0.45), fill=(0.08, 0.20, 0.45))
    page.insert_text((48, 52), "GOVERNMENT OF INDIA / STATUTORY REGULATORY RECORD", fontsize=11, color=(1, 1, 1))
    page.insert_text((48, 69), title, fontsize=13, color=(0.95, 0.85, 0.35))

    y = 110
    for line in lines:
        page.insert_text((48, y), line, fontsize=10.5, color=(0.1, 0.1, 0.1))
        y += 20

    # Footer
    page.draw_line(pymupdf.Point(48, 770), pymupdf.Point(547, 770), color=(0.6, 0.6, 0.6))
    page.insert_text(
        (48, 790),
        "Digitally Signed by: NIC Certifying Authority (CCA India) | Verification URL: https://aicte-india.org/verify",
        fontsize=8.5,
        color=(0.2, 0.4, 0.2),
    )

    c_date = "D:20260115100000+05'30'"
    m_date = "D:20260322234510+05'30'" if tamper_mod_date else c_date
    doc.set_metadata({
        "title": title,
        "author": "Authorized Statutory Issuing Authority",
        "subject": "AICTE SIH26261 Statutory Document",
        "creator": creator,
        "producer": producer,
        "creationDate": c_date,
        "modDate": m_date,
    })

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def _attach_pdf_to_application(
    session: Session,
    app_obj: Application,
    doc_type: DocumentType,
    filename: str,
    title: str,
    lines: List[str],
    creator: str = "NIC e-Office Official PDF Producer v4.2",
    producer: str = "Govt of India CCA PKCS#7 Signer",
    tamper_mod_date: bool = False,
) -> Document:
    pdf_bytes = _build_pdf_bytes(title, lines, creator=creator, producer=producer, tamper_mod_date=tamper_mod_date)
    sha256 = hashlib.sha256(pdf_bytes).hexdigest()
    encrypted = encrypt_document(pdf_bytes, app_obj.id)

    save_dir = settings.UPLOAD_DIR / f"app_{app_obj.id}"
    save_dir.mkdir(parents=True, exist_ok=True)
    target_path = save_dir / filename
    target_path.write_bytes(encrypted)

    doc = Document(
        application_id=app_obj.id,
        document_type=doc_type,
        filename=filename,
        file_path=str(target_path),
        mime_type="application/pdf",
        file_size_bytes=len(pdf_bytes),
        sha256_hash=sha256,
        verification_status=VerificationStatus.PENDING,
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return doc


def seed_golden_dossiers(session: Session) -> Dict[str, Any]:
    """
    Idempotently seeds the 4 Golden Statutory Dossiers and runs full verification on them
    so the dashboard, review queue, authority hub, and rectification workspace are immediately populated.
    """
    existing_gold = session.exec(
        select(Application).where(Application.application_number == "AICTE-2026-EOA-GOLD-A")
    ).first()
    if existing_gold:
        return {"status": "ALREADY_SEEDED", "message": "Golden dossiers already present in database."}

    inst = session.exec(select(Institution).where(Institution.aicte_permanent_id == "1-4928173650")).first()
    applicant = session.exec(select(User).where(User.email == "applicant@apexedu.ac.in")).first()
    if not inst or not applicant:
        return {"status": "SKIPPED", "message": "Base institution or applicant user not found."}

    # Ensure additional checklist rules exist for LAND_OWNERSHIP_DOCUMENT and FACULTY_ROSTER
    existing_land_rule = session.exec(
        select(ChecklistRule).where(ChecklistRule.document_type == DocumentType.LAND_OWNERSHIP_DOCUMENT)
    ).first()
    if not existing_land_rule:
        session.add(
            ChecklistRule(
                handbook_year="2026-27",
                category=ApplicationCategory.NEW_INSTITUTION,
                document_type=DocumentType.LAND_OWNERSHIP_DOCUMENT,
                rule_name="State Revenue 7/12 Land Ownership & Non-Encumbrance Deed",
                description="Verifies contiguous land ownership and acreage against State Bhulekh Revenue Registry.",
                is_mandatory=True,
                check_expiry=False,
                required_fields=["institution_name", "document_id_or_number", "land_area_acres"],
                consistency_targets={"land_area_acres": "land_area_acres"},
            )
        )
        session.add(
            ChecklistRule(
                handbook_year="2026-27",
                category=ApplicationCategory.INTAKE_INCREASE,
                document_type=DocumentType.FACULTY_ROSTER,
                rule_name="Certified Faculty Roster & SFR 1:20 Compliance Statement",
                description="Verifies teacher headcount, cadre ratio, and checks AICTE National Faculty Portal for duplicate PANs.",
                is_mandatory=True,
                check_expiry=False,
                required_fields=["institution_name", "total_faculty_count"],
                consistency_targets={},
            )
        )
        session.commit()

    created_apps: List[Dict[str, Any]] = []

    # =========================================================================
    # DOSSIER A: 100% Compliant Extension of Approval (EoA)
    # =========================================================================
    app_a = Application(
        application_number="AICTE-2026-EOA-GOLD-A",
        institution_id=inst.id,
        submitted_by_user_id=applicant.id,
        academic_year="2026-27",
        status=ApplicationStatus.SUBMITTED,
        category=ApplicationCategory.EOA,
        declared_data={
            "dossier_title": "Golden Dossier A: 100% Compliant EoA Renewal",
            "requested_intake": 420,
            "approved_intake_total": 420,
            "land_area_acres": 7.5,
            "built_up_area_sqm": 14800,
            "total_faculty_count": 32,
            "ter_payment_status": "PAID (UTR: SBI2026030199281)",
        },
    )
    session.add(app_a)
    session.commit()
    session.refresh(app_a)

    _attach_pdf_to_application(
        session,
        app_a,
        DocumentType.AFFIDAVIT,
        "affidavit_shcil_verified.pdf",
        "SWORN AFFIDAVIT-2 ON SHCIL E-STAMP PAPER",
        [
            "Institution Name: Apex Institute of Engineering and Technology",
            "AICTE Permanent ID: 1-4928173650",
            "Stamp Paper No: IN-MH884920192831P",
            "Issuing Authority: Stock Holding Corporation of India (SHCIL e-Stamp / DigiLocker)",
            "Deponent Name: Dr. Rajesh Kulkarni",
            "Issue Date: 2026-03-01",
            "Declaration: All norms of AICTE Approval Process Handbook 2026-27 are strictly satisfied.",
            "Digitally Signed by: SHCIL DigiLocker Verification Authority",
        ],
    )
    _attach_pdf_to_application(
        session,
        app_a,
        DocumentType.FIRE_SAFETY_CERTIFICATE,
        "fire_safety_noc_2026_valid.pdf",
        "DIRECTORATE OF MAHARASHTRA FIRE SERVICES - FINAL NOC",
        [
            "Institution Name: Apex Institute of Engineering and Technology",
            "Certificate No: MH-FIRE-2026-8821",
            "Issuing Authority: Directorate of Maharashtra Fire Services",
            "Issue Date: 2026-01-15",
            "Expiry Date: 2027-01-14",
            "Building Area: 14800 sqm",
            "Fire Hydrants & Emergency Exits: Operational and Tested",
            "Digitally Signed by: Chief Fire Officer Pune Division",
        ],
    )
    _attach_pdf_to_application(
        session,
        app_a,
        DocumentType.PREVIOUS_EOA_LETTER,
        "previous_eoa_2025_26.pdf",
        "AICTE EXTENSION OF APPROVAL (EoA) LETTER 2025-26",
        [
            "Institution Name: Apex Institute of Engineering and Technology",
            "AICTE Permanent ID: 1-4928173650",
            "EoA Reference: F.No. Western/1-4928173650/2025/EOA",
            "Issuing Authority: All India Council for Technical Education",
            "Issue Date: 2025-05-10",
            "Approved Intake Total: 420",
            "Digitally Signed by: Member Secretary AICTE",
        ],
    )
    _attach_pdf_to_application(
        session,
        app_a,
        DocumentType.INFRASTRUCTURE_EVIDENCE,
        "approved_architectural_floor_plan.pdf",
        "CERTIFIED ARCHITECTURAL FLOOR PLAN & BARRIER-FREE COMPLIANCE",
        [
            "Institution Name: Apex Institute of Engineering and Technology",
            "Total Built-Up Area: 14800 sqm",
            "Classrooms Count: 18",
            "Laboratories Count: 12",
            "Classroom 101: 72 sqm | Classroom 102: 70 sqm | Computer Lab 1: 85 sqm",
            "Accessibility: Barrier-free Ramp (1:12 gradient), Divyangjan Lift & Accessible Restrooms installed",
            "Fire Safety: Dual Emergency Exit Staircases & Pressurized Hydrant Risers",
            "Digitally Signed by: Chartered Structural Engineer",
        ],
    )
    verification_service.verify_entire_application(session, app_a.id)
    created_apps.append({"id": app_a.id, "number": app_a.application_number})

    # =========================================================================
    # DOSSIER B: Tampered Land Deed (Canva/Photoshop + Bhulekh Acreage Mismatch)
    # =========================================================================
    app_b = Application(
        application_number="AICTE-2026-NEW-GOLD-B",
        institution_id=inst.id,
        submitted_by_user_id=applicant.id,
        academic_year="2026-27",
        status=ApplicationStatus.SUBMITTED,
        category=ApplicationCategory.NEW_INSTITUTION,
        declared_data={
            "dossier_title": "Golden Dossier B: Tampered Land Deed & State Bhulekh Discrepancy",
            "requested_intake": 360,
            "land_area_acres": 12.0,
            "built_up_area_sqm": 14800,
        },
    )
    session.add(app_b)
    session.commit()
    session.refresh(app_b)

    _attach_pdf_to_application(
        session,
        app_b,
        DocumentType.LAND_OWNERSHIP_DOCUMENT,
        "tampered_land_deed_canva.pdf",
        "7/12 LAND OWNERSHIP EXTRACT (REVENUE RECORD)",
        [
            "Institution Name: Apex Institute of Engineering and Technology",
            "Survey No: SURVEY-99-TAMPERED",
            "Issuing Authority: Maharashtra Revenue Department",
            "Issue Date: 2026-01-05",
            "Total Land Area: 12.0 Acres (Altered from 2.5 Acres in graphic editor)",
            "Land Use: Institutional Campus",
        ],
        creator="Canva PDF Editor / Adobe Photoshop 2025",
        producer="iLovePDF / Canva Graphic Suite",
        tamper_mod_date=True,
    )
    verification_service.verify_entire_application(session, app_b.id)
    created_apps.append({"id": app_b.id, "number": app_b.application_number})

    # =========================================================================
    # DOSSIER C: Ghost Faculty Recycling & Undersized Lab Floor Plan (EVC Trigger)
    # =========================================================================
    app_c = Application(
        application_number="AICTE-2026-INC-GOLD-C",
        institution_id=inst.id,
        submitted_by_user_id=applicant.id,
        academic_year="2026-27",
        status=ApplicationStatus.SUBMITTED,
        category=ApplicationCategory.INTAKE_INCREASE,
        declared_data={
            "dossier_title": "Golden Dossier C: Ghost Faculty PAN Duplication & SFR 1:30 Deficit",
            "requested_intake": 420,
            "total_approved_intake": 420,
            "land_area_acres": 7.5,
            "built_up_area_sqm": 14800,
        },
    )
    session.add(app_c)
    session.commit()
    session.refresh(app_c)

    _attach_pdf_to_application(
        session,
        app_c,
        DocumentType.FACULTY_ROSTER,
        "faculty_roster_ghost_duplicates.pdf",
        "INSTITUTIONAL FACULTY ROSTER & PAN REGISTRY SUBMISSION",
        [
            "Institution Name: Apex Institute of Engineering and Technology",
            "Certificate No: ROSTER-GHOST-DUPLICATE",
            "Issuing Authority: AICTE National Faculty Portal",
            "Issue Date: 2026-02-20",
            "Total Faculty Count: 14",
            "Faculty PAN List: ABCDE1234F, PQRST5678G, LMNOP9012H, XYZAB3456C",
        ],
    )
    _attach_pdf_to_application(
        session,
        app_c,
        DocumentType.INFRASTRUCTURE_EVIDENCE,
        "undersized_laboratory_floorplan.pdf",
        "PROPOSED EXPANSION FLOOR PLAN (BLOCK-C)",
        [
            "Institution Name: Apex Institute of Engineering and Technology",
            "Total Built-Up Area: 9200 sqm",
            "Classrooms Count: 8",
            "Laboratories Count: 3",
            "Classroom 201: 52 sqm | Computer Lab 2: 44 sqm",
            "Note: No lift or wheelchair ramp constructed in Block-C yet.",
        ],
    )
    verification_service.verify_entire_application(session, app_c.id)
    created_apps.append({"id": app_c.id, "number": app_c.application_number})

    # =========================================================================
    # DOSSIER D: Expired Fire Safety NOC (Ready for 1-Click Rectification Demo)
    # =========================================================================
    app_d = Application(
        application_number="AICTE-2026-EOA-GOLD-D",
        institution_id=inst.id,
        submitted_by_user_id=applicant.id,
        academic_year="2026-27",
        status=ApplicationStatus.SUBMITTED,
        category=ApplicationCategory.EOA,
        declared_data={
            "dossier_title": "Golden Dossier D: Expired Fire Safety NOC (Rectification Workflow Demo)",
            "requested_intake": 420,
            "approved_intake_total": 420,
            "land_area_acres": 7.5,
            "built_up_area_sqm": 14800,
        },
    )
    session.add(app_d)
    session.commit()
    session.refresh(app_d)

    _attach_pdf_to_application(
        session,
        app_d,
        DocumentType.AFFIDAVIT,
        "affidavit_d_valid.pdf",
        "SWORN AFFIDAVIT-2 ON SHCIL E-STAMP PAPER",
        [
            "Institution Name: Apex Institute of Engineering and Technology",
            "AICTE Permanent ID: 1-4928173650",
            "Stamp Paper No: IN-MH884920192831P",
            "Issuing Authority: Stock Holding Corporation of India (SHCIL e-Stamp / DigiLocker)",
            "Deponent Name: Dr. Rajesh Kulkarni",
            "Issue Date: 2026-03-01",
            "Digitally Signed by: SHCIL DigiLocker Verification Authority",
        ],
    )
    _attach_pdf_to_application(
        session,
        app_d,
        DocumentType.FIRE_SAFETY_CERTIFICATE,
        "fire_safety_noc_2024_expired.pdf",
        "DIRECTORATE OF MAHARASHTRA FIRE SERVICES - EXPIRED NOC",
        [
            "Institution Name: Apex Institute of Engineering and Technology",
            "Certificate No: MH-FIRE-2024-1109",
            "Issuing Authority: Directorate of Maharashtra Fire Services",
            "Issue Date: 2024-01-10",
            "Expiry Date: 2025-01-09",
            "Building Area: 14800 sqm",
        ],
    )
    _attach_pdf_to_application(
        session,
        app_d,
        DocumentType.PREVIOUS_EOA_LETTER,
        "previous_eoa_d_valid.pdf",
        "AICTE EXTENSION OF APPROVAL (EoA) LETTER 2025-26",
        [
            "Institution Name: Apex Institute of Engineering and Technology",
            "AICTE Permanent ID: 1-4928173650",
            "EoA Reference: F.No. Western/1-4928173650/2025/EOA",
            "Issuing Authority: All India Council for Technical Education",
            "Issue Date: 2025-05-10",
            "Approved Intake Total: 420",
            "Digitally Signed by: Member Secretary AICTE",
        ],
    )
    _attach_pdf_to_application(
        session,
        app_d,
        DocumentType.INFRASTRUCTURE_EVIDENCE,
        "infra_plan_d_valid.pdf",
        "CERTIFIED ARCHITECTURAL FLOOR PLAN",
        [
            "Institution Name: Apex Institute of Engineering and Technology",
            "Total Built-Up Area: 14800 sqm",
            "Classrooms Count: 18",
            "Laboratories Count: 12",
            "Classroom 101: 72 sqm | Computer Lab 1: 85 sqm",
            "Accessibility: Barrier-free Ramp, Divyangjan Lift & Fire Exit Staircases installed",
            "Digitally Signed by: Chartered Structural Engineer",
        ],
    )
    verification_service.verify_entire_application(session, app_d.id)
    app_d.status = ApplicationStatus.RECTIFICATION_REQUESTED
    session.add(app_d)
    session.commit()
    created_apps.append({"id": app_d.id, "number": app_d.application_number})

    return {
        "status": "SEEDED",
        "golden_dossiers": created_apps,
    }
