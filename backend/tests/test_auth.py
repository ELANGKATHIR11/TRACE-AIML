import json
from datetime import timedelta

import pytest
from sqlmodel import select

from app.models.models import AuditLog, User
from app.services.tokens import utc_now
from tests.conftest import make_user

PASSWORD = "Correct-Horse-9"
GENERIC_401 = {"detail": "Incorrect email or password"}


def _login(client, email, password=PASSWORD):
    return client.post("/api/auth/login", data={"username": email, "password": password})


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_success_sets_cookie(client, session):
    user = make_user(session, "reviewer")
    resp = _login(client, user.email)
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 900
    assert body["user"]["email"] == user.email
    assert body["user"]["must_change_password"] is False
    cookie = resp.headers["set-cookie"]
    assert "trace_refresh=" in cookie
    assert "HttpOnly" in cookie
    assert "Path=/api/auth" in cookie
    assert "SameSite=strict" in cookie
    assert "Max-Age=" in cookie


def test_login_unknown_email_and_wrong_password_identical(client, session):
    user = make_user(session, "reviewer")
    unknown = _login(client, "nobody@example.test")
    wrong = _login(client, user.email, "Wrong-Password-1")
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json() == GENERIC_401


def test_lockout_after_five_failures(client, session):
    user = make_user(session, "reviewer")
    for _ in range(5):
        assert _login(client, user.email, "Wrong-Password-1").status_code == 401

    locked = _login(client, user.email)
    assert locked.status_code == 401
    assert locked.json() == GENERIC_401

    session.expire_all()
    db_user = session.get(User, user.id)
    assert db_user.locked_until is not None
    actions = [a.action_type for a in session.exec(select(AuditLog)).all()]
    assert actions.count("ACCOUNT_LOCKED") == 1

    # Attempts during an active lock neither extend it nor re-lock it.
    locked_until = db_user.locked_until
    assert _login(client, user.email, "Wrong-Password-1").status_code == 401
    assert _login(client, user.email).status_code == 401
    session.expire_all()
    db_user = session.get(User, user.id)
    assert db_user.locked_until == locked_until
    actions = [a.action_type for a in session.exec(select(AuditLog)).all()]
    assert actions.count("ACCOUNT_LOCKED") == 1

    db_user.locked_until = utc_now() - timedelta(minutes=1)
    session.add(db_user)
    session.commit()
    session.expire_all()

    resp = _login(client, user.email)
    assert resp.status_code == 200
    session.expire_all()
    db_user = session.get(User, user.id)
    assert db_user.failed_login_count == 0
    assert db_user.locked_until is None


def test_correct_password_after_four_failures_succeeds(client, session):
    user = make_user(session, "reviewer")
    for _ in range(4):
        assert _login(client, user.email, "Wrong-Password-1").status_code == 401
    assert _login(client, user.email).status_code == 200
    session.expire_all()
    assert session.get(User, user.id).failed_login_count == 0


def test_lock_during_password_check_rejects_login(client, session, monkeypatch):
    """A lock that lands while bcrypt runs must win over a correct password."""
    from sqlmodel import Session

    from app.api import auth as auth_api
    from app.database import get_engine
    from app.models.models import RefreshToken

    user = make_user(session, "reviewer")
    real_verify = auth_api.verify_password

    def verify_then_lock(plain, hashed):
        ok = real_verify(plain, hashed)
        if ok and plain == PASSWORD:
            with Session(get_engine()) as other:
                u = other.get(User, user.id)
                u.locked_until = utc_now() + timedelta(minutes=15)
                other.add(u)
                other.commit()
        return ok

    monkeypatch.setattr(auth_api, "verify_password", verify_then_lock)
    resp = _login(client, user.email)
    assert resp.status_code == 401
    assert resp.json() == GENERIC_401
    assert "set-cookie" not in resp.headers
    assert session.exec(select(RefreshToken).where(RefreshToken.user_id == user.id)).first() is None
    actions = [a.action_type for a in session.exec(select(AuditLog)).all()]
    assert "LOGIN_SUCCEEDED" not in actions


def test_exhausted_attempt_budget_never_checks_password(client, session, monkeypatch):
    """With the failure budget used up (e.g. concurrent attempts in flight), no more guesses."""
    from app.api import auth as auth_api

    user = make_user(session, "reviewer")
    user.failed_login_count = 5
    session.add(user)
    session.commit()

    checked = []
    real_verify = auth_api.verify_password

    def spy(plain, hashed):
        checked.append(hashed)
        return real_verify(plain, hashed)

    monkeypatch.setattr(auth_api, "verify_password", spy)
    resp = _login(client, user.email)
    assert resp.status_code == 401
    session.expire_all()
    db_user = session.get(User, user.id)
    assert db_user.hashed_password not in checked
    assert db_user.locked_until is not None  # stuck budget turns into a time-limited lock


def test_ip_rate_limit(client):
    for _ in range(20):
        assert _login(client, "nobody@example.test", "Wrong-Password-1").status_code == 401
    assert _login(client, "nobody@example.test", "Wrong-Password-1").status_code == 429


def test_refresh_returns_new_access_token(client, session):
    user = make_user(session, "reviewer")
    first = _login(client, user.email)
    old_cookie = client.cookies.get("trace_refresh")

    resp = client.post("/api/auth/refresh")
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"] and body["access_token"] != first.json()["access_token"]
    assert body["expires_in"] == 900
    assert body["user"]["id"] == user.id
    assert client.cookies.get("trace_refresh") != old_cookie
    assert client.get("/api/auth/me", headers=_bearer(body["access_token"])).status_code == 200


def test_refresh_without_cookie_401(client):
    resp = client.post("/api/auth/refresh")
    assert resp.status_code == 401


