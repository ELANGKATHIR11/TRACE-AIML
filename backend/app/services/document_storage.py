"""Encrypted document storage: versioned AES-256-GCM format, bounded uploads, in-memory reads.

Stored format: b"\x01" (key version) || 12-byte nonce || AES-256-GCM ciphertext+tag,
with AAD = f"APP-{application_id}" so a blob cannot be replayed under another application.
"""

import os
import tempfile
from pathlib import Path
from typing import Any, Dict, Tuple
from urllib.parse import quote

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException, UploadFile

from app.config import settings
from app.models.enums import DocumentType
from app.models.models import Document

KEY_VERSION = b"\x01"
_NONCE_LEN = 12
_TAG_LEN = 16
_CHUNK = 1024 * 1024

_aesgcm = AESGCM(settings.file_encryption_key_bytes)


def _aad(application_id: int) -> bytes:
    return f"APP-{application_id}".encode("utf-8")


def encrypt_document(plaintext: bytes, application_id: int) -> bytes:
    nonce = os.urandom(_NONCE_LEN)
    return KEY_VERSION + nonce + _aesgcm.encrypt(nonce, plaintext, _aad(application_id))


def decrypt_document(blob: bytes, application_id: int) -> bytes:
    if len(blob) < 1 + _NONCE_LEN + _TAG_LEN:
        raise ValueError("Invalid encrypted document")
    if blob[:1] != KEY_VERSION:
        raise ValueError("Unsupported document encryption version")
    nonce = blob[1 : 1 + _NONCE_LEN]
    try:
        return _aesgcm.decrypt(nonce, blob[1 + _NONCE_LEN :], _aad(application_id))
    except InvalidTag as exc:
        raise ValueError("Document failed authentication") from exc


async def read_upload_limited(file: UploadFile, max_bytes: int) -> bytes:
    """Read an upload in 1 MiB chunks, aborting with 413 as soon as max_bytes is exceeded."""
    chunks = []
    total = 0
    while True:
        chunk = await file.read(_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds the {max_bytes // 2**20} MB upload limit",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def store_document(
    application_id: int,
    document_type: DocumentType,
    plaintext: bytes,
    original_filename: str,
) -> Tuple[Path, Dict[str, Any]]:
    """Sanitise, encrypt and write a document. Returns (path, sanitised meta)."""
    from app.services.production_security import production_security

    try:
        meta = production_security.sanitize_uploaded_document(plaintext, original_filename)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    save_dir = settings.UPLOAD_DIR / f"app_{application_id}"
    save_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{document_type.value.lower()}_{meta['sha256_digest'][:10]}_{meta['sanitized_filename']}"
    target = save_dir / safe_name
    target.write_bytes(encrypt_document(plaintext, application_id))
    return target, meta


def read_document_plaintext(doc: Document) -> bytes:
    """Decrypt a stored document in memory. Raises FileNotFoundError / ValueError."""
    blob = Path(doc.file_path).read_bytes()
    return decrypt_document(blob, doc.application_id)


def content_disposition_inline(filename: str) -> str:
    name = Path(str(filename).replace("\\", "/")).name
    name = "".join(ch for ch in name if ch.isprintable()) or "document"
    return f"inline; filename*=UTF-8''{quote(name, safe='')}"


def ela_on_bytes(plaintext: bytes, mime_type: str) -> Dict[str, Any]:
    """Run Error Level Analysis on decrypted image bytes via a temp file removed afterwards."""
    from app.services.image_forensics_service import ImageForensicsService

    suffix = ".png" if mime_type == "image/png" else ".jpg"
    with tempfile.TemporaryDirectory(prefix="trace-ela-") as tmp:
        path = Path(tmp) / f"doc{suffix}"
        path.write_bytes(plaintext)
        return ImageForensicsService.perform_error_level_analysis(path)
