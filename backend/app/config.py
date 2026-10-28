import base64
import binascii
from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LEGACY_SECRET_DEFAULTS: frozenset[str] = frozenset(
    {
        "super-secret-aicte-sih26261-dev-key-change-in-production",
        "super-secret-aicte-sih26261-local-offline-key",
    }
)


class Settings(BaseSettings):
    PROJECT_NAME: str = "AICTE Application Validation & Compliance Verification Platform"
    PROJECT_ID: str = "SIH26261"
    VERSION: str = "0.1.0"

    ENVIRONMENT: Literal["production", "development"] = "production"

    # Database: Defaults to local SQLite for zero-config development; override with PostgreSQL URL in .env
    DATABASE_URL: str = "sqlite:///./aicte_platform.db"

    # Secrets (all required; generate with `python -m app.cli generate-keys`)
    SECRET_KEY: str
    FILE_ENCRYPTION_KEY: str
    AUDIT_HMAC_KEY: str

    # JWT / RBAC Security
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_HOURS: int = 8

    # Web security
    CORS_ORIGINS: str = ""
    COOKIE_SECURE: bool = True
    COOKIE_SAMESITE: Literal["strict", "lax", "none"] = "strict"
    ENABLE_API_DOCS: bool = False
    MAX_UPLOAD_MB: int = 25

    # 100% Offline Local LLM Inference via Ollama (Zero Online API Keys Required)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "soup-trace-lite:latest"

    # File storage directory for uploaded institutional documents
    UPLOAD_DIR: Path = Path("uploads")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,  # never echo secret values in validation errors
    )

    @field_validator("SECRET_KEY")
    @classmethod
    def _check_secret_key(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        if v in LEGACY_SECRET_DEFAULTS:
            raise ValueError("SECRET_KEY must not be a known default value")
        return v

    @field_validator("AUDIT_HMAC_KEY")
    @classmethod
    def _check_audit_key(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("AUDIT_HMAC_KEY must be at least 32 characters")
        return v

    @field_validator("FILE_ENCRYPTION_KEY")
    @classmethod
    def _check_file_key(cls, v: str) -> str:
        try:
            raw = base64.urlsafe_b64decode(v.encode("ascii"))
        except (binascii.Error, UnicodeEncodeError, ValueError):
            raise ValueError("FILE_ENCRYPTION_KEY must be urlsafe-base64 encoded") from None
        if len(raw) != 32:
            raise ValueError("FILE_ENCRYPTION_KEY must decode to exactly 32 bytes")
        return v

    @field_validator("ACCESS_TOKEN_EXPIRE_MINUTES")
    @classmethod
    def _check_access_ttl(cls, v: int) -> int:
        if not 5 <= v <= 60:
            raise ValueError("ACCESS_TOKEN_EXPIRE_MINUTES must be between 5 and 60")
        return v

    @field_validator("REFRESH_TOKEN_EXPIRE_HOURS")
    @classmethod
    def _check_refresh_ttl(cls, v: int) -> int:
        if not 1 <= v <= 24:
            raise ValueError("REFRESH_TOKEN_EXPIRE_HOURS must be between 1 and 24")
        return v

    @field_validator("CORS_ORIGINS")
    @classmethod
    def _check_cors(cls, v: str) -> str:
        if "*" in [o.strip() for o in v.split(",")]:
            raise ValueError("CORS_ORIGINS must list exact origins; '*' is not allowed")
        return v

    @model_validator(mode="after")
    def _check_cross_field(self) -> "Settings":
        if self.AUDIT_HMAC_KEY == self.SECRET_KEY:
            raise ValueError("AUDIT_HMAC_KEY must differ from SECRET_KEY")
        if self.ENVIRONMENT == "production" and not self.COOKIE_SECURE:
            raise ValueError("COOKIE_SECURE must be true when ENVIRONMENT=production")
        if self.COOKIE_SAMESITE == "none" and not self.COOKIE_SECURE:
            raise ValueError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true")
        return self

    @property
    def file_encryption_key_bytes(self) -> bytes:
        return base64.urlsafe_b64decode(self.FILE_ENCRYPTION_KEY.encode("ascii"))

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