def test_logout_revokes_family(client, session):
    user = make_user(session, "reviewer")
    _login(client, user.email)
    raw = client.cookies.get("trace_refresh")

    resp = client.post("/api/auth/logout")
    assert resp.status_code == 204
    assert "trace_refresh=" in resp.headers["set-cookie"]

    client.cookies.clear()
    client.cookies.set("trace_refresh", raw, path="/api/auth")
    assert client.post("/api/auth/refresh").status_code == 401

    actions = [a.action_type for a in session.exec(select(AuditLog)).all()]
    assert "LOGOUT" in actions


def test_logout_without_cookie_is_204(client):
    resp = client.post("/api/auth/logout")
    assert resp.status_code == 204
    assert "trace_refresh=" in resp.headers["set-cookie"]


def test_no_token_is_401(client, session):
    make_user(session, "reviewer")  # a user existing must not enable any fallback
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/applications").status_code == 401


def test_token_version_bump_invalidates_access_token(client, session):
    user = make_user(session, "reviewer")
    token = _login(client, user.email).json()["access_token"]
    assert client.get("/api/auth/me", headers=_bearer(token)).status_code == 200

    session.expire_all()
    db_user = session.get(User, user.id)
    db_user.token_version += 1
    session.add(db_user)
    session.commit()

    assert client.get("/api/auth/me", headers=_bearer(token)).status_code == 401


def test_inactive_user_token_rejected(client, session):
    user = make_user(session, "reviewer")
    token = _login(client, user.email).json()["access_token"]
    session.expire_all()
    db_user = session.get(User, user.id)
    db_user.is_active = False
    session.add(db_user)
    session.commit()
    assert client.get("/api/auth/me", headers=_bearer(token)).status_code == 401
    assert _login(client, user.email).json() == GENERIC_401


def test_must_change_password_gate(client, session):
    user = make_user(session, "reviewer", must_change_password=True)
    login = _login(client, user.email)
    assert login.status_code == 200
    assert login.json()["user"]["must_change_password"] is True
    old_token = login.json()["access_token"]

    gated = client.get("/api/applications", headers=_bearer(old_token))
    assert gated.status_code == 403
    assert gated.json() == {"detail": "Password change required"}
    assert client.get("/api/auth/me", headers=_bearer(old_token)).status_code == 200

    new_password = "Brand-New-Secret-42"
    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": new_password},
        headers=_bearer(old_token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["must_change_password"] is False
    new_token = body["access_token"]

    assert client.get("/api/applications", headers=_bearer(new_token)).status_code == 200
    assert client.get("/api/auth/me", headers=_bearer(old_token)).status_code == 401
    assert _login(client, user.email, new_password).status_code == 200


def test_change_password_revokes_refresh_families(client, session):
    user = make_user(session, "reviewer")
    token = _login(client, user.email).json()["access_token"]
    old_refresh = client.cookies.get("trace_refresh")
    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "Brand-New-Secret-42"},
        headers=_bearer(token),
    )
    assert resp.status_code == 200
    client.cookies.clear()
    client.cookies.set("trace_refresh", old_refresh, path="/api/auth")
    assert client.post("/api/auth/refresh").status_code == 401


def test_change_password_policy(client, session):
    user = make_user(session, "reviewer", email="longlocalpart1@example.test")
    token = _login(client, user.email).json()["access_token"]

    def change(current, new):
        return client.post(
            "/api/auth/change-password",
            json={"current_password": current, "new_password": new},
            headers=_bearer(token),
        )

    assert change(PASSWORD, "Short-Pass1").status_code == 422  # 11 chars
    assert change(PASSWORD, "x" * 129).status_code == 422
    assert change(PASSWORD, "LongLocalPart1").status_code == 422  # equals email local-part
    assert change("Not-The-Password-1", "Brand-New-Secret-42").status_code == 400


def test_long_password_within_policy_works(client, session):
    user = make_user(session, "reviewer")
    token = _login(client, user.email).json()["access_token"]
    long_password = "Ab1-" * 25  # 100 chars, beyond bcrypt's 72-byte input limit
    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": long_password},
        headers=_bearer(token),
    )
    assert resp.status_code == 200
    assert _login(client, user.email, long_password).status_code == 200


def test_validate_password_policy_unit():
    from app.services.security import validate_password_policy

    email = "someone.long@example.test"
    validate_password_policy("Brand-New-Secret-42", email)
    validate_password_policy("x" * 128, email)
    for bad in ("x" * 11, "x" * 129, "Someone.Long"):
        with pytest.raises(ValueError):
            validate_password_policy(bad, email)


def test_removed_auth_routes(client):
    assert client.post("/api/auth/switch", json={}).status_code == 404
    assert client.post("/api/auth/register", json={}).status_code == 404
    assert client.get("/api/auth/demo-personas").status_code == 404


def test_audit_never_contains_password(client, session):
    user = make_user(session, "reviewer")
    new_password = "Brand-New-Secret-42"
    _login(client, user.email, "Wrong-Password-1")
    login = _login(client, user.email)
    token = login.json()["access_token"]
    refresh = client.cookies.get("trace_refresh")
    client.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": new_password},
        headers=_bearer(token),
    )
    client.post("/api/auth/logout")

    rows = session.exec(select(AuditLog)).all()
    actions = {r.action_type for r in rows}
    assert {"LOGIN_FAILED", "LOGIN_SUCCEEDED", "PASSWORD_CHANGED"} <= actions
    for row in rows:
        dumped = json.dumps(row.model_dump(), default=str)
        for secret in (PASSWORD, new_password, "Wrong-Password-1", token, refresh):
            assert secret not in dumped
