import getpass

import pytest
from sqlmodel import select

from app import cli
from app.models.enums import UserRole
from app.models.models import AuditLog, Institution, User
from tests.conftest import make_user

PW = "Correct-Horse-9"
TEMP = "Temporary-Pass-123"


def login(client, user, password=PW):
    r = client.post("/api/auth/login", data={"username": user.email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def institution_id(session):
    return session.exec(select(Institution)).first().id


@pytest.fixture()
def admin_headers(client, admin):
    return bearer(login(client, admin))


def payload(**over):
    body = {
        "email": "new.user@example.test",
        "full_name": "New User",
        "role": "reviewer",
        "temporary_password": TEMP,
    }
    body.update(over)
    return body


def test_admin_creates_applicant_with_institution(client, session, admin_headers, institution_id):
    r = client.post(
        "/api/admin/users",
        json=payload(role="applicant", institution_id=institution_id),
        headers=admin_headers,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["must_change_password"] is True
    assert body["institution_id"] == institution_id
    assert "hashed_password" not in body and "temporary_password" not in body
    user = session.exec(select(User).where(User.email == "new.user@example.test")).one()
    assert user.must_change_password is True
    audit = session.exec(select(AuditLog).where(AuditLog.action_type == "USER_CREATED")).one()
    assert TEMP not in str(audit.details) and TEMP not in audit.summary


def test_admin_lists_users(client, admin, admin_headers):
    r = client.get("/api/admin/users", headers=admin_headers)
    assert r.status_code == 200
    assert admin.email in [u["email"] for u in r.json()]


def test_duplicate_email_conflict(client, admin_headers):
    assert client.post("/api/admin/users", json=payload(), headers=admin_headers).status_code == 201
    assert client.post("/api/admin/users", json=payload(), headers=admin_headers).status_code == 409


def test_weak_temporary_password_rejected(client, admin_headers):
    r = client.post("/api/admin/users", json=payload(temporary_password="short"), headers=admin_headers)
    assert r.status_code == 422


def test_unknown_field_rejected(client, admin_headers):
    r = client.post("/api/admin/users", json=payload(is_superuser=True), headers=admin_headers)
    assert r.status_code == 422


def test_applicant_requires_institution(client, admin_headers):
    r = client.post("/api/admin/users", json=payload(role="applicant"), headers=admin_headers)
    assert r.status_code == 422


def test_reviewer_rejects_institution(client, admin_headers, institution_id):
    r = client.post(
        "/api/admin/users", json=payload(role="reviewer", institution_id=institution_id), headers=admin_headers
    )
    assert r.status_code == 422


def test_unknown_institution(client, admin_headers):
    r = client.post(
        "/api/admin/users", json=payload(role="applicant", institution_id=999999), headers=admin_headers
    )
    assert r.status_code == 422


@pytest.mark.parametrize("role", [UserRole.REVIEWER, UserRole.APPLICANT])
def test_non_admin_forbidden(client, session, institution_id, role):
    inst = institution_id if role == UserRole.APPLICANT else None
    user = make_user(session, role, institution_id=inst)
    target = make_user(session, UserRole.REVIEWER)
    h = bearer(login(client, user))
    assert client.get("/api/admin/users", headers=h).status_code == 403
    assert client.post("/api/admin/users", json=payload(), headers=h).status_code == 403
    assert client.patch(f"/api/admin/users/{target.id}", json={"full_name": "X"}, headers=h).status_code == 403


def test_deactivate_kills_sessions(client, session, admin_headers):
    victim = make_user(session, UserRole.REVIEWER)
    access = login(client, victim)
    assert client.get("/api/auth/me", headers=bearer(access)).status_code == 200
    assert client.cookies.get("trace_refresh")

    r = client.patch(f"/api/admin/users/{victim.id}", json={"is_active": False}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["is_active"] is False

    assert client.get("/api/auth/me", headers=bearer(access)).status_code == 401
    assert client.post("/api/auth/refresh").status_code == 401


def test_role_change_bumps_token_version(client, session, admin_headers):
    user = make_user(session, UserRole.REVIEWER)
    access = login(client, user)
    before = user.token_version
    r = client.patch(f"/api/admin/users/{user.id}", json={"role": "admin"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"
    session.expire_all()
    assert session.get(User, user.id).token_version == before + 1
    assert client.get("/api/auth/me", headers=bearer(access)).status_code == 401
    audit = session.exec(select(AuditLog).where(AuditLog.action_type == "USER_UPDATED")).one()
    assert audit.details == {"changed_fields": ["role"]}


def test_profile_only_change_keeps_sessions(client, session, admin_headers):
    user = make_user(session, UserRole.REVIEWER)
    access = login(client, user)
    r = client.patch(f"/api/admin/users/{user.id}", json={"full_name": "Renamed"}, headers=admin_headers)
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=bearer(access)).status_code == 200


def test_role_change_to_reviewer_requires_clearing_institution(client, session, admin_headers, institution_id):
    user = make_user(session, UserRole.APPLICANT, institution_id=institution_id)
    r = client.patch(f"/api/admin/users/{user.id}", json={"role": "reviewer"}, headers=admin_headers)
    assert r.status_code == 422
    r = client.patch(
        f"/api/admin/users/{user.id}", json={"role": "reviewer", "institution_id": None}, headers=admin_headers
    )
    assert r.status_code == 200, r.text
    assert r.json()["institution_id"] is None


def test_patch_unknown_user_404(client, admin_headers):
    assert client.patch("/api/admin/users/999999", json={"full_name": "X"}, headers=admin_headers).status_code == 404


def test_admin_cannot_deactivate_or_demote_self(client, admin, admin_headers):
    r = client.patch(f"/api/admin/users/{admin.id}", json={"is_active": False}, headers=admin_headers)
    assert r.status_code == 400
    r = client.patch(f"/api/admin/users/{admin.id}", json={"role": "reviewer"}, headers=admin_headers)
    assert r.status_code == 400
    assert client.get("/api/auth/me", headers=admin_headers).status_code == 200


def test_reset_password_sets_must_change(client, session, admin_headers):
    user = make_user(session, UserRole.REVIEWER)
    access = login(client, user)
    r = client.patch(
        f"/api/admin/users/{user.id}", json={"reset_password": "Another-Temp-456"}, headers=admin_headers
    )
    assert r.status_code == 200, r.text
    assert r.json()["must_change_password"] is True
    assert client.get("/api/auth/me", headers=bearer(access)).status_code == 401
    assert client.post("/api/auth/refresh").status_code == 401
    old = client.post("/api/auth/login", data={"username": user.email, "password": PW})
    assert old.status_code == 401
    assert client.post(
        "/api/auth/login", data={"username": user.email, "password": "Another-Temp-456"}
    ).status_code == 200
    audit = session.exec(select(AuditLog).where(AuditLog.action_type == "USER_UPDATED")).one()
    assert audit.details == {"changed_fields": ["password"]}


def test_reset_password_policy_enforced(client, session, admin_headers):
    user = make_user(session, UserRole.REVIEWER)
    r = client.patch(f"/api/admin/users/{user.id}", json={"reset_password": "short"}, headers=admin_headers)
    assert r.status_code == 422


def test_admin_cannot_reset_own_password(client, admin, admin_headers):
    r = client.patch(f"/api/admin/users/{admin.id}", json={"reset_password": "Another-Temp-456"}, headers=admin_headers)
    assert r.status_code == 400
    assert client.get("/api/auth/me", headers=admin_headers).status_code == 200


def test_validation_error_does_not_echo_password(client, admin_headers):
    secret = "Distinct-Secret-Pw-777"
    body = payload(temporary_password=secret)
    del body["role"]
    r = client.post("/api/admin/users", json=body, headers=admin_headers)
    assert r.status_code == 422
    assert secret not in r.text
    err = r.json()["detail"][0]
    assert err["loc"] and err["msg"]
    assert "input" not in err and "ctx" not in err


def test_change_password_validation_error_does_not_echo_password(client, admin_headers):
    secret = "Distinct-Secret-Pw-888"
    r = client.post("/api/auth/change-password", json={"new_password": secret}, headers=admin_headers)
    assert r.status_code == 422
    assert secret not in r.text
    assert r.headers["x-content-type-options"] == "nosniff"


def _passwords(monkeypatch, *values):
    it = iter(values)
    monkeypatch.setattr(getpass, "getpass", lambda *a, **k: next(it))


def test_cli_create_admin(db_path, session, monkeypatch, capsys):
    argv = ["create-admin", "--email", "root@example.test", "--full-name", "Root Admin"]
    _passwords(monkeypatch, "Strong-Password-12", "Strong-Password-12")
    assert cli.main(argv) == 0
    session.expire_all()
    user = session.exec(select(User).where(User.email == "root@example.test")).one()
    assert user.role == UserRole.ADMIN
    assert user.must_change_password is False
    assert user.institution_id is None

    _passwords(monkeypatch, "Strong-Password-12", "Strong-Password-12")
    assert cli.main(argv) != 0
    assert "exists" in capsys.readouterr().err


def test_cli_create_admin_weak_or_mismatched_password(db_path, session, monkeypatch, capsys):
    argv = ["create-admin", "--email", "weak@example.test", "--full-name", "Weak"]
    _passwords(monkeypatch, "short", "short")
    assert cli.main(argv) != 0
    _passwords(monkeypatch, "Strong-Password-12", "Different-Password-1")
    assert cli.main(argv) != 0
    assert session.exec(select(User).where(User.email == "weak@example.test")).first() is None
    assert "Strong-Password-12" not in capsys.readouterr().out
