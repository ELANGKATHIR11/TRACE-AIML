import base64

import pytest
from pydantic import ValidationError

from app import cli
from app.config import Settings

GOOD_SECRET = "s" * 40
GOOD_AUDIT = "a" * 40
GOOD_FILE_KEY = base64.urlsafe_b64encode(b"k" * 32).decode()


def make(**overrides):
    base = dict(
        SECRET_KEY=GOOD_SECRET,
        AUDIT_HMAC_KEY=GOOD_AUDIT,
        FILE_ENCRYPTION_KEY=GOOD_FILE_KEY,
        ENVIRONMENT="development",
        COOKIE_SECURE=True,
        CORS_ORIGINS="https://x",
    )
    base.update(overrides)
    return Settings(_env_file=None, **base)


def _expect(field, value=None, **overrides):
    with pytest.raises(ValidationError) as exc:
        make(**overrides)
    msg = str(exc.value)
    assert field in msg
    if value:
        assert value not in msg


def test_valid_settings():
    s = make()
    assert s.cors_origin_list == ["https://x"]
    assert len(s.file_encryption_key_bytes) == 32


def test_missing_secret_key(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValidationError) as exc:
        Settings(
            _env_file=None,
            AUDIT_HMAC_KEY=GOOD_AUDIT,
            FILE_ENCRYPTION_KEY=GOOD_FILE_KEY,
        )
    assert "SECRET_KEY" in str(exc.value)


def test_short_secret_key():
    _expect("SECRET_KEY", "x" * 31, SECRET_KEY="x" * 31)


def test_legacy_secret_key():
    legacy = "super-secret-aicte-sih26261-local-offline-key"
    _expect("SECRET_KEY", legacy, SECRET_KEY=legacy)


def test_file_key_wrong_length():
    bad = base64.urlsafe_b64encode(b"k" * 16).decode()
    _expect("FILE_ENCRYPTION_KEY", bad, FILE_ENCRYPTION_KEY=bad)


def test_audit_key_equals_secret():
    _expect("AUDIT_HMAC_KEY", GOOD_SECRET, AUDIT_HMAC_KEY=GOOD_SECRET)


def test_cors_wildcard_rejected():
    _expect("CORS_ORIGINS", CORS_ORIGINS="*")


def test_production_requires_secure_cookie():
    _expect("COOKIE_SECURE", ENVIRONMENT="production", COOKIE_SECURE=False)


def test_samesite_none_requires_secure():
    _expect("COOKIE_SAMESITE", COOKIE_SAMESITE="none", COOKIE_SECURE=False)


def test_generate_keys_output_is_valid(capsys):
    assert cli.main(["generate-keys"]) == 0
    out = capsys.readouterr().out
    parsed = dict(
        line.split("=", 1) for line in out.splitlines() if "=" in line and not line.startswith("#")
    )
    assert set(parsed) == {"SECRET_KEY", "AUDIT_HMAC_KEY", "FILE_ENCRYPTION_KEY"}
    Settings(_env_file=None, **parsed, CORS_ORIGINS="https://x")
