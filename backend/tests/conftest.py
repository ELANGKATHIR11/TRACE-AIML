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
_hash_cache: dict = {}


def _password_hash(password):
    # bcrypt is deliberately slow; tests create many users with the same password.
    from app.services.security import hash_password

    if password not in _hash_cache:
        _hash_cache[password] = hash_password(password)
    return _hash_cache[password]


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

    _user_counter += 1
    role_value = role if isinstance(role, UserRole) else UserRole(role)
    user = User(
        email=email or f"{role_value.value}{_user_counter}@example.test",
        full_name=f"Test {role_value.value} {_user_counter}",
        hashed_password=_password_hash(password),
        role=role_value,
        institution_id=institution_id,
        must_change_password=must_change_password,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(autouse=True)
def _reset_login_limiter():
    """The per-IP login limiter is process-global; isolate it between tests."""
    from app.api.auth import login_limiter

    login_limiter.reset()
    yield
    login_limiter.reset()


_counter = 0


def _next() -> int:
    global _counter
    _counter += 1
    return _counter


def make_institution(session, name=None):
    from app.models.models import Institution

    n = _next()
    inst = Institution(
        aicte_permanent_id=f"9-TEST{n:06d}",
        name=name or f"Test Institute {n}",
        state="Maharashtra",
        district="Pune",
        address=f"{n} Test Road",
        established_year=2010,
        historical_records={},
    )
    session.add(inst)
    session.commit()
    session.refresh(inst)
    return inst


@pytest.fixture()
def inst_a(session):
    return make_institution(session, "Institution A")


@pytest.fixture()
def inst_b(session):
    return make_institution(session, "Institution B")


@pytest.fixture()
def admin(session):
    return make_user(session, "admin")


@pytest.fixture()
def reviewer(session):
    return make_user(session, "reviewer")


@pytest.fixture()
def applicant_a(session, inst_a):
    return make_user(session, "applicant", institution_id=inst_a.id)


@pytest.fixture()
def applicant_b(session, inst_b):
    return make_user(session, "applicant", institution_id=inst_b.id)


def auth_headers(user) -> dict:
    """Bearer headers minted directly (no login round-trip: bcrypt + per-IP limiter)."""
    from app.services.tokens import create_access_token

    return {"Authorization": f"Bearer {create_access_token(user)[0]}"}


@pytest.fixture()
def headers():
    return auth_headers


def make_application(session, institution, status=None):
    """Create an Application for `institution`, submitted by one of its applicants."""
    from sqlmodel import select

    from app.models.enums import ApplicationCategory, ApplicationStatus, UserRole
    from app.models.models import Application, User

    submitter = session.exec(
        select(User)
        .where(User.institution_id == institution.id)
        .where(User.role == UserRole.APPLICANT)
    ).first() or make_user(session, UserRole.APPLICANT, institution_id=institution.id)

    application = Application(
        application_number=f"AICTE-TEST-{_next():06d}",
        institution_id=institution.id,
        submitted_by_user_id=submitter.id,
        category=ApplicationCategory.EOA,
        status=status or ApplicationStatus.DRAFT,
    )
    session.add(application)
    session.commit()
    session.refresh(application)
    return application


def make_document(session, application, document_type=None, plaintext=b"%PDF-1.4 test"):
    """Create a Document for `application`. Writes raw bytes until Task 9's encrypted storage."""
    import hashlib

    from app.config import settings
    from app.models.enums import DocumentType
    from app.models.models import Document

    document_type = document_type or DocumentType.AFFIDAVIT
    save_dir = settings.UPLOAD_DIR / f"app_{application.id}"
    save_dir.mkdir(parents=True, exist_ok=True)
    path = save_dir / f"{document_type.value.lower()}_{_next()}.pdf"
    path.write_bytes(plaintext)

    doc = Document(
        application_id=application.id,
        document_type=document_type,
        filename=path.name,
        file_path=str(path),
        mime_type="application/pdf",
        file_size_bytes=len(plaintext),
        sha256_hash=hashlib.sha256(plaintext).hexdigest(),
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return doc


@pytest.fixture(name="make_application")
def _make_application_fixture():
    return make_application


@pytest.fixture(name="make_document")
def _make_document_fixture():
    return make_document
