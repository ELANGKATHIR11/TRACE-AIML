"""Application lifecycle (spec §6.1-§6.3): submit, validate, decision, typed bodies."""
from pathlib import Path

import pytest
from sqlmodel import select

from app.models.enums import ApplicationStatus, DocumentType
from app.models.models import Application, AuditLog, OfficerDecision

BENCHMARK = Path(__file__).resolve().parent.parent / "datasets" / "benchmark_60" / "authentic"
MANDATORY_EOA = [
    "AFFIDAVIT",
    "FIRE_SAFETY_CERTIFICATE",
    "PREVIOUS_EOA_LETTER",
    "INFRASTRUCTURE_EVIDENCE",
]
CREATE_BODY = {
    "category": "EXTENSION_OF_APPROVAL",
    "academic_year": "2026-27",
    "declared_data": {
        "land_area_acres": 12.5,
        "built_up_area_sqm": 14800,
        "total_intake": 360,
        "faculty_count": 24,
    },
}
DECISION_NOTES = "All mandatory documents verified against the handbook."


@pytest.fixture()
def offline_ai(monkeypatch):
    """Ruling R2: no Ollama in tests; the regex/heuristic fallbacks run instead."""
    from app.services.ollama_service import ollama_service

    monkeypatch.setattr(ollama_service, "is_available", lambda: False)


def _upload(client, headers, application_id, document_type, index):
    pdf = (BENCHMARK / f"auth_doc_{index:02d}.pdf").read_bytes()
    return client.post(
        "/api/documents/upload",
        headers=headers,
        data={"application_id": str(application_id), "document_type": document_type},
        files={"file": (f"{document_type.lower()}.pdf", pdf, "application/pdf")},
    )


def _decide(client, headers, application_id, decision="APPROVE", notes=DECISION_NOTES, **extra):
    return client.post(
        f"/api/applications/{application_id}/decision",
        headers=headers,
        json={"decision": decision, "notes": notes, **extra},
    )


def test_full_happy_path(client, session, headers, applicant_a, reviewer, offline_ai):
    ah, rh = headers(applicant_a), headers(reviewer)

    r = client.post("/api/applications", headers=ah, json=CREATE_BODY)
    assert r.status_code == 201, r.text
    app_id = r.json()["id"]
    assert r.json()["status"] == "DRAFT"
    assert r.json()["declared_data"] == CREATE_BODY["declared_data"]

    for index, doc_type in enumerate(MANDATORY_EOA, start=1):
        r = _upload(client, ah, app_id, doc_type, index)
        assert r.status_code == 201, r.text

    r = client.post(f"/api/applications/{app_id}/submit", headers=ah)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "SUBMITTED"
    assert session.exec(
        select(AuditLog).where(AuditLog.application_id == app_id).where(AuditLog.action_type == "APPLICATION_SUBMITTED")
    ).first() is not None

    r = client.post(f"/api/applications/{app_id}/validate", headers=rh)
    assert r.status_code == 200, r.text
    assert r.json()["result"]["status"] in ("READY_FOR_REVIEW", "DEFICIENCY_FLAGGED")

    r = _decide(client, rh, app_id)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["decision"] == "APPROVE"
    assert body["status"] == "APPROVED_BY_REVIEWER"
    assert body["application_id"] == app_id
    assert body["officer_id"] == reviewer.id
    assert body["notes"] == DECISION_NOTES
    assert body["decided_at"]

    audit_row = session.exec(
        select(AuditLog)
        .where(AuditLog.application_id == app_id)
        .where(AuditLog.action_type == "OFFICER_DECISION_APPROVE")
    ).one()
    assert body["audit_hash"] == audit_row.record_hash

    decision_row = session.get(OfficerDecision, body["id"])
    assert decision_row.audit_log_id == audit_row.id
    assert decision_row.officer_user_id == reviewer.id
    assert session.get(Application, app_id).status == ApplicationStatus.APPROVED_BY_REVIEWER

    r = client.get(f"/api/applications/{app_id}", headers=ah)
    assert r.status_code == 200
    detail = r.json()
    assert detail["latest_decision"]["decision"] == "APPROVE"
    assert detail["latest_decision"]["audit_hash"] == audit_row.record_hash
    assert [d["decision"] for d in detail["decisions"]] == ["APPROVE"]
    assert detail["institution_name"] == "Institution A"
    assert sorted(d["document_type"] for d in detail["documents"]) == sorted(MANDATORY_EOA)
    assert all(item["uploaded"] for item in detail["applicable_checklist"])


