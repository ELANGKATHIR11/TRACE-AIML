import base64
import json
from datetime import timedelta

import jwt
import pytest
from sqlmodel import select

from app.config import settings
from app.models.models import AuditLog, RefreshToken
from app.services import tokens
from app.services.tokens import RefreshTokenError, as_utc
from tests.conftest import make_user


def _b64(obj) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


def _payload(user, **over):
    now = tokens.utc_now()
    p = {
        "sub": str(user.id), "role": user.role.value, "tv": 0,
        "iat": now, "exp": now + timedelta(minutes=15), "jti": "x",
        "iss": "trace-api", "aud": "trace-web",
    }
    p.update(over)
    return p


def test_access_token_claims(session):
    user = make_user(session, "applicant")
    token, expires_in = tokens.create_access_token(user)
    claims = tokens.decode_access_token(token)
    assert claims["sub"] == str(user.id)
    assert claims["tv"] == 0
    assert claims["role"] == "applicant"
    assert claims["iss"] == "trace-api"
    assert claims["aud"] == "trace-web"
    assert claims["jti"]
    assert claims["exp"] - claims["iat"] == 900
    assert expires_in == 900


def test_decode_rejects_alg_none(session):
    user = make_user(session, "applicant")
    p = _payload(user)
    p["iat"] = int(p["iat"].timestamp())
    p["exp"] = int(p["exp"].timestamp())
    forged = f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{_b64(p)}."
    with pytest.raises(jwt.PyJWTError):
        tokens.decode_access_token(forged)


def test_decode_rejects_wrong_audience(session):
    user = make_user(session, "applicant")
    t = jwt.encode(_payload(user, aud="other"), settings.SECRET_KEY, algorithm="HS256")
    with pytest.raises(jwt.PyJWTError):
        tokens.decode_access_token(t)


def test_decode_rejects_tampered_signature(session):
    user = make_user(session, "applicant")
    token, _ = tokens.create_access_token(user)
    head, body, sig = token.split(".")
    bad = ("A" if sig[0] != "A" else "B") + sig[1:]
    with pytest.raises(jwt.PyJWTError):
        tokens.decode_access_token(f"{head}.{body}.{bad}")


def test_decode_rejects_expired(session):
    user = make_user(session, "applicant")
    past = tokens.utc_now() - timedelta(hours=1)
    t = jwt.encode(
        _payload(user, iat=past - timedelta(minutes=15), exp=past),
        settings.SECRET_KEY, algorithm="HS256",
    )
    with pytest.raises(jwt.PyJWTError):
        tokens.decode_access_token(t)


def test_refresh_rotation_returns_new_token_and_marks_old_replaced(session):
    user = make_user(session, "applicant")
    raw1, row1 = tokens.issue_refresh_token(session, user)
    got_user, raw2, row2 = tokens.rotate_refresh_token(session, raw1)
    assert got_user.id == user.id
    assert raw2 != raw1
    session.refresh(row1)
    assert row1.replaced_by_id == row2.id
    assert row1.revoked_at is not None
    assert row2.family_id == row1.family_id
    assert row2.revoked_at is None
    assert row2.token_hash != raw2  # only hash stored


def test_refresh_reuse_revokes_whole_family(session):
    user = make_user(session, "applicant")
    raw1, _ = tokens.issue_refresh_token(session, user)
    _, raw2, _ = tokens.rotate_refresh_token(session, raw1)
    with pytest.raises(RefreshTokenError):
        tokens.rotate_refresh_token(session, raw1)
    with pytest.raises(RefreshTokenError):
        tokens.rotate_refresh_token(session, raw2)
    events = session.exec(
        select(AuditLog).where(AuditLog.action_type == "REFRESH_TOKEN_REUSE_DETECTED")
    ).all()
    assert len(events) >= 1
    assert raw1 not in json.dumps(events[0].details)
    rows = session.exec(select(RefreshToken)).all()
    assert all(r.revoked_at is not None for r in rows)


def test_family_expiry_not_extended_by_rotation(session):
    user = make_user(session, "applicant")
    fam_exp = tokens.utc_now() + timedelta(seconds=30)
    raw1, row1 = tokens.issue_refresh_token(session, user, family_expires_at=fam_exp)
    _, _, row2 = tokens.rotate_refresh_token(session, raw1)
    assert as_utc(row2.expires_at) == fam_exp


def test_expired_refresh_after_db_roundtrip(session):
    user = make_user(session, "applicant")
    raw, row = tokens.issue_refresh_token(session, user)
    row.expires_at = tokens.utc_now() - timedelta(seconds=5)
    session.add(row)
    session.commit()
    session.expire_all()
    with pytest.raises(RefreshTokenError):
        tokens.rotate_refresh_token(session, raw)


def test_inactive_user_cannot_refresh(session):
    user = make_user(session, "applicant")
    raw, _ = tokens.issue_refresh_token(session, user)
    user.is_active = False
    session.add(user)
    session.commit()
    with pytest.raises(RefreshTokenError):
        tokens.rotate_refresh_token(session, raw)


def test_unknown_token_rejected(session):
    with pytest.raises(RefreshTokenError):
        tokens.rotate_refresh_token(session, "nope")


def test_revoke_all_for_user(session):
    user = make_user(session, "applicant")
    tokens.issue_refresh_token(session, user)
    tokens.issue_refresh_token(session, user)
    tokens.revoke_all_for_user(session, user.id)
    rows = session.exec(select(RefreshToken)).all()
    assert rows and all(r.revoked_at is not None for r in rows)
