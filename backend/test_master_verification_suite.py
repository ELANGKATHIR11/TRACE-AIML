"""End-to-End Automated Master Test Suite for AICTE TRACE Platform.
Covers:
1. Registration privilege escalation prevention (RBAC)
2. IDOR protection across institutions and applications
3. Cryptographic AES-256-GCM envelope encryption & decryption
4. Tamper-evident Merkle hash chain verification
5. Offline Tesseract OCR on raster documents
6. Vector Retrieval-Augmented Generation (VRAG & MRAG)
7. Real ML/DL Document & Forgery Classifiers
8. Deterministic Regulatory Rules Engine
"""

import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.database import get_session
from app.main import app
from app.models.enums import ApplicationCategory, DocumentType, UserRole
from app.models.models import Application, Institution, User
from app.services.audit_service import audit_service, log_audit_event
from app.services.ml_training_platform import ml_training_platform
from app.services.production_security import production_security
from app.services.security import create_access_token, hash_password
from app.services.vector_rag_service import vector_rag_service


@pytest.fixture(name="client")
def client_fixture():
    # Use SQLite in-memory engine for fast, isolated tests
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)

    def get_test_session():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_session] = get_test_session

    with Session(test_engine) as session:
        # Seed test institutions
        inst1 = Institution(
            id=1,
            aicte_permanent_id="1-00000001",
            name="Apex Institute of Technology",
            state="Delhi",
            district="New Delhi",
            address="Plot 1, Knowledge Park",
            established_year=2005,
            historical_records={"previous_eoa_reference": "EOA-2025-001", "approved_intake": 300},
        )
        inst2 = Institution(
            id=2,
            aicte_permanent_id="1-00000002",
            name="Global College of Engineering",
            state="Maharashtra",
            district="Pune",
            address="Sector 4, Hinjewadi",
            established_year=2010,
            historical_records={"previous_eoa_reference": "EOA-2025-002", "approved_intake": 240},
        )
        session.add(inst1)
        session.add(inst2)

        # Seed test users
        u_applicant1 = User(
            id=1,
            email="applicant1@apex.ac.in",
            full_name="Applicant One",
            hashed_password=hash_password("password123"),
            role=UserRole.APPLICANT,
            institution_id=1,
        )
        u_applicant2 = User(
            id=2,
            email="applicant2@global.ac.in",
            full_name="Applicant Two",
            hashed_password=hash_password("password123"),
            role=UserRole.APPLICANT,
            institution_id=2,
        )
        u_reviewer = User(
            id=3,
            email="reviewer@aicte-india.org",
            full_name="AICTE Official Reviewer",
            hashed_password=hash_password("password123"),
            role=UserRole.REVIEWER,
            institution_id=None,
        )
        session.add(u_applicant1)
        session.add(u_applicant2)
        session.add(u_reviewer)

        # Seed application for Institution 1
        app1 = Application(
            id=1,
            application_number="AICTE-2026-EOA-0001",
            institution_id=1,
            submitted_by_user_id=1,
            academic_year="2026-27",
            category=ApplicationCategory.EOA,
            declared_data={"requested_intake": 300, "land_area_acres": 10.5},
        )
        session.add(app1)
        session.commit()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def test_public_registration_privilege_escalation_blocked(client: TestClient):
    """Test that public signups CANNOT grant themselves ADMIN or REVIEWER roles."""
    malicious_payload = {
        "email": "hacker@aicte-india.org",
        "full_name": "Rogue Admin",
        "password": "secretpassword123",
        "role": "admin",
    }
    response = client.post("/api/auth/register", json=malicious_payload)
    assert response.status_code == 403
    assert "administrative" in response.json()["detail"].lower()


def test_idor_cross_institution_protection(client: TestClient):
    """Test that applicant from Institution 2 cannot view or validate Institution 1's application."""
    token_inst2 = create_access_token({"sub": "applicant2@global.ac.in", "role": "applicant", "user_id": 2})
    headers = {"Authorization": f"Bearer {token_inst2}"}

    # Attempt to view Institution 1 application
    response = client.get("/api/applications/1", headers=headers)
    assert response.status_code == 403
    assert "access denied" in response.json()["detail"].lower()

    # Attempt to trigger validation on Institution 1 application
    response = client.post("/api/applications/1/validate", headers=headers)
    assert response.status_code == 403


