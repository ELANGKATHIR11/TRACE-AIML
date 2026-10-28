from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, func, select

from app.database import get_session
from app.http import StatusConflict
from app.models.enums import ApplicationStatus, UserRole
from app.models.models import (
    Application,
    AuditLog,
    ChecklistRule,
    Institution,
    OfficerDecision,
    User,
    ValidationFlag,
)
from app.schemas.schemas import (
    ApplicationCreate,
    ApplicationDetailResponse,
    ChecklistItemStatus,
    DecisionRead,
    DocumentRead,
    InstitutionCreate,
    InstitutionRead,
    OfficerDecisionRequest,
    OfficerDecisionResponse,
)
from app.services.access import (
    load_application,
    require_admin,
    require_applicant,
    require_reviewer,
    require_staff,
)
from app.services import workflow
from app.services.audit_service import log_audit_event
from app.services.security import get_current_user
from app.services.tokens import as_utc

router = APIRouter(
    prefix="/api",
    tags=["Institutions & Applications (PRD §4.1)"],
)


@router.get("/institutions", response_model=List[InstitutionRead])
def list_institutions(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List registered technical institutions (applicants see only their own)."""
    statement = select(Institution)
    if current_user.role == UserRole.APPLICANT:
        statement = statement.where(Institution.id == current_user.institution_id)
    return session.exec(statement).all()


@router.post(
    "/institutions",
    response_model=InstitutionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_institution(
    payload: InstitutionCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    existing = session.exec(
        select(Institution).where(
            Institution.aicte_permanent_id == payload.aicte_permanent_id
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Institution with AICTE ID '{payload.aicte_permanent_id}' already exists.",
        )

    inst = Institution(**payload.model_dump())
    session.add(inst)
    session.commit()
    session.refresh(inst)

    log_audit_event(
        session,
        action_type="INSTITUTION_CREATED",
        entity_type="Institution",
        entity_id=str(inst.id),
        actor=current_user,
        summary=f"Registered institution '{inst.name}' ({inst.aicte_permanent_id}).",
    )
    return inst


@router.post(
    "/applications",
    response_model=ApplicationDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_application(
    payload: ApplicationCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_applicant),
):
    """
    Create a new institutional application (e.g., Extension of Approval).
    Automatically identifies the application category, attaches the relevant
    Approval Process Handbook checklist, and retrieves historical AICTE records (PRD §4.1).
    """
    # The institution always comes from the authenticated applicant, never the request body.
    institution = (
        session.get(Institution, current_user.institution_id)
        if current_user.institution_id is not None
        else None
    )
    if not institution:
        raise HTTPException(status_code=403, detail="Applicant account is not linked to an institution")

    max_id = session.exec(select(func.max(Application.id))).one() or 0
    app_number = f"AICTE-{payload.academic_year[:4]}-{payload.category.name}-{max_id + 1:04d}"

    application = Application(
        application_number=app_number,
        institution_id=institution.id,
        submitted_by_user_id=current_user.id,
        academic_year=payload.academic_year,
        category=payload.category,
        declared_data=payload.declared_data.model_dump(exclude_none=True),
    )
    session.add(application)
    session.commit()
    session.refresh(application)

    # Fetch applicable checklist rules for this category
    rules = session.exec(
        select(ChecklistRule)
        .where(ChecklistRule.category == application.category)
        .where(ChecklistRule.is_active == True)  # noqa: E712
    ).all()

    log_audit_event(
        session,
        application_id=application.id,
        action_type="APPLICATION_INITIATED_AND_CHECKLIST_ASSIGNED",
        entity_type="Application",
        entity_id=application.application_number,
        actor=current_user,
        summary=(
            f"Application {application.application_number} created for '{institution.name}'. "
            f"Automatically matched {len(rules)} checklist rules for category '{application.category.value}' "
            f"and linked historical AICTE records."
        ),
        details={
            "category": application.category.value,
            "matched_rule_ids": [r.id for r in rules],
            "historical_eoa_ref": institution.historical_records.get("previous_eoa_reference"),
        },
    )

    return _build_application_detail(session, application, institution)


@router.get("/applications", response_model=List[Application])
def list_applications(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List applications (Applicants see their institution's applications; Officials/Admins see all)."""
    statement = select(Application)
    if current_user.role == UserRole.APPLICANT:
        # Unconditional: an applicant with no institution matches nothing (spec §4.1).
        statement = statement.where(Application.institution_id == current_user.institution_id)
    return session.exec(statement).all()


@router.get("/applications/{application_id}", response_model=ApplicationDetailResponse)
def get_application_detail(
    application_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve full application status, dynamically computed category checklist completeness,
    and historical AICTE baseline records.
    """
    application = load_application(session, application_id, current_user)
    institution = session.get(Institution, application.institution_id)
    return _build_application_detail(session, application, institution)


@router.post("/applications/{application_id}/submit", response_model=ApplicationDetailResponse)
def submit_application(
    application_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_applicant),
):
    """Submit a DRAFT for scrutiny once every mandatory checklist document is present (spec §6.1)."""
    application = load_application(session, application_id, current_user)
    workflow.ensure_status(application, workflow.SUBMITTABLE, "submit")
    missing = workflow.missing_mandatory_documents(session, application)
    if missing:
        raise StatusConflict(
            "Mandatory documents are missing",
            application.status.value,
            missing_document_types=missing,
        )

    documents = workflow.current_documents(session, application.id)
    workflow.transition(
        session, application, ApplicationStatus.SUBMITTED, allowed_from=workflow.SUBMITTABLE
    )
    # Commits the status change together with its audit entry.
    log_audit_event(
        session,
        application_id=application.id,
        action_type="APPLICATION_SUBMITTED",
        entity_type="Application",
        entity_id=application.application_number,
        actor=current_user,
        summary=f"Application {application.application_number} submitted for scrutiny.",
        details={"document_ids": [d.id for d in documents]},
    )
    session.refresh(application)
    institution = session.get(Institution, application.institution_id)
    return _build_application_detail(session, application, institution)


def _decision_read(decision: OfficerDecision, audit_hash: Optional[str]) -> DecisionRead:
    return DecisionRead(
        id=decision.id,
        application_id=decision.application_id,
        decision=decision.decision,
        notes=decision.notes,
        officer_id=decision.officer_user_id,
        decided_at=as_utc(decision.created_at),
        audit_hash=audit_hash,
    )


def _decision_reads(session: Session, application_id: int) -> List[DecisionRead]:
    rows = session.exec(
        select(OfficerDecision, AuditLog.record_hash)
        .join(AuditLog, col(AuditLog.id) == col(OfficerDecision.audit_log_id), isouter=True)
        .where(OfficerDecision.application_id == application_id)
        .order_by(col(OfficerDecision.id))
    ).all()
    return [_decision_read(decision, audit_hash) for decision, audit_hash in rows]


def _build_application_detail(
    session: Session,
    application: Application,
    institution: Institution,
) -> ApplicationDetailResponse:
    rules = session.exec(
        select(ChecklistRule)
        .where(ChecklistRule.category == application.category)
        .where(ChecklistRule.is_active == True)  # noqa: E712
    ).all()

    documents = workflow.current_documents(session, application.id)
    docs_by_type = {doc.document_type: doc for doc in documents}

    checklist_status: List[ChecklistItemStatus] = []
    for rule in rules:
        matched_doc = docs_by_type.get(rule.document_type)
        checklist_status.append(
            ChecklistItemStatus(
                rule_id=rule.id,
                document_type=rule.document_type,
                rule_name=rule.rule_name,
                is_mandatory=rule.is_mandatory,
                required_fields=rule.required_fields,
                uploaded=matched_doc is not None,
                document_id=matched_doc.id if matched_doc else None,
                verification_status=matched_doc.verification_status if matched_doc else None,
            )
        )

    decisions = _decision_reads(session, application.id)
    return ApplicationDetailResponse(
        id=application.id,
        application_number=application.application_number,
        institution_id=application.institution_id,
        academic_year=application.academic_year,
        category=application.category,
        status=application.status,
        declared_data=application.declared_data,
        validation_summary=application.validation_summary,
        created_at=application.created_at,
        updated_at=application.updated_at,
        applicable_checklist=checklist_status,
        historical_aicte_records=institution.historical_records if institution else {},
        institution_name=institution.name if institution else "",
        documents=[DocumentRead.model_validate(doc, from_attributes=True) for doc in documents],
        decisions=decisions,
        latest_decision=decisions[-1] if decisions else None,
    )


@router.post("/applications/{application_id}/validate", tags=["Institutions & Applications (PRD §4.1)"])
def validate_application(
    application_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_staff),
):
    """
    Trigger 100% offline cross-document reconciliation and regulatory compliance verification
    for all documents uploaded under this application packet.
    """
    from app.services.verification_services import verification_service

    load_application(session, application_id, current_user)
    try:
        result = verification_service.verify_entire_application(session, application_id)
        return {
            "message": "Full application validation completed successfully",
            "result": result,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/applications/{application_id}/flags", tags=["Institutions & Applications (PRD §4.1)"])
def get_application_flags(
    application_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all explainable compliance, statutory, and forensic flags for an application."""
    load_application(session, application_id, current_user)
    flags = session.exec(
        select(ValidationFlag).where(ValidationFlag.application_id == application_id)
    ).all()
    return flags


@router.post(
    "/applications/{application_id}/decision",
    response_model=OfficerDecisionResponse,
    tags=["Institutions & Applications (PRD §4.1)"],
)
def submit_officer_decision(
    application_id: int,
    payload: OfficerDecisionRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_reviewer),
):
    """
    Record binding statutory determination by an authorized AICTE Scrutiny Officer.
    """
    app_record = load_application(session, application_id, current_user)
    workflow.transition(
        session,
        app_record,
        workflow.DECISION_TARGETS[payload.decision],
        allowed_from=workflow.DECIDABLE,
    )
    decision = OfficerDecision(
        application_id=app_record.id,
        officer_user_id=current_user.id,
        decision=payload.decision,
        notes=payload.notes,
    )
    session.add(decision)
    session.flush()  # assigns decision.id for the audit details

    # Commits the status change, the decision row and its audit entry in one transaction.
    audit_entry = log_audit_event(
        session,
        application_id=app_record.id,
        action_type=f"OFFICER_DECISION_{payload.decision.value}",
        entity_type="Application",
        entity_id=app_record.application_number,
        actor=current_user,
        summary=(
            f"Officer {current_user.email} recorded decision '{payload.decision.value}'. "
            f"Status: {app_record.status.value}. Notes: {payload.notes[:100]}"
        ),
        details={
            "decision_id": decision.id,
            "decision": payload.decision.value,
            "officer_notes": payload.notes,
            "new_status": app_record.status.value,
        },
    )
    decision.audit_log_id = audit_entry.id
    session.add(decision)
    session.commit()
    session.refresh(decision)
    session.refresh(app_record)

    return OfficerDecisionResponse(
        **_decision_read(decision, audit_entry.record_hash).model_dump(),
        status=app_record.status,
    )
