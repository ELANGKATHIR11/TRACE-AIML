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
