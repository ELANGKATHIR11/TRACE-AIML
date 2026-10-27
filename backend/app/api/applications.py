from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.models.enums import ApplicationStatus, UserRole
from app.models.models import Application, ChecklistRule, Document, Institution, User, ValidationFlag
from app.schemas.schemas import (
    ApplicationCreate,
    ApplicationDetailResponse,
    ChecklistItemStatus,
    InstitutionCreate,
    InstitutionRead,
    ValidationFlagRead,
)
from app.services.audit_service import log_audit_event
from app.services.security import get_current_user, require_roles

router = APIRouter(
    prefix="/api",
    tags=["Institutions & Applications (PRD §4.1)"],
)


@router.get("/institutions", response_model=List[InstitutionRead])
def list_institutions(session: Session = Depends(get_session)):
    """List registered technical institutions along with historical AICTE records."""
    return session.exec(select(Institution)).all()


@router.post(
    "/institutions",
    response_model=InstitutionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_institution(
    payload: InstitutionCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.APPLICANT])),
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
    current_user: User = Depends(get_current_user),
):
    """
    Create a new institutional application (e.g., Extension of Approval).
    Automatically identifies the application category, attaches the relevant
    Approval Process Handbook checklist, and retrieves historical AICTE records (PRD §4.1).
    """
    institution = session.get(Institution, payload.institution_id)
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")

    existing_count = len(session.exec(select(Application)).all())
    app_number = f"AICTE-{payload.academic_year[:4]}-{payload.category.name}-{existing_count + 1:04d}"

    application = Application(
        application_number=app_number,
        institution_id=payload.institution_id,
        submitted_by_user_id=current_user.id,
        academic_year=payload.academic_year,
        category=payload.category,
        declared_data=payload.declared_data,
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
    if current_user.role == UserRole.APPLICANT and current_user.institution_id:
        statement = statement.where(
            Application.institution_id == current_user.institution_id
        )
    return session.exec(statement).all()


@router.get("/applications/{application_id}", response_model=ApplicationDetailResponse)
def get_application_detail(
    application_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve full application status, dynamically computed category checklist completeness,
    and historical AICTE baseline records with IDOR protection.
    """
    application = session.get(Application, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    # IDOR Guard: An applicant can only view applications belonging to their own institution
    if current_user.role == UserRole.APPLICANT:
        if application.institution_id != current_user.institution_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You do not have permission to view applications belonging to another institution.",
            )

    institution = session.get(Institution, application.institution_id)
    return _build_application_detail(session, application, institution)


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

    uploaded_docs = session.exec(
        select(Document).where(Document.application_id == application.id)
    ).all()
    docs_by_type = {doc.document_type: doc for doc in uploaded_docs}

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
    )


@router.post("/applications/{application_id}/validate", tags=["Institutions & Applications (PRD §4.1)"])
def validate_application(
    application_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Trigger 100% offline cross-document reconciliation and regulatory compliance verification
    for all documents uploaded under this application packet.
    """
    application = session.get(Application, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    # IDOR Guard
    if current_user.role == UserRole.APPLICANT and application.institution_id != current_user.institution_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot trigger validation on applications belonging to another institution.",
        )

    from app.services.verification_services import verification_service

    try:
        result = verification_service.verify_entire_application(session, application_id)
        return {
            "message": "Full application validation completed successfully",
            "result": result,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/applications/queue/pending-review", response_model=List[Application])
def get_pending_review_queue(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_roles([UserRole.REVIEWER, UserRole.ADMIN])),
):
    """
    Officer review queue: lists all applications requiring statutory determination.
    """
    statement = select(Application).where(
        Application.status.in_([
            ApplicationStatus.READY_FOR_REVIEW,
            ApplicationStatus.PENDING_HUMAN_REVIEW,
            ApplicationStatus.DEFICIENCY_FLAGGED,
            ApplicationStatus.SUBMITTED,
        ])
    )
    return session.exec(statement).all()


@router.post("/applications/{application_id}/decision")
def record_officer_determination(
    application_id: int,
    action: str,  # APPROVE, REJECT, REQUEST_CORRECTION, ESCALATE
    officer_notes: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_roles([UserRole.REVIEWER, UserRole.ADMIN])),
):
    """
    Records an authorized human-in-the-loop regulatory determination.
    AI agents are strictly advisory; final approval or rejection requires an authorized officer.
    """
    application = session.get(Application, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    action_normalized = action.upper().strip()
    if action_normalized == "APPROVE":
        application.status = ApplicationStatus.APPROVED_BY_REVIEWER
    elif action_normalized == "REJECT":
        application.status = ApplicationStatus.REJECTED_BY_REVIEWER
    elif action_normalized == "REQUEST_CORRECTION":
        application.status = ApplicationStatus.RECTIFICATION_REQUESTED
    elif action_normalized == "ESCALATE":
        application.status = ApplicationStatus.PENDING_HUMAN_REVIEW
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action '{action}'. Permitted: APPROVE, REJECT, REQUEST_CORRECTION, ESCALATE")

    session.add(application)
    session.commit()
    session.refresh(application)

    log_audit_event(
        session,
        application_id=application.id,
        action_type=f"OFFICER_DECISION_{action_normalized}",
        entity_type="Application",
        entity_id=application.application_number,
        actor=current_user,
        summary=f"Officer '{current_user.email}' issued '{action_normalized}' decision on {application.application_number}.",
        details={"action": action_normalized, "officer_notes": officer_notes},
    )

    return {
        "message": f"Officer decision recorded successfully: {action_normalized}",
        "application_number": application.application_number,
        "new_status": application.status.value,
        "officer": current_user.email,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/applications/{application_id}/flags", response_model=List[ValidationFlagRead])
def list_application_flags(
    application_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List all explainable AI & rule-based flags (PRD §4.2, §4.4, §5) for an application.
    """
    application = session.get(Application, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    if current_user.role == UserRole.APPLICANT and application.institution_id != current_user.institution_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot view flags for another institution's application.",
        )

    flags = session.exec(
        select(ValidationFlag).where(ValidationFlag.application_id == application_id)
    ).all()
    return flags


@router.post("/flags/{flag_id}/resolve", response_model=ValidationFlagRead)
def resolve_validation_flag(
    flag_id: int,
    reviewer_action: str,  # CONFIRMED_DEFICIENCY, DISMISSED_FALSE_POSITIVE, RECTIFIED_BY_APPLICANT
    reviewer_notes: str = "",
    session: Session = Depends(get_session),
    current_user: User = Depends(require_roles([UserRole.REVIEWER, UserRole.ADMIN])),
):
    """
    Human-in-the-loop resolution of an individual AI/Rule validation flag by an AICTE Official.
    """
    flag = session.get(ValidationFlag, flag_id)
    if not flag:
        raise HTTPException(status_code=404, detail="Validation flag not found")

    flag.is_resolved = True
    flag.reviewer_action = reviewer_action.upper().strip()
    flag.reviewer_notes = reviewer_notes
    flag.reviewed_by_user_id = current_user.id
    flag.reviewed_at = datetime.now(timezone.utc)

    session.add(flag)
    session.commit()
    session.refresh(flag)

    log_audit_event(
        session,
        application_id=flag.application_id,
        action_type="VALIDATION_FLAG_RESOLVED",
        entity_type="ValidationFlag",
        entity_id=str(flag.id),
        actor=current_user,
        summary=f"Officer '{current_user.email}' resolved flag #{flag.id} as '{flag.reviewer_action}'.",
        details={"flag_id": flag.id, "action": flag.reviewer_action, "notes": reviewer_notes},
    )
    return flag


@router.post("/applications/{application_id}/submit-rectification")
def submit_application_rectification(
    application_id: int,
    applicant_notes: str = "Deficient documents replaced and application resubmitted for verification",
    updated_declared_data: dict | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Applicant Rectification Resubmission Endpoint (PRD §4.1):
    Allows an institution to amend declared fields or confirm replacement of flagged documents,
    automatically re-running cross-document and issuing-authority verification.
    """
    application = session.get(Application, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    if current_user.role == UserRole.APPLICANT and application.institution_id != current_user.institution_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot submit rectification for another institution's application.",
        )

    if updated_declared_data:
        merged = dict(application.declared_data or {})
        merged.update(updated_declared_data)
        application.declared_data = merged
        session.add(application)
        session.commit()

    from app.services.verification_services import verification_service
    verification_result = verification_service.verify_entire_application(session, application_id)
    session.refresh(application)

    log_audit_event(
        session,
        application_id=application.id,
        action_type="APPLICANT_RECTIFICATION_SUBMITTED",
        entity_type="Application",
        entity_id=application.application_number,
        actor=current_user,
        summary=f"Applicant '{current_user.email}' submitted rectification for {application.application_number}. New status: {application.status.value}.",
        details={"applicant_notes": applicant_notes, "new_status": application.status.value},
    )

    return {
        "message": "Rectification submitted and re-verified successfully.",
        "application_id": application.id,
        "application_number": application.application_number,
        "new_status": application.status.value,
        "verification_result": verification_result,
    }


@router.post("/applications/seed-golden-dossiers")
def trigger_seed_golden_dossiers(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Ensures the 4 Golden SIH26261 Evaluation Dossiers are seeded and verified.
    """
    from app.services.golden_dossiers_service import seed_golden_dossiers
    return seed_golden_dossiers(session)



