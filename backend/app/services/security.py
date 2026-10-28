from typing import Callable, List, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, func, select

from app.database import get_session
from app.models.enums import UserRole
from app.models.models import User
from app.services.tokens import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128
# bcrypt only reads the first 72 bytes (bcrypt>=5 raises beyond that), so inputs are
# truncated explicitly; passwords up to PASSWORD_MAX_LENGTH chars stay usable.
_BCRYPT_MAX_BYTES = 72

# Paths reachable while `must_change_password` is set (refresh/logout don't use bearer auth).
PASSWORD_CHANGE_EXEMPT = frozenset({"/api/auth/me", "/api/auth/change-password"})


def _bcrypt_input(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_bcrypt_input(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_bcrypt_input(plain_password), hashed_password.encode("utf-8"))
    except ValueError:
        return False


def validate_password_policy(password: str, email: str) -> None:
    """Raise ValueError (with a user-facing message) if `password` violates the policy."""
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters")
    if len(password) > PASSWORD_MAX_LENGTH:
        raise ValueError(f"Password must be at most {PASSWORD_MAX_LENGTH} characters")
    lowered = password.lower()
    email = email.lower()
    if lowered == email or lowered == email.split("@", 1)[0]:
        raise ValueError("Password must not match the email address")


def find_user_by_email(session: Session, email: str) -> Optional[User]:
    """Case-insensitive, whitespace-trimmed lookup (also matches pre-normalisation mixed-case rows)."""
    return session.exec(
        select(User).where(func.lower(User.email) == email.strip().lower()).order_by(User.id)
    ).first()


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user_allow_pending(
    token: Optional[str] = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    """Authenticated, active user with a current token_version; no password-change gate."""
    if not token:
        raise _credentials_exception()
    try:
        claims = decode_access_token(token)
        user_id = int(claims["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise _credentials_exception() from None

    user = session.get(User, user_id)
    if user is None or not user.is_active or claims.get("tv") != user.token_version:
        raise _credentials_exception()
    return user


def get_current_user(
    request: Request,
    user: User = Depends(get_current_user_allow_pending),
) -> User:
    if user.must_change_password and request.url.path not in PASSWORD_CHANGE_EXEMPT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password change required")
    return user


def require_roles(allowed_roles: List[UserRole]) -> Callable:
    """RBAC dependency factory enforcing PRD §3 User Personas & §5 Security."""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role.value}' is not authorized. Allowed roles: {[r.value for r in allowed_roles]}",
            )
        return current_user

    return role_checker
