from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from sqlmodel import Session

from app.api import admin, applications, audit, auth, dashboard, documents, health, intelligence, rules
from app.config import settings
from app.database import get_engine, seed_reference_data
from app.http import install
from app.models.models import User
from app.services.access import require_staff


@asynccontextmanager
async def lifespan(app: FastAPI):
    with Session(get_engine()) as session:
        seed_reference_data(session)
    yield


def _docs(path: str) -> str | None:
    return path if settings.ENABLE_API_DOCS else None


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "AI-enabled decision-support platform for AICTE (SIH26261) to automate preliminary "
        "validation of institutional applications, authenticate supporting documents, and "
        "verify regulatory compliance against the Approval Process Handbook."
    ),
    lifespan=lifespan,
    docs_url=_docs("/docs"),
    redoc_url=_docs("/redoc"),
    openapi_url=_docs("/openapi.json"),
)

install(app)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(rules.router)
app.include_router(applications.router)
app.include_router(documents.router)
app.include_router(dashboard.router)
app.include_router(audit.router)
app.include_router(intelligence.router)
app.include_router(health.router)


@app.get("/api/models", tags=["Dashboard"])
def get_root_model_registry(
    db: Session = Depends(dashboard.get_db),
    current_user: User = Depends(require_staff),
):
    return dashboard.get_model_registry(db, current_user)
