"""Authorization: token required everywhere, spec §4.2 role matrix, institution scoping."""
import re
import sys
import types

import pytest
from fastapi.routing import APIRoute, iter_route_contexts
from sqlmodel import select

from app.models.enums import ApplicationStatus
from app.models.models import Application, ChecklistRule

PUBLIC_PATHS = {"/api/health", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout"}
_PATH_PARAM = re.compile(r"\{[^}]+\}")

ALLOW = "allow"
DENY = 403
APPLICANT_ONLY = {"applicant": ALLOW, "reviewer": DENY, "admin": DENY}
STAFF_ONLY = {"applicant": DENY, "reviewer": ALLOW, "admin": ALLOW}
EVERYONE = {"applicant": ALLOW, "reviewer": ALLOW, "admin": ALLOW}
ADMIN_ONLY = {"applicant": DENY, "reviewer": DENY, "admin": ALLOW}
REVIEWER_ONLY = {"applicant": DENY, "reviewer": ALLOW, "admin": DENY}

_PDF = ("doc.pdf", b"%PDF-1.4 matrix test", "application/pdf")

# (method, path template, {role: expected}, request kwargs). Placeholders: {app} = an
# application of applicant_a's institution, {doc} = a document on it, {rule}, {user}.
MATRIX = [
    ("GET", "/api/institutions", EVERYONE, {}),
    (
        "POST",
        "/api/institutions",
        ADMIN_ONLY,
        {
            "json": {
                "aicte_permanent_id": "1-MATRIX0001",
                "name": "Matrix Institute",
                "state": "Kerala",
                "district": "Kochi",
                "address": "1 Matrix Road",
                "established_year": 2001,
            }
        },
    ),
    ("GET", "/api/rules", EVERYONE, {}),
    (
        "POST",
        "/api/rules",
        ADMIN_ONLY,
        {
            "json": {
                "category": "EXTENSION_OF_APPROVAL",
                "document_type": "AFFIDAVIT",
                "rule_name": "Matrix rule",
                "description": "Matrix rule description",
            }
        },
    ),
    ("PATCH", "/api/rules/{rule}", ADMIN_ONLY, {"json": {"description": "updated"}}),
    (
        "POST",
        "/api/applications",
        APPLICANT_ONLY,
        {"json": {"academic_year": "2026-27", "category": "EXTENSION_OF_APPROVAL", "declared_data": {}}},
    ),
    ("GET", "/api/applications", EVERYONE, {}),
    ("GET", "/api/applications/{app}", EVERYONE, {}),
    ("GET", "/api/applications/{app}/flags", EVERYONE, {}),
    ("POST", "/api/applications/{app}/validate", STAFF_ONLY, {}),
    ("POST", "/api/applications/{app}/agent-review", STAFF_ONLY, {}),
    ("POST", "/api/applications/{app}/submit", APPLICANT_ONLY, {}),
    (
        "POST",
        "/api/applications/{app}/submit-rectification",
        APPLICANT_ONLY,
        {"json": {"notes": "Matrix rectification", "amended": {}}},
    ),
    ("GET", "/api/applications/{app}/verifications", EVERYONE, {}),
    (
        "POST",
        "/api/applications/{app}/decision",
        REVIEWER_ONLY,
        {"json": {"decision": "APPROVE", "notes": "Matrix decision notes"}},
    ),
    (
        "POST",
        "/api/documents/upload",
        APPLICANT_ONLY,
        {"data": {"application_id": "{app}", "document_type": "AFFIDAVIT"}, "files": {"file": _PDF}},
    ),
    ("POST", "/api/documents/{doc}/rectify", APPLICANT_ONLY, {"files": {"file": _PDF}}),
    ("GET", "/api/documents/application/{app}", EVERYONE, {}),
    ("GET", "/api/documents/{doc}", EVERYONE, {}),
    ("GET", "/api/documents/{doc}/preview", EVERYONE, {}),
    ("GET", "/api/documents/{doc}/ela", STAFF_ONLY, {}),
    ("POST", "/api/documents/{doc}/verify", STAFF_ONLY, {}),
    ("GET", "/api/dashboard/metrics", STAFF_ONLY, {}),
    ("GET", "/api/dashboard/models", STAFF_ONLY, {}),
    ("GET", "/api/models", STAFF_ONLY, {}),
    ("GET", "/api/models/metrics", STAFF_ONLY, {}),
    ("POST", "/api/models/predict-document", STAFF_ONLY, {"json": {"text": "affidavit text"}}),
    ("POST", "/api/models/predict-forgery", STAFF_ONLY, {"json": {}}),
    ("POST", "/api/rag/search", STAFF_ONLY, {"json": {"query": "fire safety"}}),
    ("POST", "/api/media/inspect", STAFF_ONLY, {"files": {"file": _PDF}}),
    ("POST", "/api/intake/authority-check", STAFF_ONLY, {"files": {"file": _PDF}}),
    ("GET", "/api/audit", STAFF_ONLY, {}),
    ("GET", "/api/audit/logs", STAFF_ONLY, {}),
    ("GET", "/api/audit/verify-chain", STAFF_ONLY, {}),
    ("GET", "/api/admin/users", ADMIN_ONLY, {}),
    (
        "POST",
        "/api/admin/users",
        ADMIN_ONLY,
        {
            "json": {
                "email": "matrix.user@example.org",
                "full_name": "Matrix User",
                "role": "reviewer",
                "temporary_password": "Temporary-Pass-123",
            }
        },
    ),
    ("PATCH", "/api/admin/users/{user}", ADMIN_ONLY, {"json": {"full_name": "Renamed"}}),
]


def _fake_module(monkeypatch, name, attr, **methods):
    module = types.ModuleType(name)
    setattr(module, attr, types.SimpleNamespace(**methods))
    monkeypatch.setitem(sys.modules, name, module)


@pytest.fixture()
def offline_services(monkeypatch):
    """Stub AI/OCR/network services so allowed calls exercise only the route + guard code."""
    from app.services import issuing_authority_hub as hub_mod
    from app.services import ml_training_platform as ml_mod
    from app.services import ollama_service as ollama_mod
    from app.services import verification_services as verification_mod

    _fake_module(
        monkeypatch,
        "app.services.vector_rag_service",
        "vector_rag_service",
        query_regulatory_knowledge=lambda *a, **k: [],
        reconcile_multihop_evidence=lambda *a, **k: [],
    )
    _fake_module(
        monkeypatch,
        "app.services.multi_agent_workflow",
        "multi_agent_workflow_service",
        is_available=lambda: True,
        run_scrutiny_workflow=lambda *a, **k: {"status": "STUB"},
    )
    _fake_module(
        monkeypatch,
        "app.services.multi_source_ingestion",
        "multi_source_ingestion",
        ingest_stream_3_infrastructure_media=lambda **k: {"status": "STUB"},
    )
    monkeypatch.setattr("app.api.intelligence._ocr_bytes", lambda *a, **k: "")
    monkeypatch.setattr(ollama_mod.ollama_service, "is_available", lambda: False)
    monkeypatch.setattr(verification_mod.verification_service, "verify_entire_application", lambda *a, **k: {})
    monkeypatch.setattr(verification_mod.verification_service, "process_document", lambda *a, **k: {})
    monkeypatch.setattr(ml_mod.ml_training_platform, "predict_document_type", lambda *a, **k: {})
    monkeypatch.setattr(ml_mod.ml_training_platform, "predict_forgery_risk", lambda *a, **k: {})
    monkeypatch.setattr(hub_mod.issuing_authority_hub, "_inspect_qr_code", lambda *a, **k: {})
    monkeypatch.setattr(hub_mod.issuing_authority_hub, "_inspect_digital_signature", lambda *a, **k: {})


def _api_routes():
    """Every APIRoute with its effective (prefixed) path.

    FastAPI >= 0.157 keeps included routers lazily, so `app.routes` alone does not list them.
    """
    from app.main import app

    return [c for c in iter_route_contexts(app.routes) if isinstance(c.original_route, APIRoute)]


def _substitute(value, ids):
    if isinstance(value, str):
        return value.format(**ids)
    if isinstance(value, dict):
        return {k: _substitute(v, ids) for k, v in value.items()}
    return value


# ------------------------------------------------------------------ token required
def test_every_non_public_route_requires_token(client):
    checked = 0
    for route in _api_routes():
        if route.path in PUBLIC_PATHS:
            continue
        path = _PATH_PARAM.sub("1", route.path)
        for method in route.methods:
            r = client.request(method, path)
            assert r.status_code == 401, f"{method} {route.path} -> {r.status_code} {r.text}"
            checked += 1
    assert checked > 30


# -------------------------------------------------------------------- role matrix
@pytest.mark.parametrize("role", ["applicant", "reviewer", "admin"])
@pytest.mark.parametrize(
    "method,template,expected,kwargs",
    MATRIX,
    ids=[f"{m} {p}" for m, p, _, _ in MATRIX],
)
def test_role_matrix(
    client, session, headers, offline_services, admin, reviewer, applicant_a, inst_a,
    make_application, make_document, method, template, expected, kwargs, role,
):
    application = make_application(session, inst_a)
    document = make_document(session, application)
    rule = session.exec(select(ChecklistRule)).first()
    ids = {"app": application.id, "doc": document.id, "rule": rule.id, "user": applicant_a.id}
    user = {"applicant": applicant_a, "reviewer": reviewer, "admin": admin}[role]

    r = client.request(
        method, template.format(**ids), headers=headers(user), **_substitute(kwargs, ids)
    )

    if expected[role] == ALLOW:
        assert r.status_code not in (401, 403), f"{role} denied: {r.status_code} {r.text}"
    else:
        assert r.status_code == 403, f"{role} not denied: {r.status_code} {r.text}"


# ---------------------------------------------------------------- ownership (IDOR)
def test_cross_institution_is_404(client, session, headers, applicant_a, inst_b, make_application, make_document):
    foreign_app = make_application(session, inst_b)
    foreign_doc = make_document(session, foreign_app)
    h = headers(applicant_a)

    for path in (
        f"/api/applications/{foreign_app.id}",
        f"/api/applications/{foreign_app.id}/flags",
        f"/api/documents/application/{foreign_app.id}",
    ):
        r = client.get(path, headers=h)
        assert r.status_code == 404, path
        assert r.json() == {"detail": "Application not found"}, path

    r = client.get(f"/api/documents/{foreign_doc.id}/preview", headers=h)
    assert r.status_code == 404
    assert r.json() == {"detail": "Document not found"}


def test_nonexistent_ids_are_404(client, reviewer, headers):
    h = headers(reviewer)
    r = client.get("/api/applications/99999", headers=h)
    assert (r.status_code, r.json()) == (404, {"detail": "Application not found"})
    r = client.get("/api/documents/99999/preview", headers=h)
    assert (r.status_code, r.json()) == (404, {"detail": "Document not found"})


def test_upload_to_foreign_application_is_404(client, session, headers, applicant_a, inst_b, make_application):
    foreign_app = make_application(session, inst_b)
    r = client.post(
        "/api/documents/upload",
        headers=headers(applicant_a),
        data={"application_id": str(foreign_app.id), "document_type": "AFFIDAVIT"},
        files={"file": _PDF},
    )
    assert (r.status_code, r.json()) == (404, {"detail": "Application not found"})


def test_upload_to_non_editable_application_is_409(client, session, headers, applicant_a, inst_a, make_application):
    submitted = make_application(session, inst_a, status=ApplicationStatus.SUBMITTED)
    r = client.post(
        "/api/documents/upload",
        headers=headers(applicant_a),
        data={"application_id": str(submitted.id), "document_type": "AFFIDAVIT"},
        files={"file": _PDF},
    )
    assert r.status_code == 409
    assert r.json() == {
        "detail": "Application is not editable in its current status",
        "current_status": "SUBMITTED",
    }


def test_load_application_write_guard(session, applicant_a, reviewer, inst_a, make_application):
    from fastapi import HTTPException

    from app.services.access import APPLICANT_EDITABLE, load_application

    assert APPLICANT_EDITABLE == {ApplicationStatus.DRAFT, ApplicationStatus.RECTIFICATION_REQUESTED}
    rectify = make_application(session, inst_a, status=ApplicationStatus.RECTIFICATION_REQUESTED)
    assert load_application(session, rectify.id, applicant_a, write=True).id == rectify.id

    approved = make_application(session, inst_a, status=ApplicationStatus.APPROVED_BY_REVIEWER)
    with pytest.raises(HTTPException) as exc:
        load_application(session, approved.id, applicant_a, write=True)
    assert exc.value.status_code == 409
    # Reviewers are not subject to the applicant edit window.
    assert load_application(session, approved.id, reviewer, write=True).id == approved.id


def test_applicant_list_scoped(client, session, headers, applicant_a, inst_a, inst_b, make_application):
    own = make_application(session, inst_a)
    make_application(session, inst_b)

    r = client.get("/api/applications", headers=headers(applicant_a))
    assert r.status_code == 200
    assert [a["id"] for a in r.json()] == [own.id]


def test_applicant_without_institution_sees_nothing(client, session, headers, inst_a, inst_b, make_application):
    from tests.conftest import make_user

    make_application(session, inst_a)
    make_application(session, inst_b)
    orphan = make_user(session, "applicant", institution_id=None)

    r = client.get("/api/applications", headers=headers(orphan))
    assert r.status_code == 200
    assert r.json() == []
    r = client.get("/api/institutions", headers=headers(orphan))
    assert r.json() == []


def test_staff_list_sees_all(client, session, headers, reviewer, inst_a, inst_b, make_application):
    a = make_application(session, inst_a)
    b = make_application(session, inst_b)
    r = client.get("/api/applications", headers=headers(reviewer))
    assert {x["id"] for x in r.json()} >= {a.id, b.id}


def test_applicant_institutions_own_only(client, headers, applicant_a, inst_a, inst_b, reviewer):
    r = client.get("/api/institutions", headers=headers(applicant_a))
    assert r.status_code == 200
    assert [i["id"] for i in r.json()] == [inst_a.id]

    r = client.get("/api/institutions", headers=headers(reviewer))
    assert {inst_a.id, inst_b.id} <= {i["id"] for i in r.json()}


def test_create_application_ignores_body_institution(client, session, headers, applicant_a, inst_b):
    body = {"academic_year": "2026-27", "category": "EXTENSION_OF_APPROVAL", "declared_data": {}}

    r = client.post(
        "/api/applications", headers=headers(applicant_a), json={**body, "institution_id": inst_b.id}
    )
    assert r.status_code == 422

    r = client.post("/api/applications", headers=headers(applicant_a), json=body)
    assert r.status_code == 201, r.text
    assert r.json()["institution_id"] == applicant_a.institution_id
    created = session.get(Application, r.json()["id"])
    assert created.institution_id == applicant_a.institution_id
    assert created.submitted_by_user_id == applicant_a.id


def test_applicant_cannot_create_institution(client, headers, applicant_a):
    r = client.post(
        "/api/institutions",
        headers=headers(applicant_a),
        json={
            "aicte_permanent_id": "1-EVIL000001",
            "name": "Evil Institute",
            "state": "Goa",
            "district": "Panaji",
            "address": "Nowhere",
            "established_year": 2020,
        },
    )
    assert r.status_code == 403


def test_preview_and_ela_require_auth(client, session, inst_a, make_application, make_document):
    doc = make_document(session, make_application(session, inst_a))
    assert client.get(f"/api/documents/{doc.id}/preview").status_code == 401
    assert client.get(f"/api/documents/{doc.id}/ela").status_code == 401


def test_rag_search_unknown_application_404(client, headers, reviewer, offline_services):
    r = client.post(
        "/api/rag/search",
        headers=headers(reviewer),
        json={"query": "fire safety certificate", "application_id": 99999},
    )
    assert (r.status_code, r.json()) == (404, {"detail": "Application not found"})


def test_rag_search_known_application_ok(client, session, headers, reviewer, inst_a, make_application, offline_services):
    application = make_application(session, inst_a)
    r = client.post(
        "/api/rag/search",
        headers=headers(reviewer),
        json={"query": "fire safety certificate", "application_id": application.id},
    )
    assert r.status_code == 200
    assert r.json()["application_evidence"] == []


def test_single_agent_review_route():
    routes = [r for r in _api_routes() if r.path == "/api/applications/{application_id}/agent-review"]
    assert len(routes) == 1
    assert routes[0].endpoint.__module__ == "app.api.intelligence"