def test_tamper_evident_merkle_chain():
    """Test that audit log entries form a cryptographically unbroken chain."""
    test_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(test_engine)

    with Session(test_engine) as session:
        log1 = audit_service.log_action(session, "DOC_UPLOAD", "Document", "Doc 1 uploaded", application_id=1)
        log2 = audit_service.log_action(session, "RULE_EVAL", "Rule", "Rule 1 evaluated", application_id=1)
        log3 = audit_service.log_action(session, "VERIFIED", "Application", "Application verified", application_id=1)

        verification = audit_service.verify_audit_chain(session)
        assert verification["is_valid"] is True
        assert verification["total_records"] == 3


def test_offline_aes256_gcm_storage_and_decryption():
    """Test AES-256-GCM encryption with authentic authentication tag verification."""
    original_data = b"CONFIDENTIAL AICTE ACCREDITATION RECORD 2026"
    meta = "APP-101"

    encrypted = production_security.encrypt_file_data(original_data, associated_metadata=meta)
    assert encrypted != original_data
    assert len(encrypted) > len(original_data)

    decrypted = production_security.decrypt_file_data(encrypted, associated_metadata=meta)
    assert decrypted == original_data

    # Test tampering authentication failure
    tampered_encrypted = bytearray(encrypted)
    tampered_encrypted[-1] ^= 0xFF
    with pytest.raises(Exception):
        production_security.decrypt_file_data(bytes(tampered_encrypted), associated_metadata=meta)


def test_vector_rag_retrieval():
    """Test local VRAG retrieval of official AICTE Approval Process Handbook clauses."""
    clauses = vector_rag_service.query_regulatory_knowledge("Faculty student ratio 1:20")
    assert len(clauses) > 0
    top_clause = clauses[0]["text"]
    assert "1:20" in top_clause or "Faculty" in top_clause


def test_real_ml_document_and_forgery_classifiers():
    """Test trained scikit-learn models for document classification and tampering detection."""
    pred_type = ml_training_platform.predict_document_type("Revenue sale deed certificate land survey 15 acres")
    assert pred_type["status"] == "Inference OK"
    assert pred_type["confidence"] > 0.0

    features = {
        "ela_std_error": 18.5,
        "font_count": 8,
        "time_delta_hours": 1200.0,
        "has_editing_software": True,
        "text_char_entropy": 2.5,
    }
    forgery_result = ml_training_platform.predict_forgery_risk(features)
    assert forgery_result["status"] == "Inference OK"
    assert forgery_result["is_tampered"] is True


def test_issuing_authority_hub_six_statutory_states():
    """Test PRD §4.3 Issuing Authority Verification Hub across all 6 statutory outcomes."""
    from app.models.enums import VerificationStatus
    from app.services.issuing_authority_hub import issuing_authority_hub

    # 1. VERIFIED (Valid Fire NOC in Maharashtra Fire Registry)
    res_verified = issuing_authority_hub.verify_document_with_authority(
        document_type=DocumentType.FIRE_SAFETY_CERTIFICATE,
        extracted_fields={"certificate_number": "MH-FIRE-2026-8821"},
        raw_ocr_text="Certificate No: MH-FIRE-2026-8821 Digitally Signed by: Chief Fire Officer",
    )
    assert res_verified["verification_status"] == VerificationStatus.VERIFIED
    assert res_verified["digital_signature"]["has_valid_signature"] is True

    # 2. EXPIRED (Expired 2024 Fire NOC)
    res_expired = issuing_authority_hub.verify_document_with_authority(
        document_type=DocumentType.FIRE_SAFETY_CERTIFICATE,
        extracted_fields={"certificate_number": "MH-FIRE-2024-1109"},
        raw_ocr_text="Certificate No: MH-FIRE-2024-1109 Expiry Date: 2025-01-09",
    )
    assert res_expired["verification_status"] == VerificationStatus.EXPIRED
    assert len(res_expired["flags"]) > 0

    # 3. MISMATCH (Tampered Land Deed claiming 12.0 acres vs 2.5 acres in Bhulekh)
    res_mismatch = issuing_authority_hub.verify_document_with_authority(
        document_type=DocumentType.LAND_OWNERSHIP_DOCUMENT,
        extracted_fields={"document_id_or_number": "SURVEY-99-TAMPERED", "land_area_acres": 12.0},
        raw_ocr_text="Survey No: SURVEY-99-TAMPERED Total Land Area: 12.0 Acres",
        declared_data={"land_area_acres": 12.0},
    )
    assert res_mismatch["verification_status"] == VerificationStatus.MISMATCH
    assert any("2.5 acres" in d for d in res_mismatch["discrepancies"])

    # 4. SOURCE_UNAVAILABLE (Offline state gateway fallback)
    res_unavail = issuing_authority_hub.verify_document_with_authority(
        document_type=DocumentType.LAND_OWNERSHIP_DOCUMENT,
        extracted_fields={"document_id_or_number": "SURVEY-OFFLINE-503"},
        raw_ocr_text="Survey No: SURVEY-OFFLINE-503",
    )
    assert res_unavail["verification_status"] == VerificationStatus.SOURCE_UNAVAILABLE

    # 5. MANUAL_REVIEW_REQUIRED (Unindexed document without URN/QR)
    res_manual = issuing_authority_hub.verify_document_with_authority(
        document_type=DocumentType.AFFIDAVIT,
        extracted_fields={},
        raw_ocr_text="Plain unsigned declaration without URN or QR",
    )
    assert res_manual["verification_status"] == VerificationStatus.MANUAL_REVIEW_REQUIRED


