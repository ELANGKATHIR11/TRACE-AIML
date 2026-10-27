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
from app.models.models import Application, Document, User
from app.schemas.schemas import DocumentRead, DocumentUploadResponse
from app.services.audit_service import audit_service
from app.services.security import get_current_user
from app.services.verification_services import verification_service

router = APIRouter(prefix="/documents", tags=["Documents"])


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
