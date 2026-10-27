"""Analytics and Overview Dashboard API.
Provides stats on applications, verification statuses, high-risk flags, and system readiness.
"""

from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from app.database import get_db
from app.models.enums import ApplicationStatus, FlagSeverity, VerificationStatus
from app.models.models import Application, AuditLog, Document, User, ValidationFlag
from app.services.ollama_service import ollama_service
from app.services.security import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/metrics")
def get_dashboard_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return aggregated compliance dashboard metrics."""
    total_apps = db.exec(select(func.count(Application.id))).one()
    approved_apps = db.exec(select(func.count(Application.id)).where(Application.status == ApplicationStatus.APPROVED_BY_REVIEWER)).one()
    flagged_apps = db.exec(select(func.count(Application.id)).where(Application.status == ApplicationStatus.DEFICIENCY_FLAGGED)).one()
    under_review_apps = db.exec(select(func.count(Application.id)).where(Application.status == ApplicationStatus.READY_FOR_REVIEW)).one()

    total_docs = db.exec(select(func.count(Document.id))).one()
    verified_docs = db.exec(select(func.count(Document.id)).where(Document.verification_status == VerificationStatus.VERIFIED)).one()
    flagged_docs = db.exec(select(func.count(Document.id)).where(Document.verification_status.in_([VerificationStatus.MISMATCH, VerificationStatus.MANUAL_REVIEW_REQUIRED]))).one()

    total_flags = db.exec(select(func.count(ValidationFlag.id))).one()
    critical_flags = db.exec(select(func.count(ValidationFlag.id)).where(ValidationFlag.severity == FlagSeverity.CRITICAL)).one()
    resolved_flags = db.exec(select(func.count(ValidationFlag.id)).where(ValidationFlag.is_resolved == True)).one()

    # System Health
    ollama_ok = ollama_service.is_available()
    available_models = ollama_service.list_models() if ollama_ok else []

    return {
        "applications": {
            "total": total_apps,
            "approved": approved_apps,
            "flagged": flagged_apps,
            "under_review": under_review_apps,
        },
        "documents": {
            "total": total_docs,
            "verified": verified_docs,
            "flagged_for_review": flagged_docs,
        },
        "flags": {
            "total": total_flags,
            "critical": critical_flags,
            "resolved": resolved_flags,
            "pending_resolution": total_flags - resolved_flags,
        },
        "system_status": {
            "mode": "100% Offline / Air-Gapped",
            "database": "SQLite (Authoritative)",
            "local_llm_connected": ollama_ok,
            "models_ready": available_models,
        },
    }
