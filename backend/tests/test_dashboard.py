import json

import pytest

from app.models.enums import DocumentType, VerificationStatus
from app.services import ml_training_platform as mtp
from tests.conftest import make_application, make_document


@pytest.fixture(autouse=True)
def _ollama_offline(monkeypatch):
    from app.services.ollama_service import ollama_service

    monkeypatch.setattr(ollama_service, "is_available", lambda: False)


def _doc(session, application, doc_type, status):
    d = make_document(session, application, doc_type)
    d.verification_status = status
    session.add(d)
    session.commit()
    return d


def _rows(body):
    return {r["authority"]: r for r in body["verification_gateway_breakdown"]}


def test_gateway_counts_are_real(client, session, headers, reviewer, inst_a):
    app = make_application(session, inst_a)
    _doc(session, app, DocumentType.FIRE_SAFETY_CERTIFICATE, VerificationStatus.VERIFIED)
    _doc(session, app, DocumentType.FIRE_SAFETY_CERTIFICATE, VerificationStatus.VERIFIED)
    _doc(session, app, DocumentType.LAND_OWNERSHIP_DOCUMENT, VerificationStatus.MISMATCH)
    old = _doc(session, app, DocumentType.LAND_OWNERSHIP_DOCUMENT, VerificationStatus.VERIFIED)
    new = _doc(session, app, DocumentType.LAND_OWNERSHIP_DOCUMENT, VerificationStatus.MISMATCH)
    old.superseded_by_id = new.id  # superseded documents must not be counted
    session.add(old)
    session.commit()

    r = client.get("/api/dashboard/metrics", headers=headers(reviewer))
    assert r.status_code == 200
    rows = _rows(r.json())
    fire = rows["FIRE_SAFETY_CERTIFICATE"]
    assert (fire["verified"], fire["mismatch"], fire["total"]) == (2, 0, 2)
    land = rows["LAND_OWNERSHIP_DOCUMENT"]
    assert (land["verified"], land["mismatch"], land["total"]) == (0, 2, 2)
    assert rows["AFFIDAVIT"]["total"] == 0
    for row in rows.values():
        assert row["total"] == row["verified"] + row["mismatch"] + row["expired"] + row["pending"] + row["unavailable"]
    assert r.json()["documents"]["total"] == 4


def test_model_metrics_from_file(client, headers, reviewer, tmp_path, monkeypatch):
    (tmp_path / "training_evaluation_metrics.json").write_text(
        json.dumps({"document_classifier": {"model_name": "dc", "accuracy": 0.81, "precision": 0.8, "f1_score": 0.79}})
    )
    monkeypatch.setattr(mtp, "MODELS_DIR", tmp_path)

    bodies = [
        client.get("/api/dashboard/models", headers=headers(reviewer)).json(),
        client.get("/api/models", headers=headers(reviewer)).json(),
        client.get("/api/dashboard/metrics", headers=headers(reviewer)).json()["models"],
    ]
    assert bodies[0] == bodies[1] == bodies[2]
    by_id = {m["id"]: m for m in bodies[0]}
    dc = by_id["document-classifier"]
    assert dc["recall"] is None and dc["accuracy"] == 0.81
    assert by_id["forgery-detector"]["accuracy"] is None
    assert by_id["ollama-llm"]["status"] == "OFFLINE"
    text = json.dumps(bodies)
    assert "0.942" not in text and "0.965" not in text


def test_empty_db_zeroes(client, headers, reviewer):
    r = client.get("/api/dashboard/metrics", headers=headers(reviewer))
    assert r.status_code == 200
    body = r.json()
    assert body["total_applications"] == 0
    assert body["documents"]["total"] == 0
    assert all(row["total"] == 0 for row in body["verification_gateway_breakdown"])


def test_dashboard_requires_staff(client, headers, applicant_a):
    assert client.get("/api/dashboard/metrics", headers=headers(applicant_a)).status_code == 403
    assert client.get("/api/models", headers=headers(applicant_a)).status_code == 403


def test_flags_on_superseded_documents_not_counted(client, session, headers, reviewer, inst_a):
    from app.models.enums import FlagCategory, FlagSeverity
    from app.models.models import ValidationFlag

    app = make_application(session, inst_a)
    old = _doc(session, app, DocumentType.AFFIDAVIT, VerificationStatus.MISMATCH)
    new = _doc(session, app, DocumentType.AFFIDAVIT, VerificationStatus.VERIFIED)
    old.superseded_by_id = new.id
    session.add(old)

    def flag(document_id, severity, resolved=False):
        session.add(
            ValidationFlag(
                application_id=app.id,
                document_id=document_id,
                flag_category=FlagCategory.INCOMPLETE_FIELD,
                severity=severity,
                reason="r",
                is_resolved=resolved,
            )
        )

    flag(old.id, FlagSeverity.CRITICAL)  # superseded: excluded
    flag(old.id, FlagSeverity.LOW, resolved=True)  # superseded: excluded
    flag(new.id, FlagSeverity.CRITICAL)
    flag(None, FlagSeverity.LOW, resolved=True)  # application-level: counted
    session.commit()

    flags = client.get("/api/dashboard/metrics", headers=headers(reviewer)).json()["flags"]
    assert flags == {"total": 2, "critical": 1, "resolved": 1, "pending_resolution": 1}
