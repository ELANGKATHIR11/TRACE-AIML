"""Rectification, document metadata and authority verifications (spec 6.1-6.3)."""
import pytest
from sqlmodel import select

from app.models.enums import ApplicationStatus, DocumentType
from app.models.models import Application, AuditLog, Document


def _upload(client, headers, application_id, document_type="AFFIDAVIT", content=b"%PDF-1.4 upload test"):
    return client.post(
        "/api/documents/upload",
        headers=headers,
        data={"application_id": str(application_id), "document_type": document_type},
        files={"file": ("doc.pdf", content, "application/pdf")},
    )


def _rectify(client, headers, document_id, content=b"%PDF-1.4 corrected"):
    return client.post(
        f"/api/documents/{document_id}/rectify",
        headers=headers,
        files={"file": ("fixed.pdf", content, "application/pdf")},
    )


def _audit_actions(session, application_id):
    return [
        row.action_type
        for row in session.exec(select(AuditLog).where(AuditLog.application_id == application_id))
    ]


def test_rectify_supersedes(client, session, headers, applicant_a, inst_a, make_application, make_document):
    application = make_application(session, inst_a, status=ApplicationStatus.RECTIFICATION_REQUESTED)
    old = make_document(session, application)

    r = _rectify(client, headers(applicant_a), old.id)
    assert r.status_code == 201, r.text
    new_id = r.json()["id"]
    assert new_id != old.id

    session.expire_all()
    old = session.get(Document, old.id)
    new = session.get(Document, new_id)
    assert old.superseded_by_id == new_id
    assert (new.application_id, new.document_type) == (application.id, DocumentType.AFFIDAVIT)

    r = client.get(f"/api/documents/application/{application.id}", headers=headers(applicant_a))
    assert [d["id"] for d in r.json()] == [new_id]
    assert "DOCUMENT_RECTIFIED" in _audit_actions(session, application.id)


def test_rectify_wrong_status_409(client, session, headers, applicant_a, inst_a, make_application, make_document):
    application = make_application(session, inst_a, status=ApplicationStatus.SUBMITTED)
    doc = make_document(session, application)
    r = _rectify(client, headers(applicant_a), doc.id)
    assert r.status_code == 409
    assert r.json()["current_status"] == "SUBMITTED"


def test_rectify_superseded_document_409(client, session, headers, applicant_a, inst_a, make_application, make_document):
    application = make_application(session, inst_a, status=ApplicationStatus.RECTIFICATION_REQUESTED)
    old = make_document(session, application)
    assert _rectify(client, headers(applicant_a), old.id).status_code == 201
    assert _rectify(client, headers(applicant_a), old.id, b"%PDF-1.4 again").status_code == 409


def test_rectify_foreign_document_404(client, session, headers, applicant_b, inst_a, make_application, make_document):
    application = make_application(session, inst_a, status=ApplicationStatus.RECTIFICATION_REQUESTED)
    doc = make_document(session, application)
    r = _rectify(client, headers(applicant_b), doc.id)
    assert (r.status_code, r.json()) == (404, {"detail": "Document not found"})


def test_upload_not_allowed_during_rectification(client, session, headers, applicant_a, inst_a, make_application):
    application = make_application(session, inst_a, status=ApplicationStatus.RECTIFICATION_REQUESTED)
    r = _upload(client, headers(applicant_a), application.id)
    assert r.status_code == 409
    assert r.json()["current_status"] == "RECTIFICATION_REQUESTED"


def test_draft_reupload_supersedes_same_type(client, session, headers, applicant_a, inst_a, make_application):
    application = make_application(session, inst_a)
    first = _upload(client, headers(applicant_a), application.id, content=b"%PDF-1.4 first")
    second = _upload(client, headers(applicant_a), application.id, content=b"%PDF-1.4 second")
    assert first.status_code == second.status_code == 201

    r = client.get(f"/api/documents/application/{application.id}", headers=headers(applicant_a))
    affidavits = [d for d in r.json() if d["document_type"] == "AFFIDAVIT"]
    assert [d["id"] for d in affidavits] == [second.json()["id"]]

    r = client.get(f"/api/applications/{application.id}", headers=headers(applicant_a))
    item = next(i for i in r.json()["applicable_checklist"] if i["document_type"] == "AFFIDAVIT")
    assert item["document_id"] == second.json()["id"]
    assert [d["id"] for d in r.json()["documents"]] == [second.json()["id"]]


def _submit_rectification(client, headers, application_id, body):
    return client.post(f"/api/applications/{application_id}/submit-rectification", headers=headers, json=body)