def test_submit_missing_docs_409(client, headers, applicant_a):
    r = client.post("/api/applications", headers=headers(applicant_a), json=CREATE_BODY)
    app_id = r.json()["id"]

    r = client.post(f"/api/applications/{app_id}/submit", headers=headers(applicant_a))
    assert r.status_code == 409
    body = r.json()
    assert body["current_status"] == "DRAFT"
    assert sorted(body["missing_document_types"]) == sorted(MANDATORY_EOA)


def test_submit_partial_docs_lists_only_missing(client, session, headers, applicant_a, inst_a, make_application, make_document):
    application = make_application(session, inst_a)
    make_document(session, application, DocumentType.AFFIDAVIT)
    make_document(session, application, DocumentType.FIRE_SAFETY_CERTIFICATE)

    r = client.post(f"/api/applications/{application.id}/submit", headers=headers(applicant_a))
    assert r.status_code == 409
    assert sorted(r.json()["missing_document_types"]) == ["INFRASTRUCTURE_EVIDENCE", "PREVIOUS_EOA_LETTER"]


def test_superseded_documents_are_not_current(client, session, headers, applicant_a, inst_a, make_application, make_document):
    from app.services import workflow

    application = make_application(session, inst_a)
    old = make_document(session, application, DocumentType.AFFIDAVIT)
    new = make_document(session, application, DocumentType.AFFIDAVIT)
    old.superseded_by_id = new.id
    session.add(old)
    session.commit()

    assert [d.id for d in workflow.current_documents(session, application.id)] == [new.id]
    r = client.get(f"/api/applications/{application.id}", headers=headers(applicant_a))
    assert [d["id"] for d in r.json()["documents"]] == [new.id]
    affidavit = next(i for i in r.json()["applicable_checklist"] if i["document_type"] == "AFFIDAVIT")
    assert affidavit["document_id"] == new.id
    r = client.get(f"/api/documents/application/{application.id}", headers=headers(applicant_a))
    assert [d["id"] for d in r.json()] == [new.id]


def test_invalid_transitions_409(client, session, headers, applicant_a, reviewer, inst_a, make_application, offline_ai):
    draft = make_application(session, inst_a)
    submitted = make_application(session, inst_a, status=ApplicationStatus.SUBMITTED)
    rh, ah = headers(reviewer), headers(applicant_a)

    responses = {
        "decision on DRAFT": _decide(client, rh, draft.id),
        "validate on DRAFT": client.post(f"/api/applications/{draft.id}/validate", headers=rh),
        "agent-review on DRAFT": client.post(f"/api/applications/{draft.id}/agent-review", headers=rh),
        "decision on SUBMITTED": _decide(client, rh, submitted.id),
        "submit on SUBMITTED": client.post(f"/api/applications/{submitted.id}/submit", headers=ah),
        "upload on SUBMITTED": _upload(client, ah, submitted.id, "AFFIDAVIT", 1),
    }
    for label, r in responses.items():
        assert r.status_code == 409, f"{label}: {r.status_code} {r.text}"
        expected = "DRAFT" if "DRAFT" in label else "SUBMITTED"
        assert r.json()["current_status"] == expected, label

    session.refresh(draft)
    session.refresh(submitted)
    assert draft.status == ApplicationStatus.DRAFT
    assert submitted.status == ApplicationStatus.SUBMITTED
    assert session.exec(select(OfficerDecision)).first() is None


def test_agent_review_does_not_change_status(client, session, headers, reviewer, inst_a, make_application, monkeypatch):
    import sys
    import types

    # The real module needs chromadb/crewai; stub it (as test_authorization does).
    fake = types.ModuleType("app.services.multi_agent_workflow")
    fake.multi_agent_workflow_service = types.SimpleNamespace(
        is_available=lambda: True, run_scrutiny_workflow=lambda *a, **k: {"status": "FAILED"}
    )
    monkeypatch.setitem(sys.modules, "app.services.multi_agent_workflow", fake)
    application = make_application(session, inst_a, status=ApplicationStatus.SUBMITTED)

    r = client.post(f"/api/applications/{application.id}/agent-review", headers=headers(reviewer))
    assert r.status_code == 200, r.text
    session.refresh(application)
    assert application.status == ApplicationStatus.SUBMITTED


def test_agent_review_503_when_ai_stack_not_importable(client, session, headers, reviewer, inst_a, make_application, monkeypatch):
    import sys

    # A missing optional dependency (e.g. chromadb) makes the capability unavailable, not a 500.
    monkeypatch.setitem(sys.modules, "app.services.multi_agent_workflow", None)
    application = make_application(session, inst_a, status=ApplicationStatus.SUBMITTED)

    r = client.post(f"/api/applications/{application.id}/agent-review", headers=headers(reviewer))
    assert r.status_code == 503, r.text
    assert r.json()["detail"] == "AI review unavailable"
    session.refresh(application)
    assert application.status == ApplicationStatus.SUBMITTED


