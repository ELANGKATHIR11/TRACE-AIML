"""Ported master verification suite: cross-cutting checks of the security, crypto, audit,
ML, RAG and rules services against the hardened API (conftest fixtures, minted bearer tokens)."""

import pytest
from sqlmodel import Session

from app.models.enums import DocumentType, UserRole
from app.services.audit_service import log_audit_event, verify_chain
from app.services.ml_training_platform import ml_training_platform
from tests.conftest import make_application


@pytest.fixture(autouse=True)
def _ollama_offline(monkeypatch):
    """Ruling R2: suites must pass without a running Ollama."""
    from app.services.ollama_service import ollama_service

    monkeypatch.setattr(ollama_service, "is_available", lambda: False)


def test_public_registration_endpoint_is_gone(client):
    """No public signup route exists, so roles cannot be self-assigned."""
    r = client.post(
        "/api/auth/register",
        json={"email": "hacker@example.test", "full_name": "Rogue", "password": "Secret-Password-12", "role": "admin"},
    )
    assert r.status_code in (404, 405)


def test_idor_cross_institution_protection(client, session, headers, inst_a, applicant_b):
    application = make_application(session, inst_a)
    h = headers(applicant_b)
    assert client.get(f"/api/applications/{application.id}", headers=h).status_code == 404
    assert client.post(f"/api/applications/{application.id}/validate", headers=h).status_code in (403, 404)


def test_tamper_evident_audit_chain(session):
    for action, entity, summary in (
        ("DOC_UPLOAD", "Document", "Doc 1 uploaded"),
        ("RULE_EVAL", "Rule", "Rule 1 evaluated"),
        ("VERIFIED", "Application", "Application verified"),
    ):
        log_audit_event(session, action_type=action, entity_type=entity, summary=summary, application_id=None)
    session.commit()
    result = verify_chain(session)
    assert result["status"] == "INTACT"
    assert result["verified_count"] == 3


def test_offline_aes256_gcm_storage_and_decryption():
    from app.services.document_storage import decrypt_document, encrypt_document

    original = b"CONFIDENTIAL AICTE ACCREDITATION RECORD 2026"
    encrypted = encrypt_document(original, 101)
    assert encrypted != original and len(encrypted) > len(original)
    assert decrypt_document(encrypted, 101) == original

    tampered = bytearray(encrypted)
    tampered[-1] ^= 0xFF
    with pytest.raises(Exception):
        decrypt_document(bytes(tampered), 101)


def test_vector_rag_retrieval():
    pytest.importorskip("chromadb")
    from app.services.vector_rag_service import vector_rag_service

    clauses = vector_rag_service.query_regulatory_knowledge("Faculty student ratio 1:20")
    assert len(clauses) > 0
    assert "1:20" in clauses[0]["text"] or "Faculty" in clauses[0]["text"]


def test_real_ml_document_and_forgery_classifiers():
    pred = ml_training_platform.predict_document_type("Revenue sale deed certificate land survey 15 acres")
    assert pred["status"] == "Inference OK"
    assert pred["confidence"] > 0.0

    forgery = ml_training_platform.predict_forgery_risk(
        {
            "ela_std_error": 18.5,
            "font_count": 8,
            "time_delta_hours": 1200.0,
            "has_editing_software": True,
            "text_char_entropy": 2.5,
        }
    )
    assert forgery["status"] == "Inference OK"
    assert forgery["is_tampered"] is True


def test_infrastructure_floor_plan_and_evc_triage():
    pytest.importorskip("bs4")
    from app.services.multi_source_ingestion import multi_source_ingestion

    res = multi_source_ingestion.analyze_floor_plan_and_infrastructure(
        file_bytes=b"",
        filename="block_c_floorplan.pdf",
        raw_ocr_text="Classroom 101: 72 sqm | Classroom 201: 48 sqm | Computer Lab 1: 42 sqm",
    )
    assert len(res["room_measurements"]) == 3
    assert res["evc_inspection_required"] is True
    assert len(res["flags"]) >= 2
    assert any("Classroom 201" in item for item in res["evc_checklist"])


@pytest.fixture()
def tiny_registry(tmp_path, monkeypatch):
    """Train tiny pinned models into a private MODELS_DIR so assertions never depend on repo state."""
    from app.services import ml_training_platform as mod

    monkeypatch.setattr(mod, "MODELS_DIR", tmp_path)
    docs = [
        {"text": f"{text} {i}", "label": label}
        for label, text in (
            ("FIRE_SAFETY", "fire safety certificate fire services"),
            ("LAND_DOCUMENT", "land survey sale deed revenue"),
        )
        for i in range(8)
    ]
    ml_training_platform.train_document_classifier(docs)
    forgery = [
        {
            "ela_std_error": (18.0 if tampered else 2.0) + i * 0.1,
            "font_count": 8 if tampered else 1,
            "time_delta_hours": 1200.0 if tampered else 1.0,
            "has_editing_software": tampered,
            "text_char_entropy": 2.5 if tampered else 4.5,
            "is_tampered": int(tampered),
        }
        for tampered in (True, False)
        for i in range(8)
    ]
    ml_training_platform.train_forgery_detector(forgery)
    return tmp_path


