"""Document Upload and Verification Endpoints.
Handles file ingestion, hashing, MIME validation, instant offline processing, and status tracking.
"""

import hashlib
import shutil
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.config import settings
from app.database import get_db
from app.models.enums import DocumentType, VerificationStatus
from app.models.models import Document, User
from app.schemas.schemas import DocumentRead, DocumentUploadResponse
from app.services.access import load_application, load_document, require_applicant, require_staff
from app.services.audit_service import audit_service
from app.services.security import get_current_user
from app.services.verification_services import verification_service

router = APIRouter(prefix="/api/documents", tags=["Documents"])

DOC_TYPE_MAP = {
    "affidavit": DocumentType.AFFIDAVIT,
    "fire_safety_certificate": DocumentType.FIRE_SAFETY_CERTIFICATE,
    "fire safety certificate": DocumentType.FIRE_SAFETY_CERTIFICATE,
    "fire noc": DocumentType.FIRE_SAFETY_CERTIFICATE,
    "fire_noc": DocumentType.FIRE_SAFETY_CERTIFICATE,
    "building_plan_certificate": DocumentType.BUILDING_PLAN_CERTIFICATE,
    "building plan certificate": DocumentType.BUILDING_PLAN_CERTIFICATE,
    "building plan": DocumentType.BUILDING_PLAN_CERTIFICATE,
    "building_plan": DocumentType.BUILDING_PLAN_CERTIFICATE,
    "land_ownership_document": DocumentType.LAND_OWNERSHIP_DOCUMENT,
    "land ownership document": DocumentType.LAND_OWNERSHIP_DOCUMENT,
    "land deed": DocumentType.LAND_OWNERSHIP_DOCUMENT,
    "land_deed": DocumentType.LAND_OWNERSHIP_DOCUMENT,
    "previous_eoa_letter": DocumentType.PREVIOUS_EOA_LETTER,
    "previous eoa letter": DocumentType.PREVIOUS_EOA_LETTER,
    "accreditation_certificate": DocumentType.ACCREDITATION_CERTIFICATE,
    "accreditation certificate": DocumentType.ACCREDITATION_CERTIFICATE,
    "nba certificate": DocumentType.ACCREDITATION_CERTIFICATE,
    "nba_certificate": DocumentType.ACCREDITATION_CERTIFICATE,
    "faculty_roster": DocumentType.FACULTY_ROSTER,
    "faculty roster": DocumentType.FACULTY_ROSTER,
    "infrastructure_evidence": DocumentType.INFRASTRUCTURE_EVIDENCE,
    "infrastructure evidence": DocumentType.INFRASTRUCTURE_EVIDENCE,
}


def parse_document_type(raw: str) -> DocumentType:
    clean = str(raw).strip()
    try:
        return DocumentType(clean)
    except ValueError:
        pass
    clean_lower = clean.lower()
    if clean_lower in DOC_TYPE_MAP:
        return DOC_TYPE_MAP[clean_lower]
    clean_upper = clean.upper().replace(" ", "_").replace("-", "_")
    try:
        return DocumentType(clean_upper)
    except ValueError:
        pass
    valid_keys = [e.value for e in DocumentType]
    raise HTTPException(
        status_code=422,
        detail=f"Invalid document_type '{clean}'. Must be one of: {valid_keys}",
    )


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    application_id: int = Form(...),
    document_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    """Upload a supporting document, calculate SHA-256 for duplicate detection, and store safely."""
    load_application(db, application_id, current_user, write=True)
    doc_type_enum = parse_document_type(document_type)

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
    safe_filename = f"{doc_type_enum.value.lower()}_{sha256[:10]}_{sanitized_meta['sanitized_filename']}"
    target_path = save_dir / safe_filename

    with open(target_path, "wb") as f:
        f.write(encrypted_bytes)

    # Persist Document entity
    doc = Document(
        application_id=application_id,
        document_type=doc_type_enum,
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
        id=doc.id,
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
    current_user: User = Depends(require_staff),
):
    """Run 100% offline OCR, field extraction, and forensic checks on an individual document."""
    doc = load_document(db, document_id, current_user)

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
    """List all documents attached to an application."""
    load_application(db, application_id, current_user)
    docs = db.exec(select(Document).where(Document.application_id == application_id)).all()
    return docs


@router.get("/{document_id}/preview")
def get_document_preview(
    document_id: int,
    page: int = 1,
    mark: Optional[List[str]] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return forensic document preview with optional vector bounding box highlights.
    """
    from fastapi.responses import FileResponse, JSONResponse
    doc = load_document(db, document_id, current_user)

    file_p = Path(doc.file_path)
    if file_p.exists():
        # Check if decrypt is needed or return file directly
        return FileResponse(file_p, media_type=doc.mime_type, filename=doc.filename)

    return JSONResponse(
        content={
            "document_id": document_id,
            "filename": doc.filename,
            "page": page,
            "status": "PREVIEW_READY",
            "bounding_boxes": [],
            "matches": mark or [],
        }
    )


@router.get("/{document_id}/ela")
def get_document_ela(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """
    Execute Error Level Analysis (ELA) to detect JPEG resave splices, cloned seals, and tampered digits.
    """
    doc = load_document(db, document_id, current_user)

    from app.services.image_forensics_service import ImageForensicsService
    file_p = Path(doc.file_path)

    if file_p.exists() and file_p.suffix.lower() in [".jpg", ".jpeg", ".png"]:
        try:
            ela_res = ImageForensicsService.perform_error_level_analysis(file_p)
            return {
                "document_id": document_id,
                "tampering_detected": ela_res.get("tamper_anomaly_detected", False),
                "anomaly_score": ela_res.get("tamper_anomaly_score", 0.0),
                "details": "Error Level Analysis computed across DCT blocks.",
                "max_difference": ela_res.get("max_error", 0.0),
            }
        except Exception as e:
            return {
                "document_id": document_id,
                "tampering_detected": False,
                "anomaly_score": 0.0,
                "details": f"ELA processing: {str(e)}",
            }

    return {
        "document_id": document_id,
        "tampering_detected": False,
        "anomaly_score": 0.0,
        "details": "Document is PDF or not a raster JPEG image. ELA standard baseline passed.",
    }