def test_submit_rectification_merges_and_resubmits(client, session, headers, applicant_a, inst_a, make_application):
    application = make_application(session, inst_a, status=ApplicationStatus.RECTIFICATION_REQUESTED)
    application.declared_data = {"total_intake": 300, "faculty_count": 40}
    session.add(application)
    session.commit()

    r = _submit_rectification(
        client, headers(applicant_a), application.id,
        {"notes": "Corrected the intake", "amended": {"total_intake": 360, "faculty_count": 40}},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["application_id"] == application.id
    assert body["status"] == "SUBMITTED"
    assert body["updated_fields"] == ["total_intake"]
    assert body["submitted_at"]

    session.expire_all()
    application = session.get(Application, application.id)
    assert application.declared_data == {"total_intake": 360, "faculty_count": 40}
    assert application.status == ApplicationStatus.SUBMITTED
    assert "RECTIFICATION_SUBMITTED" in _audit_actions(session, application.id)


def test_submit_rectification_only_touches_sent_fields(client, session, headers, applicant_a, inst_a, make_application):
    application = make_application(session, inst_a, status=ApplicationStatus.RECTIFICATION_REQUESTED)
    application.declared_data = {"total_intake": 300, "land_area_acres": 5.5}
    session.add(application)
    session.commit()

    r = _submit_rectification(client, headers(applicant_a), application.id, {"notes": "", "amended": {"faculty_count": 12}})
    assert r.status_code == 200, r.text
    assert r.json()["updated_fields"] == ["faculty_count"]
    session.expire_all()
    assert session.get(Application, application.id).declared_data == {
        "total_intake": 300, "land_area_acres": 5.5, "faculty_count": 12,
    }


def test_submit_rectification_wrong_status_409(client, session, headers, applicant_a, inst_a, make_application):
    application = make_application(session, inst_a, status=ApplicationStatus.DRAFT)
    r = _submit_rectification(client, headers(applicant_a), application.id, {"notes": "x", "amended": {}})
    assert r.status_code == 409
    assert r.json()["current_status"] == "DRAFT"


@pytest.mark.parametrize(
    "body",
    [
        {"notes": "x", "amended": {"total_intake": 10_001}},
        {"notes": "x" * 4001, "amended": {}},
        {"notes": "x", "amended": {"courses": ["CSE"]}},
        {"notes": "x", "amended": {}, "status": "APPROVED_BY_REVIEWER"},
    ],
)
def test_submit_rectification_validates_body(client, session, headers, applicant_a, inst_a, make_application, body):
    application = make_application(session, inst_a, status=ApplicationStatus.RECTIFICATION_REQUESTED)
    r = _submit_rectification(client, headers(applicant_a), application.id, body)
    assert r.status_code == 422


def test_document_metadata_has_no_file_path(client, session, headers, applicant_a, inst_a, make_application, make_document):
    application = make_application(session, inst_a)
    doc = make_document(session, application)
    h = headers(applicant_a)

    r = client.get(f"/api/documents/{doc.id}", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["id"] == doc.id
    assert "file_path" not in r.json()
    assert "raw_ocr_text" in r.json()

    r = client.get(f"/api/documents/application/{application.id}", headers=h)
    assert r.json() and all("file_path" not in d for d in r.json())
    r = client.get(f"/api/applications/{application.id}", headers=h)
    assert r.json()["documents"] and all("file_path" not in d for d in r.json()["documents"])


def test_get_document_foreign_404(client, session, headers, applicant_a, inst_b, make_application, make_document):
    doc = make_document(session, make_application(session, inst_b))
    r = client.get(f"/api/documents/{doc.id}", headers=headers(applicant_a))
    assert (r.status_code, r.json()) == (404, {"detail": "Document not found"})


def test_verifications_shape(client, session, headers, reviewer, applicant_a, inst_a, make_application, make_document, monkeypatch):
    from app.services import ollama_service as ollama_mod

    monkeypatch.setattr(ollama_mod.ollama_service, "is_available", lambda: False)
    application = make_application(session, inst_a, status=ApplicationStatus.SUBMITTED)
    old = make_document(session, application, plaintext=b"%PDF-1.4 old")
    new = make_document(session, application, plaintext=b"%PDF-1.4 new")
    old.superseded_by_id = new.id
    other = make_document(session, application, document_type=DocumentType.FIRE_SAFETY_CERTIFICATE)
    session.add(old)
    session.commit()

    for doc in (new, other):
        r = client.post(f"/api/documents/{doc.id}/verify", headers=headers(reviewer))
        assert r.status_code == 200, r.text

    for user in (reviewer, applicant_a):
        r = client.get(f"/api/applications/{application.id}/verifications", headers=headers(user))
        assert r.status_code == 200, r.text
        entries = r.json()
        assert [e["document_id"] for e in entries] == [new.id, other.id]
        for entry in entries:
            assert set(entry) == {
                "document_id", "document_type", "authority_name", "status",
                "checked_at", "reference_id", "details",
            }
            assert entry["checked_at"] is not None
            assert entry["status"] != "PENDING"


def test_verifications_unchecked_document(client, session, headers, reviewer, inst_a, make_application, make_document):
    application = make_application(session, inst_a)
    doc = make_document(session, application)
    r = client.get(f"/api/applications/{application.id}/verifications", headers=headers(reviewer))
    assert r.json()[0]["document_id"] == doc.id
    assert r.json()[0]["checked_at"] is None
    assert r.json()[0]["status"] == "PENDING"


def test_verifications_foreign_404(client, session, headers, applicant_a, inst_b, make_application):
    application = make_application(session, inst_b)
    r = client.get(f"/api/applications/{application.id}/verifications", headers=headers(applicant_a))
    assert (r.status_code, r.json()) == (404, {"detail": "Application not found"})
