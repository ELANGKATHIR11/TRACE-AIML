"""Central object-level access guards (spec §4.1).

Reviewers and admins may read any application; applicants only those of their own
institution. A foreign or missing ID is a 404 with the same message, so the API is not an
existence oracle. `write=True` additionally limits applicants to editable statuses (409).
"""
from fastapi import HTTPException, status
from sqlmodel import Session

from app.http import StatusConflict
from app.models.enums import ApplicationStatus, UserRole
from app.models.models import Application, Document, User
from app.services.security import require_roles

APPLICANT_EDITABLE = frozenset({ApplicationStatus.DRAFT, ApplicationStatus.RECTIFICATION_REQUESTED})

APPLICATION_NOT_FOUND = "Application not found"
DOCUMENT_NOT_FOUND = "Document not found"

# Shared role dependencies for the spec §4.2 matrix.
require_applicant = require_roles([UserRole.APPLICANT])
require_reviewer = require_roles([UserRole.REVIEWER])
require_staff = require_roles([UserRole.REVIEWER, UserRole.ADMIN])
require_admin = require_roles([UserRole.ADMIN])


def _owns(user: User, application: Application) -> bool:
    if user.role != UserRole.APPLICANT:
        return True
    return user.institution_id is not None and application.institution_id == user.institution_id


def _check_application(application: Application | None, user: User, write: bool) -> Application | None:
    """Return the application if visible to `user`, else None; raise 409 on a blocked write."""
    if application is None or not _owns(user, application):
        return None
    if write and user.role == UserRole.APPLICANT and application.status not in APPLICANT_EDITABLE:
        raise StatusConflict(
            "Application is not editable in its current status", application.status.value
        )
    return application


def load_application(
    session: Session, application_id: int, user: User, *, write: bool = False
) -> Application:
    application = _check_application(session.get(Application, application_id), user, write)
    if application is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=APPLICATION_NOT_FOUND)
    return application


def load_document(session: Session, document_id: int, user: User, *, write: bool = False) -> Document:
    document = session.get(Document, document_id)
    application = session.get(Application, document.application_id) if document else None
    if _check_application(application, user, write) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=DOCUMENT_NOT_FOUND)
    return document
