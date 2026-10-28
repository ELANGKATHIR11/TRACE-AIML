"""Validation results: current flags, category-scoped rules, robust compliance parsing."""
import pytest
from sqlmodel import select

from app.models.enums import (
    ApplicationCategory,
    ApplicationStatus,
    DocumentType,
    FlagCategory,
    FlagSeverity,
    VerificationStatus,
)
from app.models.models import ValidationFlag
from app.services import workflow
from app.services.rules_engine import rules_engine
from tests.conftest import make_application, make_document


@pytest.fixture(autouse=True)
def _offline_ai(monkeypatch):
    from app.services.ollama_service import ollama_service

    monkeypatch.setattr(ollama_service, "is_available", lambda: False)


@pytest.fixture()
def fixed_compliance(monkeypatch):
    """One application-level CRITICAL finding on every evaluation."""
    monkeypatch.setattr(
        rules_engine,
        "evaluate_application_compliance",
        lambda *a, **k: {
            "overall_status": "NON_COMPLIANT_CRITICAL_DEFICITS",
            "total_flags": 1,
            "flags": [
                {
                    "category": FlagCategory.INFRASTRUCTURE_DISCREPANCY,
                    "severity": FlagSeverity.CRITICAL,
                    "reason": "land short",
                }
            ],
        },
    )