def test_unknown_decision_422(client, session, headers, reviewer, inst_a, make_application):
    application = make_application(session, inst_a, status=ApplicationStatus.READY_FOR_REVIEW)
    for decision in ("APPROVED", "MAYBE", "DEFICIENCY_FLAGGED"):
        r = _decide(client, headers(reviewer), application.id, decision=decision)
        assert r.status_code == 422, decision
    r = client.post(
        f"/api/applications/{application.id}/decision", headers=headers(reviewer), json={"notes": DECISION_NOTES}
    )
    assert r.status_code == 422
    session.refresh(application)
    assert application.status == ApplicationStatus.READY_FOR_REVIEW


def test_notes_too_short_422(client, session, headers, reviewer, inst_a, make_application):
    application = make_application(session, inst_a, status=ApplicationStatus.READY_FOR_REVIEW)
    assert _decide(client, headers(reviewer), application.id, notes="too short").status_code == 422
    assert _decide(client, headers(reviewer), application.id, notes="x" * 4001).status_code == 422
    assert _decide(client, headers(reviewer), application.id, notes="x" * 4000).status_code == 200


def test_extra_field_422(client, session, headers, reviewer, applicant_a, inst_a, make_application):
    application = make_application(session, inst_a, status=ApplicationStatus.READY_FOR_REVIEW)
    r = _decide(client, headers(reviewer), application.id, officer_notes="legacy field")
    assert r.status_code == 422

    body = {**CREATE_BODY, "declared_data": {**CREATE_BODY["declared_data"], "courses": ["CSE"]}}
    r = client.post("/api/applications", headers=headers(applicant_a), json=body)
    assert r.status_code == 422


def test_request_rectification_reopens(
    client, session, headers, reviewer, applicant_a, inst_a, make_application, make_document
):
    application = make_application(session, inst_a, status=ApplicationStatus.DEFICIENCY_FLAGGED)

    r = _decide(client, headers(reviewer), application.id, decision="REQUEST_RECTIFICATION")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "RECTIFICATION_REQUESTED"
    session.refresh(application)
    assert application.status == ApplicationStatus.RECTIFICATION_REQUESTED

    # The edit window is open again: documents are rectified, not freshly uploaded.
    document = make_document(session, application)
    r = client.post(
        f"/api/documents/{document.id}/rectify",
        headers=headers(applicant_a),
        files={"file": ("fixed.pdf", b"%PDF-1.4 corrected", "application/pdf")},
    )
    assert r.status_code == 201, r.text
    r = _upload(client, headers(applicant_a), application.id, "AFFIDAVIT", 1)
    assert r.status_code == 409, r.text


def test_reject_decision(client, session, headers, reviewer, inst_a, make_application):
    application = make_application(session, inst_a, status=ApplicationStatus.READY_FOR_REVIEW)
    r = _decide(client, headers(reviewer), application.id, decision="REJECT")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "REJECTED_BY_REVIEWER"
    # A decided application cannot be decided again.
    r = _decide(client, headers(reviewer), application.id)
    assert (r.status_code, r.json()["current_status"]) == (409, "REJECTED_BY_REVIEWER")


@pytest.mark.parametrize(
    "field,value",
    [
        ("total_intake", 10001),
        ("total_intake", -1),
        ("land_area_acres", 1000.5),
        ("built_up_area_sqm", 1_000_001),
        ("faculty_count", 5001),
    ],
)
def test_declared_data_ranges(client, headers, applicant_a, field, value):
    body = {**CREATE_BODY, "declared_data": {**CREATE_BODY["declared_data"], field: value}}
    r = client.post("/api/applications", headers=headers(applicant_a), json=body)
    assert r.status_code == 422, r.text


def test_declared_data_fields_optional(client, headers, applicant_a):
    body = {**CREATE_BODY, "declared_data": {"total_intake": 10000}}
    r = client.post("/api/applications", headers=headers(applicant_a), json=body)
    assert r.status_code == 201, r.text
    assert r.json()["declared_data"] == {"total_intake": 10000}


def test_application_numbers_unique(client, headers, applicant_a):
    numbers = []
    for _ in range(2):
        r = client.post("/api/applications", headers=headers(applicant_a), json=CREATE_BODY)
        assert r.status_code == 201, r.text
        numbers.append(r.json()["application_number"])
    assert numbers[0] != numbers[1]
    assert all(n.startswith("AICTE-2026-EOA-") for n in numbers)


