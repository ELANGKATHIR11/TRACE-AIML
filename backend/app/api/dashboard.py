"""Analytics and Overview Dashboard API.
Provides stats on applications, verification statuses, high-risk flags, and system readiness.
"""

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlmodel import Session, col, func, select

from app.database import get_db
from app.models.enums import ApplicationStatus, DocumentType, FlagSeverity, VerificationStatus
from app.models.models import Application, AuditLog, Document, User, ValidationFlag
from app.services.ml_training_platform import ml_training_platform
from app.services.ollama_service import ollama_service
from app.services.access import require_staff

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

METRIC_KEYS = ("accuracy", "precision", "recall", "f1_score")

# (registry id, metrics-file section, display name, artifact attribute on the training platform)
_TRAINED_MODELS = (
    ("document-classifier", "document_classifier", "Document Type Classifier (TF-IDF + LogisticRegression)", "doc_classifier_path"),
    ("forgery-detector", "forgery_detector", "Forgery Risk Classifier (RandomForest)", "forgery_classifier_path"),
)


def _read_metrics_file() -> Dict[str, Any]:
    path = ml_training_platform.metrics_path
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _metric(section: Dict[str, Any], key: str) -> Optional[float]:
    value = section.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def build_model_registry(ollama_ok: Optional[bool] = None) -> List[Dict[str, Any]]:
    """Model registry from the persisted training metrics; any metric not recorded is None.

    Ollama availability is checked live. The LLM has no recorded evaluation, so its metrics are None.
    """
    if ollama_ok is None:
        ollama_ok = ollama_service.is_available()
    stored = _read_metrics_file()

    registry: List[Dict[str, Any]] = []
    for model_id, section_key, name, path_attr in _TRAINED_MODELS:
        raw = stored.get(section_key)
        section = raw if isinstance(raw, dict) else {}
        artifact_present = getattr(ml_training_platform, path_attr).exists()
        entry: Dict[str, Any] = {
            "id": model_id,
            "name": name,
            "version": section.get("model_name"),
            "status": "ONLINE" if artifact_present else "UNAVAILABLE",
            "provenance": section.get("model_type"),
            "trained_at": section.get("trained_at"),
        }
        for key in METRIC_KEYS:
            entry[key] = _metric(section, key)
        registry.append(entry)

    llm: Dict[str, Any] = {
        "id": "ollama-llm",
        "name": f"Local LLM ({ollama_service.default_model})",
        "version": ollama_service.default_model,
        "status": "ONLINE" if ollama_ok else "OFFLINE",
        "provenance": "Local Ollama runtime",
        "trained_at": None,
    }
    for key in METRIC_KEYS:
        llm[key] = None
    registry.append(llm)
    return registry


def build_gateway_breakdown(db: Session) -> List[Dict[str, Any]]:
    """Per-document-type verification counts over current (non-superseded) documents only."""
    rows = db.exec(
        select(Document.document_type, Document.verification_status, func.count(Document.id))
        .where(col(Document.superseded_by_id).is_(None))
        .group_by(Document.document_type, Document.verification_status)
    ).all()
    counts: Dict[Any, Dict[Any, int]] = {}
    for doc_type, status, n in rows:
        counts.setdefault(doc_type, {})[status] = n

    breakdown: List[Dict[str, Any]] = []
    for doc_type in DocumentType:
        by_status = counts.get(doc_type, {})
        total = sum(by_status.values())
        verified = by_status.get(VerificationStatus.VERIFIED, 0)
        mismatch = by_status.get(VerificationStatus.MISMATCH, 0)
        expired = by_status.get(VerificationStatus.EXPIRED, 0)
        unavailable = by_status.get(VerificationStatus.SOURCE_UNAVAILABLE, 0)
        breakdown.append(
            {
                "gateway": doc_type.value.replace("_", " ").title(),
                "authority": doc_type.value,
                "verified": verified,
                "mismatch": mismatch,
                "expired": expired,
                "pending": total - verified - mismatch - expired - unavailable,  # PENDING + MANUAL_REVIEW_REQUIRED
                "unavailable": unavailable,
                "total": total,
            }
        )
    return breakdown



@router.get("/metrics")
def get_dashboard_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> Dict[str, Any]:
    """Return aggregated compliance dashboard metrics."""
    total_apps = db.exec(select(func.count(Application.id))).one()
    approved_apps = db.exec(select(func.count(Application.id)).where(Application.status == ApplicationStatus.APPROVED_BY_REVIEWER)).one()
    flagged_apps = db.exec(select(func.count(Application.id)).where(Application.status == ApplicationStatus.DEFICIENCY_FLAGGED)).one()
    rejected_apps = db.exec(select(func.count(Application.id)).where(Application.status == ApplicationStatus.REJECTED_BY_REVIEWER)).one()
    under_review_apps = db.exec(
        select(func.count(Application.id)).where(
            Application.status.in_([
                ApplicationStatus.READY_FOR_REVIEW,
                ApplicationStatus.VALIDATING,
                ApplicationStatus.SUBMITTED,
                ApplicationStatus.DRAFT,
            ])
        )
    ).one()

    total_docs = db.exec(select(func.count(Document.id)).where(col(Document.superseded_by_id).is_(None))).one()
    verified_docs = db.exec(select(func.count(Document.id)).where(col(Document.superseded_by_id).is_(None)).where(Document.verification_status == VerificationStatus.VERIFIED)).one()
    flagged_docs = db.exec(select(func.count(Document.id)).where(col(Document.superseded_by_id).is_(None)).where(Document.verification_status.in_([VerificationStatus.MISMATCH, VerificationStatus.MANUAL_REVIEW_REQUIRED]))).one()

    # Flags on superseded documents are history, not open findings: count application-level
    # flags and flags on current documents only.
    current_flag = or_(
        col(ValidationFlag.document_id).is_(None),
        col(ValidationFlag.document_id).in_(select(Document.id).where(col(Document.superseded_by_id).is_(None))),
    )
    total_flags = db.exec(select(func.count(ValidationFlag.id)).where(current_flag)).one()
    critical_flags = db.exec(select(func.count(ValidationFlag.id)).where(current_flag).where(ValidationFlag.severity == FlagSeverity.CRITICAL)).one()
    resolved_flags = db.exec(select(func.count(ValidationFlag.id)).where(current_flag).where(ValidationFlag.is_resolved == True)).one()

    # System Health
    ollama_ok = ollama_service.is_available()
    available_models = ollama_service.list_models() if ollama_ok else []

    model_registry_items = build_model_registry(ollama_ok=ollama_ok)
    gateway_breakdown_items = build_gateway_breakdown(db)

    return {
        "total_applications": total_apps,
        "applications_under_review": under_review_apps,
        "under_review": under_review_apps,
        "under_scrutiny_count": under_review_apps,
        "applications_with_deficiencies": flagged_apps,
        "deficiencies_flagged": flagged_apps,
        "approved_applications": approved_apps,
        "escalated_applications": rejected_apps,
        "rejected_applications": rejected_apps,
        "time_range": "AY 2026-27 (Current Active Cycle)",
        "applications": {
            "total": total_apps,
            "approved": approved_apps,
            "flagged": flagged_apps,
            "under_review": under_review_apps,
            "rejected": rejected_apps,
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
        "models": model_registry_items,
        "model_registry": model_registry_items,
        "verification_gateway_breakdown": gateway_breakdown_items,
        "gateway_breakdown": gateway_breakdown_items,
    }


@router.get("/models")
def get_model_registry(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Return model registry telemetry for the Executive Scrutiny Cockpit."""
    return build_model_registry()
