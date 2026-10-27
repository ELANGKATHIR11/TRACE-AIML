from datetime import datetime, timezone
from typing import Any, Dict, Optional
from sqlmodel import Session

from app.models.models import AuditLog, User


def log_audit_event(
    session: Session,
    *,
    action_type: str,
    entity_type: str,
    summary: str,
    application_id: Optional[int] = None,
    entity_id: Optional[str] = None,
    actor: Optional[User] = None,
    actor_role_override: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> AuditLog:
    """
    Append an immutable, tamper-evident chained entry to the AuditLog table (PRD §4.5).
    """
    from app.services.production_security import production_security
    from sqlmodel import col, select

    # Retrieve last recorded hash
    last_log = session.exec(select(AuditLog).order_by(col(AuditLog.id).desc())).first()
    prev_hash = last_log.record_hash if (last_log and last_log.record_hash) else "GENESIS_BLOCK_AICTE_TRACE"

    now_iso = datetime.now(timezone.utc).isoformat()
    actor_email = actor.email if actor else "SYSTEM"
    details_dict = details or {}

    record_hash = production_security.compute_audit_record_hash(
        prev_record_hash=prev_hash,
        actor_email=actor_email,
        action_type=action_type,
        application_id=application_id,
        details_payload=details_dict,
        timestamp_iso=now_iso,
    )

    entry = AuditLog(
        application_id=application_id,
        actor_user_id=actor.id if actor else None,
        actor_role=actor_role_override or (actor.role.value.upper() if actor else "SYSTEM"),
        action_type=action_type,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        summary=summary,
        details=details_dict,
        prev_record_hash=prev_hash,
        record_hash=record_hash,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


class AuditService:
    def log_action(
        self,
        session: Session,
        action_type: str,
        entity_type: str,
        summary: str,
        application_id: Optional[int] = None,
        entity_id: Optional[str] = None,
        actor_user_id: Optional[int] = None,
        actor_role: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        from app.services.production_security import production_security
        from sqlmodel import col, select

        last_log = session.exec(select(AuditLog).order_by(col(AuditLog.id).desc())).first()
        prev_hash = last_log.record_hash if (last_log and last_log.record_hash) else "GENESIS_BLOCK_AICTE_TRACE"

        now_iso = datetime.now(timezone.utc).isoformat()
        actor_identifier = f"user_{actor_user_id}" if actor_user_id else (actor_role or "SYSTEM")
        details_dict = details or {}

        record_hash = production_security.compute_audit_record_hash(
            prev_record_hash=prev_hash,
            actor_email=actor_identifier,
            action_type=action_type,
            application_id=application_id,
            details_payload=details_dict,
            timestamp_iso=now_iso,
        )

        entry = AuditLog(
            application_id=application_id,
            actor_user_id=actor_user_id,
            actor_role=actor_role or "SYSTEM",
            action_type=action_type,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            summary=summary,
            details=details_dict,
            prev_record_hash=prev_hash,
            record_hash=record_hash,
        )
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return entry

    def verify_audit_chain(self, session: Session) -> Dict[str, Any]:
        """Validates the entire audit chain from genesis to head."""
        from app.services.production_security import production_security
        from sqlmodel import select

        logs = session.exec(select(AuditLog).order_by(AuditLog.id)).all()
        if not logs:
            return {"is_valid": True, "total_records": 0, "message": "Audit chain empty"}

        expected_prev = "GENESIS_BLOCK_AICTE_TRACE"
        for idx, entry in enumerate(logs):
            if idx > 0 and entry.prev_record_hash != expected_prev:
                return {
                    "is_valid": False,
                    "tampered_record_id": entry.id,
                    "reason": f"Hash chain break at block #{entry.id}: expected prev {expected_prev}, got {entry.prev_record_hash}",
                }
            expected_prev = entry.record_hash

        return {"is_valid": True, "total_records": len(logs), "head_hash": expected_prev}


audit_service = AuditService()

