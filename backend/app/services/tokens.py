"""Access-token (JWT) and rotating refresh-token service."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

import jwt
from sqlalchemy import update as sa_update
from sqlmodel import Session, select

from app.config import settings
from app.models.models import RefreshToken, User
from app.services.audit_service import log_audit_event

JWT_ALGORITHM = "HS256"
JWT_ISSUER = "trace-api"
JWT_AUDIENCE = "trace-web"


class RefreshTokenError(Exception):
    """Refresh token is unknown, expired, revoked, reused, or its user is inactive."""


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Treat naive datetimes (as read back from SQLite) as UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def create_access_token(user: User) -> tuple[str, int]:
    now = utc_now()
    lifetime = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "tv": user.token_version,
        "iat": now,
        "exp": now + lifetime,
        "jti": str(uuid4()),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)
    return token, int(lifetime.total_seconds())


def decode_access_token(token: str) -> dict:
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[JWT_ALGORITHM],
        audience=JWT_AUDIENCE,
        issuer=JWT_ISSUER,
        options={"require": ["exp", "iat", "sub", "tv"]},
    )


def issue_refresh_token(
    session: Session,
    user: User,
    family_id: Optional[str] = None,
    family_expires_at: Optional[datetime] = None,
    *,
    commit: bool = True,
) -> tuple[str, RefreshToken]:
    now = utc_now()
    raw = secrets.token_urlsafe(32)
    row = RefreshToken(
        user_id=user.id,
        family_id=family_id or str(uuid4()),
        token_hash=_hash(raw),
        issued_at=now,
        expires_at=family_expires_at or now + timedelta(hours=settings.REFRESH_TOKEN_EXPIRE_HOURS),
    )
    session.add(row)
    if commit:
        session.commit()
        session.refresh(row)
    else:
        session.flush()
    return raw, row


def _revoke_family_rows(session: Session, family_id: str) -> None:
    now = utc_now()
    rows = session.exec(
        select(RefreshToken).where(
            RefreshToken.family_id == family_id, RefreshToken.revoked_at == None  # noqa: E711
        )
    ).all()
    for r in rows:
        r.revoked_at = now
        session.add(r)


def revoke_family(session: Session, family_id: str) -> None:
    _revoke_family_rows(session, family_id)
    session.commit()


def revoke_all_for_user(session: Session, user_id: int) -> None:
    now = utc_now()
    rows = session.exec(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id, RefreshToken.revoked_at == None  # noqa: E711
        )
    ).all()
    for r in rows:
        r.revoked_at = now
        session.add(r)
    session.commit()


def _reuse_detected(session: Session, row: RefreshToken, user: Optional[User]) -> RefreshTokenError:
    _revoke_family_rows(session, row.family_id)
    session.commit()
    log_audit_event(
        session,
        action_type="REFRESH_TOKEN_REUSE_DETECTED",
        entity_type="User",
        entity_id=str(row.user_id),
        summary="Revoked or replaced refresh token presented again; token family revoked",
        actor=user,
        details={"family_id": row.family_id},
    )
    return RefreshTokenError("Refresh token reuse detected")


def rotate_refresh_token(session: Session, raw: str) -> tuple[User, str, RefreshToken]:
    row = session.exec(select(RefreshToken).where(RefreshToken.token_hash == _hash(raw))).first()
    if row is None:
        raise RefreshTokenError("Invalid refresh token")

    user = session.get(User, row.user_id)

    if row.revoked_at is not None or row.replaced_by_id is not None:
        raise _reuse_detected(session, row, user)
    if as_utc(row.expires_at) <= utc_now():
        raise RefreshTokenError("Refresh token expired")
    if user is None or not user.is_active:
        raise RefreshTokenError("User inactive")

    # Atomically claim the old row; a concurrent rotation that got there first
    # leaves rowcount 0, which is treated as reuse.
    claimed = session.execute(
        sa_update(RefreshToken)
        .where(
            RefreshToken.id == row.id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.replaced_by_id.is_(None),
        )
        .values(revoked_at=utc_now())
    )
    if claimed.rowcount != 1:
        session.rollback()
        raise _reuse_detected(session, row, user)

    new_raw, new_row = issue_refresh_token(
        session, user, family_id=row.family_id, family_expires_at=as_utc(row.expires_at), commit=False
    )
    session.execute(
        sa_update(RefreshToken).where(RefreshToken.id == row.id).values(replaced_by_id=new_row.id)
    )
    session.commit()
    session.refresh(new_row)
    return user, new_raw, new_row
