"""Document Upload and Verification Endpoints.
Handles file ingestion, hashing, MIME validation, instant offline processing, and status tracking.
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlmodel import Session, select

from app.config import settings
from app.database import get_db
from app.models.enums import DocumentType, VerificationStatus
from app.http import StatusConflict
from app.models.models import Application, Document, User
from app.schemas.schemas import DocumentRead, DocumentUploadResponse
from app.services import workflow
from app.services.access import load_application, load_document, require_applicant, require_staff
from app.services.audit_service import acquire_write_lock, log_audit_event
from app.services.document_storage import (
    content_disposition_inline,
    ela_on_bytes,
    read_document_plaintext,
    read_upload_limited,
    store_document,
)
from app.services.security import get_current_user
from app.services.verification_services import verification_service

logger = logging.getLogger(__name__)

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


async def _ingest_document(
    db: Session,
    application: Application,
    doc_type: DocumentType,
    file: UploadFile,
    current_user: User,
) -> Document:
    """Validate, encrypt and store the upload, then stage (flush) its Document row.

    The caller supersedes any replaced row and commits via `log_audit_event`.
    """
    contents = await read_upload_limited(file, settings.MAX_UPLOAD_MB * 2**20)

    # Magic-byte/polyglot sanitisation (422 on failure), AES-256-GCM encryption and write to disk
    target_path, sanitized_meta = store_document(
        application.id, doc_type, contents, file.filename or "doc.pdf"
    )
    sha256 = sanitized_meta["sha256_digest"]

    # Check for duplicate cross-application document recycling (Ghost Document detection)
    duplicate_doc = db.exec(
        select(Document).where(Document.sha256_hash == sha256).where(Document.application_id != application.id)
    ).first()
    if duplicate_doc:
        log_audit_event(
            db,
            action_type="DUPLICATE_DOCUMENT_FLAGGED",
            entity_type="Document",
            entity_id=str(duplicate_doc.id),
            summary=f"Security Alert: Document {file.filename} is identical to document in Application #{duplicate_doc.application_id}",
            actor=current_user,
            application_id=application.id,
            details={"duplicate_of_app": duplicate_doc.application_id, "sha256": sha256},
        )

    doc = Document(
        application_id=application.id,
        document_type=doc_type,
        filename=file.filename or target_path.name,
        file_path=str(target_path),
        mime_type=sanitized_meta["detected_mime"],
        file_size_bytes=sanitized_meta["size_bytes"],
        sha256_hash=sha256,
        verification_status=VerificationStatus.PENDING,
    )
    db.add(doc)
    db.flush()  # assigns doc.id
    return doc


def _upload_response(doc: Document, message: str) -> DocumentUploadResponse:
    return DocumentUploadResponse(
        id=doc.id,
        document_id=doc.id,
        application_id=doc.application_id,
        filename=doc.filename,
        document_type=doc.document_type,
        sha256_hash=doc.sha256_hash,
        verification_status=doc.verification_status,
        message=message,
    )


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    application_id: int = Form(...),
    document_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    """Upload a supporting document to a DRAFT; a re-upload supersedes the current one of its type."""
    application = load_application(db, application_id, current_user, write=True)
    workflow.ensure_status(application, workflow.UPLOADABLE, "upload documents to")
    doc_type_enum = parse_document_type(document_type)

    doc = await _ingest_document(db, application, doc_type_enum, file, current_user)

    # Under the write lock, re-check the status and supersede same-type documents; the flush above
    # and these changes commit together with the audit entry below.
    acquire_write_lock(db)
    db.refresh(application)
    workflow.ensure_status(application, workflow.UPLOADABLE, "upload documents to")
    replaced = [
        d for d in workflow.current_documents(db, application_id)
        if d.document_type == doc_type_enum and d.id != doc.id
    ]
    for old in replaced:
        old.superseded_by_id = doc.id
        db.add(old)

    log_audit_event(
        db,
        action_type="DOCUMENT_UPLOADED",
        entity_type="Document",
        entity_id=str(doc.id),
        summary=f"Uploaded {file.filename} for Application #{application_id} (SHA-256: {doc.sha256_hash[:12]}...)",
        actor=current_user,
        application_id=application_id,
        details={
            "filename": file.filename,
            "size_bytes": doc.file_size_bytes,
            "sha256": doc.sha256_hash,
            "superseded_document_ids": [d.id for d in replaced],
        },
    )
    db.refresh(doc)
    return _upload_response(doc, "Document uploaded successfully. Ready for verification.")


@router.post(
    "/{document_id}/rectify", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED
)
async def rectify_document(
    document_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    """Replace a document while rectification is requested; the old row is kept as superseded."""
    old = load_document(db, document_id, current_user, write=True)
    application = db.get(Application, old.application_id)
    workflow.ensure_status(application, workflow.RECTIFIABLE, "rectify documents of")
    if old.superseded_by_id is not None:
        raise StatusConflict("Document has already been replaced", application.status.value)

    new = await _ingest_document(db, application, old.document_type, file, current_user)

    acquire_write_lock(db)
    db.refresh(application)
    db.refresh(old)
    workflow.ensure_status(application, workflow.RECTIFIABLE, "rectify documents of")
    if old.superseded_by_id is not None:
        raise StatusConflict("Document has already been replaced", application.status.value)
    old.superseded_by_id = new.id
    db.add(old)

    log_audit_event(
        db,
        action_type="DOCUMENT_RECTIFIED",
        entity_type="Document",
        entity_id=str(new.id),
        summary=f"Replaced document #{old.id} with {file.filename} for Application #{application.id}",
        actor=current_user,
        application_id=application.id,
        details={
            "superseded_document_id": old.id,
            "document_type": new.document_type.value,
            "sha256": new.sha256_hash,
        },
    )
    db.refresh(new)
    return _upload_response(new, "Document rectified successfully. Ready for verification.")


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
    """List the application's current (not superseded) documents."""
    load_application(db, application_id, current_user)
    return workflow.current_documents(db, application_id)