def test_ml_endpoints_use_real_registry(client, headers, reviewer, tiny_registry):
    h = headers(reviewer)
    m = client.get("/api/models/metrics", headers=h)
    assert m.status_code == 200
    body = m.json()
    assert body["artifacts"]["document_classifier"] is True
    assert "accuracy" in body["metrics"]["document_classifier"]

    d = client.post("/api/models/predict-document", json={"text": "fire safety certificate issued by fire services"}, headers=h)
    assert d.status_code == 200 and d.json()["status"] == "Inference OK"

    f = client.post(
        "/api/models/predict-forgery",
        json={"ela_std_error": 18.5, "font_count": 8, "time_delta_hours": 1200, "has_editing_software": True, "text_char_entropy": 2.5},
        headers=h,
    )
    assert f.status_code == 200 and 0.0 <= f.json()["tamper_probability"] <= 1.0

    assert client.post("/api/models/predict-document", json={"text": "x"}, headers=h).status_code == 422
    assert client.get("/api/models/metrics").status_code == 401


def test_ml_endpoints_are_staff_only(client, headers, applicant_a):
    assert client.get("/api/models/metrics", headers=headers(applicant_a)).status_code == 403


def test_rag_search_returns_cited_clauses(client, headers, reviewer):
    pytest.importorskip("chromadb")
    r = client.post("/api/rag/search", json={"query": "faculty student ratio", "top_k": 2}, headers=headers(reviewer))
    assert r.status_code == 200
    clauses = r.json()["clauses"]
    assert 1 <= len(clauses) <= 2
    assert "statutory_citation" in clauses[0]["metadata"]


def test_upload_then_preview_is_decrypted_and_institution_scoped(
    client, session, headers, inst_a, applicant_a, applicant_b
):
    import io

    application = make_application(session, inst_a)
    plaintext = b"%PDF-1.4 Total Land Area: 12.0 Acres"
    up = client.post(
        "/api/documents/upload",
        data={"application_id": str(application.id), "document_type": DocumentType.LAND_OWNERSHIP_DOCUMENT.value},
        files={"file": ("deed.pdf", io.BytesIO(plaintext), "application/pdf")},
        headers=headers(applicant_a),
    )
    assert up.status_code == 201, up.text
    doc_id = up.json()["id"]

    ok = client.get(f"/api/documents/{doc_id}/preview", headers=headers(applicant_a))
    assert ok.status_code == 200 and ok.content == plaintext
    assert client.get(f"/api/documents/{doc_id}/preview", headers=headers(applicant_b)).status_code == 404


# ------------------------------------------------------------ issuing authority hub logic
def _hub(monkeypatch, record):
    from app.services.issuing_authority_hub import issuing_authority_hub

    monkeypatch.setattr(
        issuing_authority_hub,
        "_lookup_registry_record",
        lambda urn, doc_type, text: (record, "TEST_REGISTRY" if record else ""),
    )
    return issuing_authority_hub


def _verify(hub, doc_type, fields, text, **kw):
    return hub.verify_document_with_authority(doc_type, fields, text, **kw)


def test_hub_verified_when_record_matches(monkeypatch):
    from app.models.enums import VerificationStatus

    hub = _hub(monkeypatch, {"authority_name": "Fire Dept", "status": "VALID"})
    res = _verify(hub, DocumentType.FIRE_SAFETY_CERTIFICATE, {"certificate_number": "FX-1"}, "Certificate No: FX-1")
    assert res["verification_status"] == VerificationStatus.VERIFIED
    assert res["flags"] == []


def test_hub_mismatch_on_land_area_discrepancy(monkeypatch):
    from app.models.enums import VerificationStatus

    hub = _hub(monkeypatch, {"authority_name": "Revenue", "land_area_acres": 2.5})
    res = _verify(
        hub,
        DocumentType.LAND_OWNERSHIP_DOCUMENT,
        {"document_id_or_number": "SURVEY-1", "land_area_acres": 12.0},
        "Survey No: SURVEY-1",
        declared_data={"land_area_acres": 12.0},
    )
    assert res["verification_status"] == VerificationStatus.MISMATCH
    assert any("2.5 acres" in d for d in res["discrepancies"])
    assert res["flags"]


def test_hub_expired_when_record_status_expired(monkeypatch):
    from app.models.enums import VerificationStatus

    hub = _hub(monkeypatch, {"authority_name": "Fire Dept", "status": "EXPIRED", "expiry_date": "2020-01-01"})
    res = _verify(hub, DocumentType.FIRE_SAFETY_CERTIFICATE, {"certificate_number": "FX-2"}, "Certificate No: FX-2")
    assert res["verification_status"] == VerificationStatus.EXPIRED
    assert res["flags"]


def test_hub_expired_by_extracted_date_without_registry_record(monkeypatch):
    from app.models.enums import VerificationStatus

    hub = _hub(monkeypatch, None)
    res = _verify(
        hub,
        DocumentType.FIRE_SAFETY_CERTIFICATE,
        {"certificate_number": "FX-3", "expiry_date": "2020-01-01"},
        "Certificate No: FX-3 Expiry Date: 2020-01-01",
    )
    assert res["verification_status"] == VerificationStatus.EXPIRED


def test_hub_source_unavailable_for_offline_urn(monkeypatch):
    from app.models.enums import VerificationStatus

    hub = _hub(monkeypatch, None)
    res = _verify(
        hub,
        DocumentType.LAND_OWNERSHIP_DOCUMENT,
        {"document_id_or_number": "SURVEY-OFFLINE-503"},
        "Survey No: SURVEY-OFFLINE-503",
    )
    assert res["verification_status"] == VerificationStatus.SOURCE_UNAVAILABLE


def test_hub_manual_review_without_urn_or_qr(monkeypatch):
    from app.models.enums import VerificationStatus

    hub = _hub(monkeypatch, None)
    res = _verify(hub, DocumentType.AFFIDAVIT, {}, "Plain unsigned declaration without URN or QR")
    assert res["verification_status"] == VerificationStatus.MANUAL_REVIEW_REQUIRED
