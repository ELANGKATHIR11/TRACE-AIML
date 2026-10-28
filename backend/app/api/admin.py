from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.database import get_session
from app.models.enums import UserRole
from app.models.models import Institution, User
from app.schemas.schemas import AdminUserCreate, AdminUserUpdate, UserRead
from app.services import tokens
from app.services.audit_service import log_audit_event
from app.services.security import hash_password, require_roles, validate_password_policy

router = APIRouter(prefix="/api/admin", tags=["Admin"])

_UNPROCESSABLE = status.HTTP_422_UNPROCESSABLE_CONTENT


def _to_read(user: User) -> UserRead:
    return UserRead.model_validate(user, from_attributes=True)


def _check_role_institution(session: Session, role: UserRole, institution_id: Optional[int]) -> None:
    if role == UserRole.APPLICANT:
        if institution_id is None:
            raise HTTPException(_UNPROCESSABLE, "An applicant requires an institution_id")
        if session.get(Institution, institution_id) is None:
            raise HTTPException(_UNPROCESSABLE, "Unknown institution_id")
    elif institution_id is not None:
        raise HTTPException(_UNPROCESSABLE, f"A {role.value} must not have an institution_id")


def _check_password(password: str, email: str) -> None:
    try:
        validate_password_policy(password, email)
    except ValueError as exc:
        raise HTTPException(_UNPROCESSABLE, str(exc)) from None


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminUserCreate,
    admin: User = Depends(require_roles([UserRole.ADMIN])),
    session: Session = Depends(get_session),
):
    _check_role_institution(session, payload.role, payload.institution_id)
    _check_password(payload.temporary_password, payload.email)
    if session.exec(select(User).where(User.email == payload.email)).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.temporary_password),
        role=payload.role,
        institution_id=payload.institution_id,
        must_change_password=True,
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists") from None
    session.refresh(user)
    log_audit_event(
        session,
        action_type="USER_CREATED",
        entity_type="User",
        entity_id=str(user.id),
        actor=admin,
        summary=f"Admin created {user.role.value} user {user.email}",
        details={"role": user.role.value, "institution_id": user.institution_id},
    )
    return _to_read(user)


@router.get("/users", response_model=List[UserRead])
def list_users(
    _admin: User = Depends(require_roles([UserRole.ADMIN])),
    session: Session = Depends(get_session),
):
    return [_to_read(u) for u in session.exec(select(User).order_by(User.id)).all()]


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    admin: User = Depends(require_roles([UserRole.ADMIN])),
    session: Session = Depends(get_session),
):
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    sent = payload.model_fields_set
    new_role = payload.role if payload.role is not None else user.role
    new_institution = payload.institution_id if "institution_id" in sent else user.institution_id
    new_active = payload.is_active if payload.is_active is not None else user.is_active

    if user.id == admin.id and (new_active is False or new_role != UserRole.ADMIN):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Admins cannot deactivate or demote themselves")
    if user.id == admin.id and payload.reset_password is not None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Admins cannot reset their own password here; use change-password"
        )
    _check_role_institution(session, new_role, new_institution)
    if payload.reset_password is not None:
        _check_password(payload.reset_password, user.email)

    changed: List[str] = []
    invalidate_sessions = False
    if payload.full_name is not None and payload.full_name != user.full_name:
        user.full_name = payload.full_name
        changed.append("full_name")
    if new_role != user.role:
        user.role = new_role
        changed.append("role")
        invalidate_sessions = True
    if new_institution != user.institution_id:
        user.institution_id = new_institution
        changed.append("institution_id")
    if new_active != user.is_active:
        user.is_active = new_active
        changed.append("is_active")
        invalidate_sessions = True
    if payload.reset_password is not None:
        user.hashed_password = hash_password(payload.reset_password)
        user.must_change_password = True
        user.failed_login_count = 0
        user.locked_until = None
        changed.append("password")
        invalidate_sessions = True

    if not changed:
        return _to_read(user)

    if invalidate_sessions:
        user.token_version += 1
        # Access tokens die via token_version; refresh families are revoked in the same commit.
        tokens.revoke_all_for_user(session, user.id, commit=False)
    session.add(user)
    session.commit()
    session.refresh(user)
    log_audit_event(
        session,
        action_type="USER_UPDATED",
        entity_type="User",
        entity_id=str(user.id),
        actor=admin,
        summary=f"Admin updated user {user.email}",
        details={"changed_fields": changed},
    )
    return _to_read(user)
