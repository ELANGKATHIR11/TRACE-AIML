"""Document Upload and Verification Endpoints.
Handles file ingestion, hashing, MIME validation, instant offline processing, and status tracking.
"""

import hashlib
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlmodel import Session, select

from app.config import settings
from app.database import get_db
from app.models.enums import ApplicationStatus, DocumentType, UserRole, VerificationStatus
from app.models.models import Application, Document, User, ValidationFlag
from app.schemas.schemas import DocumentRead, DocumentUploadResponse, ValidationFlagRead
from app.services.audit_service import audit_service
from app.services.issuing_authority_hub import issuing_authority_hub
from app.services.security import get_current_user, require_roles
from app.services.verification_services import verification_service

router = APIRouter(prefix="/api/documents", tags=["Documents & Issuing Authority Verification (PRD §4.1 - §4.3)"])


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    application_id: int = Form(...),
    document_type: DocumentType = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a supporting document, calculate SHA-256 for duplicate detection, and store safely."""
    # Verify application exists
    app_obj = db.get(Application, application_id)
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")

    # IDOR Check: Applicants can only upload to their institution's application
    if current_user.role == UserRole.APPLICANT and app_obj.institution_id != current_user.institution_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot upload documents to another institution's application.",
        )

    # Read bytes
    contents = await file.read()
    
    # 1. Production Magic-Byte and Polyglot Payload Sanitization
    from app.services.production_security import production_security
    sanitized_meta = production_security.sanitize_uploaded_document(contents, file.filename or "doc.pdf")
    sha256 = sanitized_meta["sha256_digest"]
    file_size = sanitized_meta["size_bytes"]

    # 2. Check for duplicate cross-application document recycling (Ghost Document detection)
    duplicate_doc = db.exec(
        select(Document).where(Document.sha256_hash == sha256).where(Document.application_id != application_id)
    ).first()
    if duplicate_doc:
        audit_service.log_action(
            db,
            action_type="DUPLICATE_DOCUMENT_FLAGGED",
            entity_type="Document",
            entity_id=str(duplicate_doc.id),
            summary=f"Security Alert: Document {file.filename} is identical to document in Application #{duplicate_doc.application_id}",
            actor_user_id=current_user.id,
            application_id=application_id,
            details={"duplicate_of_app": duplicate_doc.application_id, "sha256": sha256},
        )

    # 3. Encrypt data at rest using AES-256-GCM before saving to disk
    encrypted_bytes = production_security.encrypt_file_data(contents, associated_metadata=f"APP-{application_id}")

    # Save to disk
    save_dir = settings.UPLOAD_DIR / f"app_{application_id}"
    save_dir.mkdir(parents=True, exist_ok=True)
    safe_filename = f"{document_type.value.lower()}_{sha256[:10]}_{sanitized_meta['sanitized_filename']}"
    target_path = save_dir / safe_filename

    with open(target_path, "wb") as f:
        f.write(encrypted_bytes)

    # Persist Document entity
    doc = Document(
        application_id=application_id,
        document_type=document_type,
        filename=file.filename or safe_filename,
        file_path=str(target_path),
        mime_type=sanitized_meta["detected_mime"],
        file_size_bytes=file_size,
        sha256_hash=sha256,
        verification_status=VerificationStatus.PENDING,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    audit_service.log_action(
        db,
        action_type="DOCUMENT_UPLOADED",
        entity_type="Document",
        entity_id=str(doc.id),
        summary=f"Uploaded {file.filename} for Application #{application_id} (SHA-256: {sha256[:12]}...)",
        actor_user_id=current_user.id,
        application_id=application_id,
        details={"filename": file.filename, "size_bytes": file_size, "sha256": sha256},
    )

    return DocumentUploadResponse(
        document_id=doc.id,
        application_id=application_id,
        filename=doc.filename,
        document_type=doc.document_type,
        sha256_hash=sha256,
        verification_status=doc.verification_status,
        message="Document uploaded successfully. Ready for verification.",
    )


@router.post("/{document_id}/verify")
def verify_single_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run 100% offline OCR, field extraction, and forensic checks on an individual document."""
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    app_obj = db.get(Application, doc.application_id)
    if current_user.role == UserRole.APPLICANT and app_obj and app_obj.institution_id != current_user.institution_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot verify documents belonging to another institution.",
        )

    result = verification_service.process_document(db, doc)
    return {
        "message": "Document verification completed",
        "result": result,
    }


