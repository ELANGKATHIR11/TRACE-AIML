"""Tamper-evident audit trail (PRD §4.5, spec §5.4).

Every row carries `prev_hash` (the previous row's `record_hash`, or 64 zeros for the first row)
and `record_hash = HMAC-SHA256(AUDIT_HMAC_KEY, canonical_json(fields))`. Appends are serialised
so that two writers can never read the same chain tail.
"""
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlmodel import Session, col, select

from app.config import settings
from app.models.models import AuditLog, User

GENESIS_HASH = "0" * 64
ALGORITHM = "HMAC-SHA256 hash chain"
# Arbitrary application-wide key for the PostgreSQL transaction-scoped advisory lock.
_PG_ADVISORY_LOCK_KEY = 727274


def canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def compute_record_hash(row: AuditLog) -> str:
    from app.services.tokens import as_utc  # local: tokens imports this module at load time

    payload = {
        "id": row.id,
        "application_id": row.application_id,
        "actor_user_id": row.actor_user_id,
        "actor_role": row.actor_role,
        "action_type": row.action_type,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "summary": row.summary,
        "details": row.details,
        "timestamp_iso": as_utc(row.timestamp).isoformat(),
        "prev_hash": row.prev_hash,
    }
    return hmac.new(
        settings.AUDIT_HMAC_KEY.encode("utf-8"),
        canonical_json(payload).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def acquire_write_lock(session: Session) -> None:
    """Serialise writers for the rest of the session's current transaction.

    Used for chain appends and for status transitions (`workflow.transition`). Reentrant within
    a transaction, so a transition followed by `log_audit_event` in the same transaction is safe.

    SQLite: the engine keeps pysqlite's default transaction handling, in which the driver only
    opens a transaction implicitly before a DML statement. If no transaction is open we start one
    with `BEGIN IMMEDIATE`, taking the database's single RESERVED (write) lock up front; concurrent
    appenders wait on the busy timeout. If a transaction is already open it was opened by a DML
    statement, so this connection already holds the RESERVED lock.
    PostgreSQL: a transaction-scoped advisory lock, released on commit/rollback.
    """
    conn = session.connection()
    dialect = conn.dialect.name
    if dialect == "sqlite":
        if not conn.connection.dbapi_connection.in_transaction:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
    elif dialect == "postgresql":
        conn.exec_driver_sql(f"SELECT pg_advisory_xact_lock({_PG_ADVISORY_LOCK_KEY})")
    else:  # pragma: no cover - only SQLite and PostgreSQL are supported
        raise RuntimeError(f"Audit chain serialisation not implemented for {dialect}")


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
    """Append an HMAC-chained entry and commit (together with any pending changes in `session`)."""
    actor_user_id = actor.id if actor else None
    actor_role = actor_role_override or (actor.role.value.upper() if actor else "SYSTEM")
    # Store exactly what is hashed: round-trip through the canonical encoding so values the JSON
    # column would otherwise re-encode differently cannot make a genuine row fail verification.
    stored_details = json.loads(canonical_json(details or {}))

    acquire_write_lock(session)
    tail = session.exec(
        select(AuditLog.record_hash).order_by(col(AuditLog.id).desc()).limit(1)
    ).first()
    entry = AuditLog(
        application_id=application_id,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        action_type=action_type,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        summary=summary,
        details=stored_details,
        prev_hash=tail or GENESIS_HASH,
    )
    session.add(entry)
    session.flush()  # assigns entry.id
    entry.record_hash = compute_record_hash(entry)
    session.commit()
    session.refresh(entry)
    return entry


def verify_chain(session: Session) -> Dict[str, Any]:
    """Walk the chain by id, recomputing every HMAC and every prev_hash link."""
    expected_prev = GENESIS_HASH
    verified = 0
    latest_hash: Optional[str] = None
    broken_at_id: Optional[int] = None

    rows = session.exec(
        select(AuditLog).order_by(col(AuditLog.id)).execution_options(yield_per=500)
    )
    for row in rows:
        stored = row.record_hash or ""
        if row.prev_hash != expected_prev or not hmac.compare_digest(
            stored, compute_record_hash(row)
        ):
            broken_at_id = row.id
            break
        verified += 1
        latest_hash = expected_prev = stored
    rows.close()

    return {
        "status": "INTACT" if broken_at_id is None else "BROKEN",
        "verified_count": verified,
        "latest_hash": latest_hash,
        "broken_at_id": broken_at_id,
        "algorithm": ALGORITHM,
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }
