import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import and_, not_
from sqlalchemy import update as sa_update
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.models.models import User
from app.schemas.schemas import ChangePasswordRequest, LoginResponse, UserRead
from app.services import tokens
from app.services.audit_service import log_audit_event
from app.services.rate_limit import SlidingWindowLimiter
from app.services.security import (
    get_current_user,
    hash_password,
    validate_password_policy,
    verify_password,
)
from app.services.tokens import as_utc, utc_now

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

REFRESH_COOKIE_NAME = "trace_refresh"
REFRESH_COOKIE_PATH = "/api/auth"
LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION = timedelta(minutes=15)
LOGIN_FAILED_DETAIL = "Incorrect email or password"

# Per-IP login limiter (in-process; see rate_limit module docstring).
login_limiter = SlidingWindowLimiter(20, 300)

# Verified against for unknown emails so response timing doesn't reveal account existence.
_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(24))


def set_refresh_cookie(response: Response, raw: str, expires_at: datetime) -> None:
    max_age = max(0, int((as_utc(expires_at) - utc_now()).total_seconds()))
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        raw,
        max_age=max_age,
        path=REFRESH_COOKIE_PATH,
        secure=settings.COOKIE_SECURE,
        httponly=True,
        samesite=settings.COOKIE_SAMESITE,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        secure=settings.COOKIE_SECURE,
        httponly=True,
        samesite=settings.COOKIE_SAMESITE,
    )


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _login_failed() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=LOGIN_FAILED_DETAIL,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _audit_login_failed(session: Session, user: Optional[User], reason: str, ip: str) -> None:
    details = {"reason": reason, "ip": ip}
    if user is not None:
        details["failed_login_count"] = user.failed_login_count
    log_audit_event(
        session,
        action_type="LOGIN_FAILED",
        entity_type="User",
        entity_id=str(user.id) if user is not None else None,
        actor_role_override="ANONYMOUS",
        summary="Sign-in attempt failed",
        details=details,
    )


def _issue_session(
    response: Response, user: User, raw_refresh: str, refresh_expires_at: datetime
) -> LoginResponse:
    access_token, expires_in = tokens.create_access_token(user)
    set_refresh_cookie(response, raw_refresh, refresh_expires_at)
    response.headers["Cache-Control"] = "no-store"
    return LoginResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserRead.model_validate(user, from_attributes=True),
    )


def _locked_now(now: datetime):
    return and_(User.locked_until.is_not(None), User.locked_until > now)


def _reserve_login_attempt(session: Session, user_id: int) -> bool:
    """Atomically count this attempt before the password is checked.

    At most LOCKOUT_THRESHOLD attempts can be reserved per failure window, so concurrent
    requests cannot get extra password guesses past the lockout. An expired lock starts a
    fresh window. Returns False if the account is locked or its budget is exhausted.
    """
    now = utc_now()
    session.execute(
        sa_update(User)
        .where(User.id == user_id, User.locked_until.is_not(None), User.locked_until <= now)
        .values(failed_login_count=0, locked_until=None)
    )
    reserved = session.execute(
        sa_update(User)
        .where(
            User.id == user_id,
            not_(_locked_now(now)),
            User.failed_login_count < LOCKOUT_THRESHOLD,
        )
        .values(failed_login_count=User.failed_login_count + 1)
    )
    session.commit()
    return reserved.rowcount == 1


def _lock_if_exhausted(session: Session, user: User, ip: str) -> None:
    """Lock the account once its failure count reaches the threshold (never extends a lock)."""
    now = utc_now()
    locked = session.execute(
        sa_update(User)
        .where(
            User.id == user.id,
            User.failed_login_count >= LOCKOUT_THRESHOLD,
            not_(_locked_now(now)),
        )
        .values(locked_until=now + LOCKOUT_DURATION)
    )
    session.commit()
    session.refresh(user)
    if locked.rowcount == 1:
        log_audit_event(
            session,
            action_type="ACCOUNT_LOCKED",
            entity_type="User",
            entity_id=str(user.id),
            actor_role_override="SYSTEM",
            summary=f"Account locked after {user.failed_login_count} failed sign-in attempts",
            details={
                "failed_login_count": user.failed_login_count,
                "locked_until": as_utc(user.locked_until).isoformat(),
                "ip": ip,
            },
        )


def _claim_login_success(session: Session, user_id: int) -> bool:
    """Reset failure state unless the account got locked meanwhile; False means reject."""
    claimed = session.execute(
        sa_update(User)
        .where(User.id == user_id, not_(_locked_now(utc_now())))
        .values(failed_login_count=0, locked_until=None)
    )
    session.commit()
    return claimed.rowcount == 1


@router.post("/login", response_model=LoginResponse)
def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
):
    """OAuth2 password login (`username` is the user's email address)."""
    ip = _client_ip(request)
    if not login_limiter.hit(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
        )

    user = session.exec(select(User).where(User.email == form_data.username)).first()
    if user is None:
        verify_password(form_data.password, _DUMMY_PASSWORD_HASH)
        _audit_login_failed(session, None, "unknown_account", ip)
        raise _login_failed()

    user_id = user.id
    if not _reserve_login_attempt(session, user_id):
        # Locked (or attempt budget exhausted): keep timing comparable, never check the password.
        verify_password(form_data.password, _DUMMY_PASSWORD_HASH)
        _lock_if_exhausted(session, user, ip)
        _audit_login_failed(session, user, "account_locked", ip)
        raise _login_failed()

    if not verify_password(form_data.password, user.hashed_password):
        _lock_if_exhausted(session, user, ip)
        _audit_login_failed(session, user, "bad_password", ip)
        raise _login_failed()

    if not user.is_active:
        _audit_login_failed(session, user, "inactive", ip)
        raise _login_failed()

    if not _claim_login_success(session, user_id):
        # Account was locked while this attempt's password was being checked.
        _audit_login_failed(session, user, "account_locked", ip)
        raise _login_failed()

    raw_refresh, refresh_row = tokens.issue_refresh_token(session, user)
    log_audit_event(
        session,
        action_type="LOGIN_SUCCEEDED",
        entity_type="User",
        entity_id=str(user.id),
        actor=user,
        summary="User signed in",
        details={"ip": ip},
    )
    return _issue_session(response, user, raw_refresh, refresh_row.expires_at)


def _refresh_rejected() -> JSONResponse:
    resp = JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": "Invalid refresh token"}
    )
    clear_refresh_cookie(resp)
    return resp


@router.post("/refresh", response_model=LoginResponse)
def refresh(
    response: Response,
    trace_refresh: Optional[str] = Cookie(default=None),
    session: Session = Depends(get_session),
):
    """Rotate the refresh cookie and return a new access token."""
    if not trace_refresh:
        return _refresh_rejected()
    try:
        user, raw_new, new_row = tokens.rotate_refresh_token(session, trace_refresh)
    except tokens.RefreshTokenError:
        return _refresh_rejected()
    return _issue_session(response, user, raw_new, new_row.expires_at)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    trace_refresh: Optional[str] = Cookie(default=None),
    session: Session = Depends(get_session),
):
    """Revoke the presented refresh token's family and clear the cookie. Always 204."""
    if trace_refresh:
        row = tokens.find_refresh_token(session, trace_refresh)
        if row is not None:
            tokens.revoke_family(session, row.family_id)
            log_audit_event(
                session,
                action_type="LOGOUT",
                entity_type="User",
                entity_id=str(row.user_id),
                actor=session.get(User, row.user_id),
                summary="User signed out; refresh token family revoked",
                details={"family_id": row.family_id},
            )
    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_refresh_cookie(resp)
    return resp


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password", response_model=LoginResponse)
def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Change own password; invalidates all existing sessions and starts a new one."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    try:
        validate_password_policy(payload.new_password, current_user.email)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from None
    if verify_password(payload.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="New password must differ from the current password",
        )

    was_required = current_user.must_change_password
    current_user.hashed_password = hash_password(payload.new_password)
    current_user.token_version += 1
    current_user.must_change_password = False
    session.add(current_user)
    # One transaction: the new password never becomes valid while old refresh families survive.
    tokens.revoke_all_for_user(session, current_user.id, commit=False)
    session.commit()
    session.refresh(current_user)

    log_audit_event(
        session,
        action_type="PASSWORD_CHANGED",
        entity_type="User",
        entity_id=str(current_user.id),
        actor=current_user,
        summary="User changed their password; all sessions revoked",
        details={"was_required": was_required},
    )
    raw_refresh, refresh_row = tokens.issue_refresh_token(session, current_user)
    return _issue_session(response, current_user, raw_refresh, refresh_row.expires_at)
