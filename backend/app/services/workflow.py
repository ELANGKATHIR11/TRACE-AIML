"""Application lifecycle (spec §6.1).

    DRAFT --submit(A)--> SUBMITTED --validate(R/Ad)--> READY_FOR_REVIEW | DEFICIENCY_FLAGGED
    READY_FOR_REVIEW | DEFICIENCY_FLAGGED --decision(R)--> APPROVED_BY_REVIEWER
                                                         | REJECTED_BY_REVIEWER
                                                         | RECTIFICATION_REQUESTED

A disallowed transition is a 409 carrying `current_status` (see `app.http.StatusConflict`).
`transition` takes the database write lock and re-reads the committed status before changing it,
so two concurrent requests cannot both pass the check. It only stages the change; the caller
commits it, normally through `log_audit_event` (which reuses the lock), so the status change and
its audit entry land in one transaction.
"""
from typing import AbstractSet, List

from sqlmodel import Session, col, select

from app.http import StatusConflict
from app.models.enums import ApplicationStatus, OfficerDecisionType
from app.models.models import Application, ChecklistRule, Document, utc_now
from app.services.audit_service import acquire_write_lock

SUBMITTABLE = frozenset({ApplicationStatus.DRAFT})
# upload (new documents) is DRAFT-only; RECTIFICATION_REQUESTED allows rectify instead (spec 6.1)
UPLOADABLE = frozenset({ApplicationStatus.DRAFT})
RECTIFIABLE = frozenset({ApplicationStatus.RECTIFICATION_REQUESTED})
# validate and agent-review
REVIEWABLE = frozenset(
    {
        ApplicationStatus.SUBMITTED,
        ApplicationStatus.READY_FOR_REVIEW,
        ApplicationStatus.DEFICIENCY_FLAGGED,
    }
)
DECIDABLE = frozenset({ApplicationStatus.READY_FOR_REVIEW, ApplicationStatus.DEFICIENCY_FLAGGED})

DECISION_TARGETS = {
    OfficerDecisionType.APPROVE: ApplicationStatus.APPROVED_BY_REVIEWER,
    OfficerDecisionType.REJECT: ApplicationStatus.REJECTED_BY_REVIEWER,
    OfficerDecisionType.REQUEST_RECTIFICATION: ApplicationStatus.RECTIFICATION_REQUESTED,
}


def ensure_status(application: Application, allowed: AbstractSet[ApplicationStatus], action: str) -> None:
    """Raise 409 unless the application is in one of the `allowed` statuses."""
    if application.status not in allowed:
        raise StatusConflict(
            f"Cannot {action} an application in status {application.status.value}",
            application.status.value,
        )


def transition(
    session: Session,
    application: Application,
    target: ApplicationStatus,
    *,
    allowed_from: AbstractSet[ApplicationStatus],
) -> None:
    """Move `application` to `target` (staged, not committed); 409 if not allowed from here.

    The in-memory status may be stale (it was read without a lock), so the committed status is
    re-read under the write lock, which is held until the caller's commit or rollback.
    """
    action = f"move to {target.value}"
    ensure_status(application, allowed_from, action)  # cheap early exit, before locking
    acquire_write_lock(session)
    committed = session.exec(
        select(Application.status).where(Application.id == application.id)
    ).one()
    if committed not in allowed_from:
        raise StatusConflict(
            f"Cannot {action} an application in status {committed.value}", committed.value
        )
    application.status = target
    application.updated_at = utc_now()
    session.add(application)


def current_documents(session: Session, application_id: int) -> List[Document]:
    """The application's documents that have not been superseded by a newer upload."""
    return list(
        session.exec(
            select(Document)
            .where(Document.application_id == application_id)
            .where(col(Document.superseded_by_id).is_(None))
            .order_by(col(Document.id))
        ).all()
    )


def missing_mandatory_documents(session: Session, application: Application) -> List[str]:
    """Document types required by an active mandatory rule of the category with no current document."""
    rules = session.exec(
        select(ChecklistRule)
        .where(ChecklistRule.category == application.category)
        .where(ChecklistRule.is_active == True)  # noqa: E712
        .where(ChecklistRule.is_mandatory == True)  # noqa: E712
        .order_by(col(ChecklistRule.id))
    ).all()
    present = {doc.document_type for doc in current_documents(session, application.id)}
    missing: List[str] = []
    for rule in rules:
        if rule.document_type not in present and rule.document_type.value not in missing:
            missing.append(rule.document_type.value)
    return missing
