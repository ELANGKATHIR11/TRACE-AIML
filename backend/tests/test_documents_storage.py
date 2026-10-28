import io
from pathlib import Path

import pytest
from PIL import Image

from app.config import settings
from app.models.enums import VerificationStatus
from app.models.models import Document
from app.services.document_storage import (
    content_disposition_inline,
    decrypt_document,
    encrypt_document,
)
from tests.conftest import make_application, make_document


def _upload(client, headers, user, application, content, filename="hello.pdf"):
    return client.post(
        "/api/documents/upload",
        headers=headers(user),
        data={"application_id": str(application.id), "document_type": "AFFIDAVIT"},
        files={"file": (filename, io.BytesIO(content), "application/octet-stream")},
    )


def test_roundtrip_and_ciphertext_differs():
    blob = encrypt_document(b"secret bytes", 7)
    assert blob[:1] == b"\x01"
    assert b"secret bytes" not in blob
    assert decrypt_document(blob, 7) == b"secret bytes"


def test_wrong_application_id_fails():
    blob = encrypt_document(b"secret bytes", 7)
    with pytest.raises(ValueError):
        decrypt_document(blob, 8)


def test_unknown_version_byte_fails():
    blob = encrypt_document(b"secret bytes", 7)
    with pytest.raises(ValueError):
        decrypt_document(b"\x02" + blob[1:], 7)
    with pytest.raises(ValueError):
        decrypt_document(b"\x01short", 7)


def test_upload_then_preview_returns_plaintext(
    client, session, headers, inst_a, applicant_a, reviewer
):
    app = make_application(session, inst_a)
    plaintext = b"%PDF-1.4 hello"
    r = _upload(client, headers, applicant_a, app, plaintext)
    assert r.status_code == 201, r.text
    doc = session.get(Document, r.json()["id"])
    assert Path(doc.file_path).read_bytes() != plaintext
    assert plaintext not in Path(doc.file_path).read_bytes()

    p = client.get(f"/api/documents/{doc.id}/preview", headers=headers(reviewer))
    assert p.status_code == 200
    assert p.content == plaintext
    assert p.headers["cache-control"] == "no-store"
    assert p.headers["x-content-type-options"] == "nosniff"
    assert p.headers["content-type"] == "application/pdf"
    assert p.headers["content-disposition"].startswith("inline; filename*=UTF-8''")


def test_upload_over_limit_413(client, session, headers, inst_a, applicant_a):
    app = make_application(session, inst_a)
    big = b"%PDF-" + b"0" * (settings.MAX_UPLOAD_MB * 2**20 - 4)  # exactly limit + 1
    assert len(big) == settings.MAX_UPLOAD_MB * 2**20 + 1
    r = _upload(client, headers, applicant_a, app, big)
    assert r.status_code == 413


def test_bad_signature_422(client, session, headers, inst_a, applicant_a):
    app = make_application(session, inst_a)
    r = _upload(client, headers, applicant_a, app, b"MZ\x90\x00" + b"\x00" * 64, "evil.pdf")
    assert r.status_code == 422


def test_traversal_filename_sanitised(client, session, headers, inst_a, applicant_a):
    app = make_application(session, inst_a)
    r = _upload(client, headers, applicant_a, app, b"%PDF-1.4 x", "../../evil.pdf")
    assert r.status_code == 201, r.text
    doc = session.get(Document, r.json()["id"])
    stored = Path(doc.file_path).resolve()
    assert stored.parent == (settings.UPLOAD_DIR / f"app_{app.id}").resolve()


def test_content_disposition_unicode_and_quotes():
    value = content_disposition_inline('résumé "x".pdf')
    assert value == "inline; filename*=UTF-8''r%C3%A9sum%C3%A9%20%22x%22.pdf"
    assert '"' not in value
    evil = content_disposition_inline("a\r\nSet-Cookie: x.pdf")
    assert "\r" not in evil and "\n" not in evil


def test_ela_runs_on_decrypted_png(client, session, headers, inst_a, applicant_a, reviewer):
    app = make_application(session, inst_a)
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (200, 120, 40)).save(buf, "PNG")
    r = _upload(client, headers, applicant_a, app, buf.getvalue(), "scan.png")
    assert r.status_code == 201, r.text
    e = client.get(f"/api/documents/{r.json()['id']}/ela", headers=headers(reviewer))
    assert e.status_code == 200
    body = e.json()
    assert "anomaly_score" in body
    assert "ELA processing" not in str(body.get("details"))
    assert "Traceback" not in str(body)


def test_missing_file_marks_manual_review(session, inst_a):
    from app.services.verification_services import verification_service

    app = make_application(session, inst_a)
    doc = make_document(session, app)
    Path(doc.file_path).unlink()
    result = verification_service.process_document(session, doc)
    session.refresh(doc)
    assert doc.verification_status == VerificationStatus.MANUAL_REVIEW_REQUIRED
    assert "error" in result
    assert str(doc.file_path) not in str(doc.verification_details)


def test_verify_decrypts_stored_document(client, session, headers, inst_a, reviewer, monkeypatch):
    from app.services.ollama_service import ollama_service

    monkeypatch.setattr(ollama_service, "is_available", lambda: False)
    app = make_application(session, inst_a)
    doc = make_document(session, app, plaintext=b"%PDF-1.4 test")
    r = client.post(f"/api/documents/{doc.id}/verify", headers=headers(reviewer))
    assert r.status_code == 200, r.text
