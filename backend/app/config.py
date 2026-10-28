from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "AICTE Application Validation & Compliance Verification Platform"
    PROJECT_ID: str = "SIH26261"
    VERSION: str = "0.1.0"

    # Database: Defaults to local SQLite for zero-config development; override with PostgreSQL URL in .env
    DATABASE_URL: str = "sqlite:///./aicte_platform.db"

    # JWT / RBAC Security
    SECRET_KEY: str = "super-secret-aicte-sih26261-dev-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # 100% Offline Local LLM Inference via Ollama (Zero Online API Keys Required)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "soup-trace-lite:latest"

    # File storage directory for uploaded institutional documents
    UPLOAD_DIR: Path = Path("uploads")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