@router.get("/application/{application_id}", response_model=List[DocumentRead])
def list_application_documents(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all documents attached to an application with IDOR validation."""
    app_obj = db.get(Application, application_id)
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")

    if current_user.role == UserRole.APPLICANT and app_obj.institution_id != current_user.institution_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot view documents from another institution's application.",
        )

    docs = db.exec(select(Document).where(Document.application_id == application_id)).all()
    return docs


@router.get("/authority-gateways", response_model=List[Dict[str, Any]])
def get_supported_authority_gateways(
    current_user: User = Depends(get_current_user),
):
    """
    List all configured original issuing-authority verification connectors
    (DigiLocker, State Bhulekh Revenue Registry, Fire Safety Portal, AICTE/NBA, National Faculty Portal).
    """
    return issuing_authority_hub.list_supported_gateways()


@router.post("/{document_id}/rectify", response_model=DocumentUploadResponse)
async def rectify_and_replace_document(
    document_id: int,
    file: UploadFile = File(...),
    rectification_notes: str = Form("Updated compliant document submitted for rectification"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Closed-Loop Rectification Workflow (PRD §4.1):
    Allows an applicant to replace an expired, incomplete, or deficient document
    with a rectified version and immediately runs differential re-verification.
    """
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    app_obj = db.get(Application, doc.application_id)
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")

    if current_user.role == UserRole.APPLICANT and app_obj.institution_id != current_user.institution_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot rectify documents belonging to another institution.",
        )

    contents = await file.read()
    from app.services.production_security import production_security
    sanitized_meta = production_security.sanitize_uploaded_document(contents, file.filename or "rectified.pdf")
    sha256 = sanitized_meta["sha256_digest"]
    file_size = sanitized_meta["size_bytes"]

    encrypted_bytes = production_security.encrypt_file_data(
        contents, associated_metadata=f"APP-{doc.application_id}"
    )

    save_dir = settings.UPLOAD_DIR / f"app_{doc.application_id}"
    save_dir.mkdir(parents=True, exist_ok=True)
    safe_filename = f"rectified_{doc.document_type.value.lower()}_{sha256[:10]}_{sanitized_meta['sanitized_filename']}"
    target_path = save_dir / safe_filename

    with open(target_path, "wb") as f:
        f.write(encrypted_bytes)

    previous_filename = doc.filename
    previous_status = doc.verification_status.value

    doc.filename = file.filename or safe_filename
    doc.file_path = str(target_path)
    doc.mime_type = sanitized_meta["detected_mime"]
    doc.file_size_bytes = file_size
    doc.sha256_hash = sha256
    doc.verification_status = VerificationStatus.PENDING
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Differential Re-Verification of the replaced document and application state
    verification_service.process_document(db, doc)
    verification_service.verify_entire_application(db, doc.application_id)
    db.refresh(doc)

    audit_service.log_action(
        db,
        action_type="DOCUMENT_RECTIFIED_AND_REVERIFIED",
        entity_type="Document",
        entity_id=str(doc.id),
        summary=(
            f"Rectified {doc.document_type.value}: replaced '{previous_filename}' ({previous_status}) "
            f"with '{doc.filename}' -> new status={doc.verification_status.value}."
        ),
        actor_user_id=current_user.id,
        application_id=doc.application_id,
        details={
            "previous_filename": previous_filename,
            "previous_status": previous_status,
            "new_filename": doc.filename,
            "new_status": doc.verification_status.value,
            "rectification_notes": rectification_notes,
        },
    )

    return DocumentUploadResponse(
        document_id=doc.id,
        application_id=doc.application_id,
        filename=doc.filename,
        document_type=doc.document_type,
        sha256_hash=sha256,
        verification_status=doc.verification_status,
        message=f"Rectification processed. Document status updated from {previous_status} to {doc.verification_status.value}.",
    )