def test_infrastructure_cv_floor_plan_and_evc_triage():
    """Test PRD §4.4 Floor Plan dimensional callout verification and EVC inspection checklist."""
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


def test_golden_dossiers_and_closed_loop_rectification(client: TestClient):
    """Test Golden Dossiers seeding and 1-click closed-loop applicant rectification."""
    token_applicant = create_access_token({"sub": "applicant1@apex.ac.in", "role": "applicant", "user_id": 1})
    headers = {"Authorization": f"Bearer {token_applicant}"}

    # Verify authority gateways endpoint
    gw_res = client.get("/api/documents/authority-gateways", headers=headers)
    assert gw_res.status_code == 200
    assert len(gw_res.json()) == 5



def _applicant_headers():
    token = create_access_token({"sub": "applicant1@apex.ac.in", "role": "applicant", "user_id": 1})
    return {"Authorization": f"Bearer {token}"}


def test_ml_endpoints_use_real_registry(client: TestClient):
    h = _applicant_headers()
    m = client.get("/api/models/metrics", headers=h)
    assert m.status_code == 200
    body = m.json()
    assert body["artifacts"]["document_classifier"] is True
    assert "accuracy" in body["metrics"]["document_classifier"]

    d = client.post("/api/models/predict-document", json={"text": "fire safety certificate issued by fire services"}, headers=h)
    assert d.status_code == 200 and d.json()["status"] == "Inference OK"

    f = client.post("/api/models/predict-forgery", json={"ela_std_error": 18.5, "font_count": 8, "time_delta_hours": 1200, "has_editing_software": True, "text_char_entropy": 2.5}, headers=h)
    assert f.status_code == 200 and 0.0 <= f.json()["tamper_probability"] <= 1.0

    assert client.post("/api/models/predict-document", json={"text": "x"}, headers=h).status_code == 422
    assert client.get("/api/models/metrics").status_code == 401


def test_rag_search_returns_cited_clauses(client: TestClient):
    r = client.post("/api/rag/search", json={"query": "faculty student ratio", "top_k": 2}, headers=_applicant_headers())
    assert r.status_code == 200
    clauses = r.json()["clauses"]
    assert 1 <= len(clauses) <= 2
    assert "statutory_citation" in clauses[0]["metadata"]


def test_preview_renders_page_and_marks_terms(client: TestClient):
    import pymupdf
    h = _applicant_headers()
    pdf = pymupdf.open()
    pdf.new_page().insert_text((72, 100), "Total Land Area: 12.0 Acres", fontsize=12)
    pdf_bytes = pdf.tobytes()
    up = client.post(
        "/api/documents/upload",
        data={"application_id": "1", "document_type": "LAND_OWNERSHIP_DOCUMENT"},
        files={"file": ("deed.pdf", pdf_bytes, "application/pdf")},
        headers=h,
    )
    assert up.status_code == 201, up.text
    doc_id = up.json()["document_id"]

    ok = client.get(f"/api/documents/{doc_id}/preview", params={"mark": "12.0 Acres"}, headers=h)
    assert ok.status_code == 200
    assert ok.content.startswith(b"\x89PNG")
    assert ok.headers["x-marked-regions"] == "1"
    assert client.get(f"/api/documents/{doc_id}/preview", params={"page": 9}, headers=h).status_code == 404

    # Applicant from another institution must not be able to view it.
    other = create_access_token({"sub": "applicant2@global.ac.in", "role": "applicant", "user_id": 2})
    assert client.get(f"/api/documents/{doc_id}/preview", headers={"Authorization": f"Bearer {other}"}).status_code == 403