# ------------------------------------------------------------- concurrency & atomicity
def _change_status_concurrently(monkeypatch, application_id, new_status):
    """Commit a status change from a separate session just before the guarded transition runs."""
    from sqlmodel import Session

    from app.database import get_engine
    from app.services import workflow

    original = workflow.transition

    def racing_transition(session, application, target, *, allowed_from):
        with Session(get_engine()) as other:
            row = other.get(Application, application_id)
            row.status = new_status
            other.add(row)
            other.commit()
        return original(session, application, target, allowed_from=allowed_from)

    monkeypatch.setattr(workflow, "transition", racing_transition)


def test_concurrent_status_change_blocks_decision(client, session, headers, reviewer, inst_a, make_application, monkeypatch):
    application = make_application(session, inst_a, status=ApplicationStatus.READY_FOR_REVIEW)
    _change_status_concurrently(monkeypatch, application.id, ApplicationStatus.APPROVED_BY_REVIEWER)

    r = _decide(client, headers(reviewer), application.id, decision="REJECT")
    assert r.status_code == 409, r.text
    assert r.json()["current_status"] == "APPROVED_BY_REVIEWER"

    session.expire_all()
    assert session.get(Application, application.id).status == ApplicationStatus.APPROVED_BY_REVIEWER
    assert session.exec(select(OfficerDecision)).first() is None
    assert session.exec(
        select(AuditLog).where(AuditLog.action_type.startswith("OFFICER_DECISION_"))
    ).first() is None


def test_concurrent_status_change_blocks_validate(client, session, headers, reviewer, inst_a, make_application, monkeypatch):
    application = make_application(session, inst_a, status=ApplicationStatus.SUBMITTED)
    _change_status_concurrently(monkeypatch, application.id, ApplicationStatus.APPROVED_BY_REVIEWER)

    r = client.post(f"/api/applications/{application.id}/validate", headers=headers(reviewer))
    assert r.status_code == 409, r.text
    assert r.json()["current_status"] == "APPROVED_BY_REVIEWER"

    session.expire_all()
    assert session.get(Application, application.id).status == ApplicationStatus.APPROVED_BY_REVIEWER
    assert session.exec(
        select(AuditLog).where(AuditLog.action_type == "APPLICATION_VALIDATION_COMPLETED")
    ).first() is None


def test_validate_status_and_audit_commit_together(client, session, headers, reviewer, inst_a, make_application, monkeypatch):
    from app.services import verification_services

    application = make_application(session, inst_a, status=ApplicationStatus.SUBMITTED)

    def failing_audit(*args, **kwargs):
        raise RuntimeError("audit write failed")

    monkeypatch.setattr(verification_services, "log_audit_event", failing_audit)
    with pytest.raises(RuntimeError):
        client.post(f"/api/applications/{application.id}/validate", headers=headers(reviewer))

    session.expire_all()
    assert session.get(Application, application.id).status == ApplicationStatus.SUBMITTED


# ------------------------------------------------------------------ declared intake
def test_sfr_flag_uses_declared_total_intake(client, session, headers, applicant_a):
    from app.models.models import ChecklistRule, Document
    from app.services.rules_engine import rules_engine

    body = {**CREATE_BODY, "declared_data": {"total_intake": 600, "faculty_count": 10}}
    r = client.post("/api/applications", headers=headers(applicant_a), json=body)
    assert r.status_code == 201, r.text
    application = session.get(Application, r.json()["id"])

    roster = Document(
        application_id=application.id,
        document_type=DocumentType.FACULTY_ROSTER,
        filename="roster.pdf",
        file_path="unused",
        sha256_hash="0" * 64,
        extracted_fields={"total_faculty_count": 10},
    )
    rules = session.exec(select(ChecklistRule)).all()
    compliance = rules_engine.evaluate_application_compliance(application, [roster], rules)

    sfr = [f for f in compliance["flags"] if f.get("field_name") == "faculty_student_ratio"]
    assert len(sfr) == 1
    assert "1:60.0" in sfr[0]["reason"]


@pytest.mark.parametrize(
    "declared", [{"total_intake": 360}, {"approved_intake_baseline": 360}], ids=["total_intake", "legacy"]
)
def test_authority_intake_mismatch_uses_declared_total_intake(declared):
    from app.services.issuing_authority_hub import issuing_authority_hub

    result = issuing_authority_hub._compare_against_authority_record(
        document_type=DocumentType.PREVIOUS_EOA_LETTER,
        urn="EOA-TEST-1",
        registry_key="AICTE",
        authority_record={"authority_name": "AICTE", "approved_intake_total": 420},
        extracted_fields={},
        declared_data=declared,
        digital_sig_info={},
        qr_info={},
        now_iso="2026-10-28T00:00:00+00:00",
    )
    assert [f["field_name"] for f in result["flags"]] == ["approved_intake_total"]
    assert "declared baseline is 360" in result["flags"][0]["reason"]