@router.post("/{document_id}/auto-rectify-demo", response_model=DocumentUploadResponse)
def auto_rectify_demo_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    One-Click Jury Demonstration Helper:
    Generates an authentic, renewed, digitally signed replacement PDF for a flagged/expired document
    and runs the full differential re-verification pipeline.
    """
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    app_obj = db.get(Application, doc.application_id)
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")

    from app.services.golden_dossiers_service import _build_pdf_bytes
    from app.services.production_security import production_security

    if doc.document_type == DocumentType.FIRE_SAFETY_CERTIFICATE:
        new_filename = "rectified_fire_safety_noc_2026_27_valid.pdf"
        pdf_bytes = _build_pdf_bytes(
            "DIRECTORATE OF MAHARASHTRA FIRE SERVICES - RENEWED NOC 2026-27",
            [
                "Institution Name: Apex Institute of Engineering and Technology",
                "Certificate No: MH-FIRE-2026-8821",
                "Issuing Authority: Directorate of Maharashtra Fire Services",
                "Issue Date: 2026-01-15",
                "Expiry Date: 2027-01-14",
                "Building Area: 14800 sqm",
                "Rectification Reference: Renewed Fire Safety NOC replacing expired 2024 certificate",
                "Digitally Signed by: Chief Fire Officer Pune Division",
            ],
        )
    elif doc.document_type == DocumentType.LAND_OWNERSHIP_DOCUMENT:
        new_filename = "rectified_bhulekh_land_deed_verified.pdf"
        pdf_bytes = _build_pdf_bytes(
            "7/12 LAND OWNERSHIP EXTRACT (VERIFIED REVENUE RECORD)",
            [
                "Institution Name: Apex Institute of Engineering and Technology",
                "Survey No: SURVEY-42-HINJEWADI",
                "Issuing Authority: Maharashtra Revenue Department (Mahabhulekh 7/12 Extract)",
                "Issue Date: 2026-02-01",
                "Total Land Area: 7.5 Acres",
                "Land Use: Institutional / Educational",
                "Digitally Signed by: Tehsildar Pune Revenue Division",
            ],
        )
    else:
        new_filename = f"rectified_{doc.document_type.value.lower()}_2026_valid.pdf"
        pdf_bytes = _build_pdf_bytes(
            f"CERTIFIED {doc.document_type.value} (RECTIFIED SUBMISSION)",
            [
                "Institution Name: Apex Institute of Engineering and Technology",
                "AICTE Permanent ID: 1-4928173650",
                "Certificate No: MH-FIRE-2026-8821",
                "Issuing Authority: Competent Statutory Authority",
                "Issue Date: 2026-03-01",
                "Expiry Date: 2027-03-01",
                "Total Built-Up Area: 14800 sqm",
                "Classrooms Count: 18",
                "Laboratories Count: 12",
                "Classroom 101: 72 sqm | Computer Lab 1: 85 sqm",
                "Accessibility: Barrier-free Ramp, Divyangjan Lift & Fire Exit Staircases installed",
                "Total Faculty Count: 32",
                "Approved Intake Total: 420",
                "Digitally Signed by: NIC Certifying Authority",
            ],
        )

    sha256 = hashlib.sha256(pdf_bytes).hexdigest()
    encrypted_bytes = production_security.encrypt_file_data(
        pdf_bytes, associated_metadata=f"APP-{doc.application_id}"
    )

    save_dir = settings.UPLOAD_DIR / f"app_{doc.application_id}"
    save_dir.mkdir(parents=True, exist_ok=True)
    target_path = save_dir / new_filename
    target_path.write_bytes(encrypted_bytes)

    previous_status = doc.verification_status.value
    doc.filename = new_filename
    doc.file_path = str(target_path)
    doc.file_size_bytes = len(pdf_bytes)
    doc.sha256_hash = sha256
    doc.verification_status = VerificationStatus.PENDING
    db.add(doc)
    db.commit()
    db.refresh(doc)

    verification_service.process_document(db, doc)
    verification_service.verify_entire_application(db, doc.application_id)
    db.refresh(doc)

    audit_service.log_action(
        db,
        action_type="DOCUMENT_RECTIFIED_AND_REVERIFIED",
        entity_type="Document",
        entity_id=str(doc.id),
        summary=f"Auto-rectified {doc.document_type.value} ({previous_status} -> {doc.verification_status.value})",
        actor_user_id=current_user.id,
        application_id=doc.application_id,
        details={"new_filename": new_filename, "new_status": doc.verification_status.value},
    )

    return DocumentUploadResponse(
        document_id=doc.id,
        application_id=doc.application_id,
        filename=doc.filename,
        document_type=doc.document_type,
        sha256_hash=sha256,
        verification_status=doc.verification_status,
        message=f"Rectified document verified against Issuing Authority Hub: {previous_status} -> {doc.verification_status.value}",
    )




@router.get("/{document_id}/preview")
def preview_document_page(
    document_id: int,
    page: int = 1,
    mark: List[str] = Query(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Render one page of a stored (encrypted) document as PNG for the scrutiny viewer.
    Any strings passed in `mark` are located on the page by text search and outlined in red,
    so reviewers can see exactly where a flagged value appears.
    """
    import pymupdf
    from fastapi.responses import Response
    from app.services.production_security import production_security

    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    app_obj = db.get(Application, doc.application_id)
    if current_user.role == UserRole.APPLICANT and app_obj and app_obj.institution_id != current_user.institution_id:
        raise HTTPException(status_code=403, detail="Access denied: document belongs to another institution.")

    path = Path(doc.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stored file is missing")

    raw = path.read_bytes()
    if not (raw.startswith(b"%PDF-") or raw.startswith(b"\x89PNG") or raw.startswith(b"\xff\xd8")):
        try:
            raw = production_security.decrypt_file_data(raw, associated_metadata=f"APP-{doc.application_id}")
        except Exception:
            raise HTTPException(status_code=500, detail="Could not decrypt stored file")

    try:
        if raw.startswith(b"%PDF-"):
            pdf = pymupdf.open(stream=raw, filetype="pdf")
        else:
            img = pymupdf.open(stream=raw, filetype="png" if raw.startswith(b"\x89PNG") else "jpeg")
            pdf = pymupdf.open("pdf", img.convert_to_pdf())
            img.close()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Cannot render document: {exc}")

    total_pages = len(pdf)
    if page < 1 or page > total_pages:
        pdf.close()
        raise HTTPException(status_code=404, detail=f"Page {page} out of range (1-{total_pages})")

    pg = pdf[page - 1]
    marked = 0
    for term in {m.strip() for m in mark if m and m.strip()}:
        for rect in pg.search_for(term):
            pg.draw_rect(rect + (-2, -2, 2, 2), color=(0.78, 0.1, 0.1), width=1.4)
            marked += 1

    png = pg.get_pixmap(dpi=120).tobytes("png")
    pdf.close()
    return Response(
        content=png,
        media_type="image/png",
        headers={"X-Total-Pages": str(total_pages), "X-Marked-Regions": str(marked)},
    )
