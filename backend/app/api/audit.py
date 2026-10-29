from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, col, select

from app.database import get_session
from app.models.models import AuditLog, User
from app.services.access import require_staff
from app.services.audit_service import verify_chain
from app.services.tokens import as_utc

router = APIRouter(
    prefix="/api/audit",
    tags=["Immutable Audit Trail (PRD §4.5)"],
)


def _serialize(log: AuditLog) -> Dict[str, Any]:
    timestamp = as_utc(log.timestamp).isoformat()
    return {
        "id": log.id,
        "application_id": log.application_id,
        "actor_id": log.actor_user_id,
        "actor_user_id": log.actor_user_id,
        "actor_role": log.actor_role,
        "action_type": log.action_type,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "summary": log.summary,
        "details": log.details,
        "timestamp": timestamp,
        "prev_hash": log.prev_hash,
        "record_hash": log.record_hash,
        # Aliases read by the current audit page (frontend/src/types/api.ts AuditLogEntry).
        "actor": log.actor_role,
        "action": log.action_type,
        "created_at": timestamp,
        "previous_hash": log.prev_hash,
        "current_hash": log.record_hash,
    }


@router.get("", response_model=List[Dict[str, Any]])
@router.get("/logs", response_model=List[Dict[str, Any]])
def list_audit_logs(
    application_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=500),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_staff),
):
    """Audit trail entries, newest first, with the hashes stored at write time (no recomputation)."""
    statement = select(AuditLog).order_by(col(AuditLog.id).desc()).limit(limit)
    if application_id is not None:
        statement = statement.where(AuditLog.application_id == application_id)
    return [_serialize(log) for log in session.exec(statement).all()]


@router.get("/verify-chain")
def verify_audit_chain(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_staff),
):
    """Recompute every row's HMAC and prev_hash link; report the first broken row, if any."""
    return verify_chain(session)