@router.get("/{document_id}", response_model=DocumentRead)
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Document metadata (never the server-side storage path)."""
    return load_document(db, document_id, current_user)


@router.get("/{document_id}/preview")
def get_document_preview(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the decrypted document inline."""
    doc = load_document(db, document_id, current_user)
    try:
        plaintext = read_document_plaintext(doc)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Document file not found")
    except ValueError:
        logger.error("Document %s failed decryption", doc.id)
        raise HTTPException(status_code=500, detail="Stored document could not be read")
    return Response(
        content=plaintext,
        media_type=doc.mime_type,
        headers={
            "Content-Disposition": content_disposition_inline(doc.filename),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{document_id}/ela")
def get_document_ela(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Execute Error Level Analysis (ELA) on the decrypted image to detect resave splices and tampering."""
    doc = load_document(db, document_id, current_user)

    if doc.mime_type not in ("image/png", "image/jpeg"):
        return {
            "document_id": document_id,
            "tampering_detected": False,
            "anomaly_score": 0.0,
            "details": "Document is not a raster PNG/JPEG image. ELA does not apply.",
        }

    try:
        plaintext = read_document_plaintext(doc)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Document file not found")
    except ValueError:
        logger.error("Document %s failed decryption", doc.id)
        raise HTTPException(status_code=500, detail="Stored document could not be read")

    try:
        ela_res = ela_on_bytes(plaintext, doc.mime_type)
    except Exception:
        logger.exception("ELA failed for document %s", doc.id)
        return {
            "document_id": document_id,
            "tampering_detected": False,
            "anomaly_score": 0.0,
            "details": "Error Level Analysis could not be computed for this image.",
        }
    return {
        "document_id": document_id,
        "tampering_detected": ela_res.get("tamper_detected_by_ela", False),
        "anomaly_score": ela_res.get("std_compression_error", 0.0),
        "details": ela_res.get("reason", "Error Level Analysis computed across DCT blocks."),
        "max_difference": ela_res.get("max_compression_error", 0.0),
    }
