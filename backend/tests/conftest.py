import os
import shutil
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="trace-tests-"))

# Environment must be set before anything imports `app` (settings is built at import).
os.environ.update(
    {
        "ENVIRONMENT": "development",
        "SECRET_KEY": "test-secret-key-0123456789-abcdefghijklmnopqrstuv",
        "AUDIT_HMAC_KEY": "test-audit-hmac-9876543210-zyxwvutsrqponmlkjihgfe",
        "FILE_ENCRYPTION_KEY": "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        "COOKIE_SECURE": "false",
        "CORS_ORIGINS": "http://localhost:3000",
        "UPLOAD_DIR": str(_TMP / "uploads"),
        "DATABASE_URL": f"sqlite:///{(_TMP / 'default.db').as_posix()}",
    }
)

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
def template_db() -> Path:
    path = _TMP / "template.db"
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(cfg, "head")
    return path


@pytest.fixture()
def db_path(template_db, tmp_path):
    from app.database import set_engine

    dest = tmp_path / "test.db"
    shutil.copyfile(template_db, dest)
    set_engine(f"sqlite:///{dest.as_posix()}")
    yield dest
    from app.database import get_engine

    get_engine().dispose()


@pytest.fixture()
def client(db_path):
    from app.main import app

    with TestClient(app) as c:  # lifespan seeds reference data
        yield c


@pytest.fixture()
def session(db_path):
    from app.database import get_engine

    with Session(get_engine()) as s:
        yield s


_user_counter = 0


def make_user(
    session,
    role,
    *,
    email=None,
    password="Correct-Horse-9",
    institution_id=None,
    must_change_password=False,
):
    """Create and persist a User. Plain function: `from tests.conftest import make_user`."""
    global _user_counter
    from app.models.enums import UserRole
    from app.models.models import User
    from app.services.security import hash_password

    _user_counter += 1
    role_value = role if isinstance(role, UserRole) else UserRole(role)
    user = User(
        email=email or f"{role_value.value}{_user_counter}@example.test",
        full_name=f"Test {role_value.value} {_user_counter}",
        hashed_password=hash_password(password),
        role=role_value,
        institution_id=institution_id,
        must_change_password=must_change_password,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