def _validate(client, headers, application_id):
    r = client.post(f"/api/applications/{application_id}/validate", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_revalidation_replaces_application_level_flags(
    client, session, headers, reviewer, inst_a, fixed_compliance
):
    application = make_application(session, inst_a, ApplicationStatus.SUBMITTED)
    make_document(session, application, DocumentType.AFFIDAVIT)
    h = headers(reviewer)

    _validate(client, h, application.id)
    result = _validate(client, h, application.id)["result"]
    assert not any(key.startswith("default_ai_report") for key in result)  # dead report hook removed

    flags = client.get(f"/api/applications/{application.id}/flags", headers=h).json()
    assert [f["reason"] for f in flags if f["document_id"] is None] == ["land short"]


def test_flags_of_superseded_documents_are_not_listed(
    client, session, headers, applicant_a, inst_a
):
    application = make_application(session, inst_a, ApplicationStatus.SUBMITTED)
    old = make_document(session, application, DocumentType.AFFIDAVIT)
    new = make_document(session, application, DocumentType.AFFIDAVIT, plaintext=b"%PDF-1.4 new")
    for document_id, reason in ((old.id, "old doc forged"), (new.id, "new doc finding"), (None, "app-level")):
        session.add(
            ValidationFlag(
                application_id=application.id,
                document_id=document_id,
                flag_category=FlagCategory.POTENTIAL_FORGERY_OR_ALTERATION,
                severity=FlagSeverity.HIGH,
                reason=reason,
                is_advisory=True,
            )
        )
    old.superseded_by_id = new.id
    session.add(old)
    session.commit()

    r = client.get(f"/api/applications/{application.id}/flags", headers=headers(applicant_a))
    assert r.status_code == 200, r.text
    assert sorted(f["reason"] for f in r.json()) == ["app-level", "new doc finding"]
    # The agent review is grounded on the same current-flag helper.
    assert sorted(f.reason for f in workflow.current_flags(session, application.id)) == [
        "app-level",
        "new doc finding",
    ]


@pytest.fixture()
def multi_agent_module(monkeypatch):
    """Import the agent workflow without the optional `ai` extra (chromadb) installed."""
    import importlib
    import sys
    import types

    name = "app.services.multi_agent_workflow"
    monkeypatch.setitem(
        sys.modules,
        "app.services.vector_rag_service",
        types.SimpleNamespace(vector_rag_service=None),
    )
    original = sys.modules.pop(name, None)
    try:
        yield importlib.import_module(name)
    finally:
        sys.modules.pop(name, None)
        if original is not None:
            sys.modules[name] = original


def test_agent_review_considers_only_current_flags(session, inst_a, monkeypatch, multi_agent_module):
    maw = multi_agent_module
    application = make_application(session, inst_a, ApplicationStatus.SUBMITTED)
    old = make_document(session, application, DocumentType.AFFIDAVIT)
    new = make_document(session, application, DocumentType.AFFIDAVIT, plaintext=b"%PDF-1.4 new")
    session.add(
        ValidationFlag(
            application_id=application.id,
            document_id=old.id,
            flag_category=FlagCategory.POTENTIAL_FORGERY_OR_ALTERATION,
            severity=FlagSeverity.HIGH,
            reason="old doc forged",
            is_advisory=True,
        )
    )
    old.superseded_by_id = new.id
    session.add(old)
    session.commit()

    seen = {}

    def capture(state):
        seen["flags"] = state["flags"]
        return state

    monkeypatch.setattr(maw, "orchestrated_scrutiny_graph", None)
    for node in ("forensic_auditor_node", "compliance_officer_node", "evidence_compiler_node"):
        monkeypatch.setattr(maw, node, capture)
    result = maw.multi_agent_workflow_service.run_scrutiny_workflow(session, application.id)
    assert seen["flags"] == []
    assert result["grounding"]["flags_considered"] == 0


def test_validate_uses_only_rules_of_the_application_category(
    client, session, headers, reviewer, applicant_a
):
    # The seeded handbook rules are all EXTENSION_OF_APPROVAL; none apply to a new institution.
    r = client.post(
        "/api/applications",
        headers=headers(applicant_a),
        json={"category": "NEW_INSTITUTION", "academic_year": "2026-27", "declared_data": {}},
    )
    assert r.status_code == 201, r.text
    app_id = r.json()["id"]
    assert r.json()["applicable_checklist"] == []
    # No mandatory rule for the category: submitting without documents is allowed.
    s = client.post(f"/api/applications/{app_id}/submit", headers=headers(applicant_a))
    assert s.status_code == 200, s.text

    body = _validate(client, headers(reviewer), app_id)
    flags = body["result"]["compliance"]["flags"]
    assert [f for f in flags if f["category"] == FlagCategory.MISSING_DOCUMENT.value] == []
    assert body["result"]["status"] == ApplicationStatus.READY_FOR_REVIEW.value


def test_document_rules_are_scoped_to_the_application_category(session, inst_a):
    from app.models.models import ChecklistRule
    from app.services.verification_services import verification_service

    # Only an INCREASE_IN_INTAKE rule requires this field; the EOA application must not be flagged.
    session.add(
        ChecklistRule(
            handbook_year="2026-27",
            category=ApplicationCategory.INTAKE_INCREASE,
            document_type=DocumentType.AFFIDAVIT,
            rule_name="Intake-only affidavit field",
            description="test",
            is_mandatory=True,
            required_fields=["intake_only_field"],
        )
    )
    session.commit()
    application = make_application(session, inst_a, ApplicationStatus.SUBMITTED)
    document = make_document(session, application, DocumentType.AFFIDAVIT)

    verification_service.process_document(session, document)

    fields = session.exec(
        select(ValidationFlag.field_name).where(ValidationFlag.document_id == document.id)
    ).all()
    assert "intake_only_field" not in fields


def test_faculty_count_in_llm_text_is_parsed(client, session, headers, reviewer, inst_a):
    application = make_application(session, inst_a, ApplicationStatus.SUBMITTED)
    application.declared_data = {"total_intake": 1000}
    session.add(application)
    session.commit()
    roster = make_document(session, application, DocumentType.FACULTY_ROSTER)
    roster.extracted_fields = {"total_faculty_count": "32 faculty"}
    roster.verification_status = VerificationStatus.VERIFIED
    session.add(roster)
    session.commit()

    body = _validate(client, headers(reviewer), application.id)
    ratio = [f for f in body["result"]["compliance"]["flags"] if f.get("field_name") == "faculty_student_ratio"]
    assert len(ratio) == 1
    assert "32 verified faculty" in ratio[0]["evidence"]
