from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import applications, audit, auth, dashboard, documents, rules
from app.config import settings
from app.database import init_db_and_seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db_and_seed()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "AI-enabled decision-support platform for AICTE (SIH26261) to automate preliminary "
        "validation of institutional applications, authenticate supporting documents, and "
        "verify regulatory compliance against the Approval Process Handbook."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from pathlib import Path
from fastapi.staticfiles import StaticFiles

reports_dir = Path(__file__).resolve().parent.parent / "reports"
reports_dir.mkdir(parents=True, exist_ok=True)
app.mount("/reports", StaticFiles(directory=str(reports_dir)), name="reports")

app.include_router(auth.router)
app.include_router(rules.router)
app.include_router(applications.router)
app.include_router(documents.router)
app.include_router(dashboard.router)
app.include_router(audit.router)


@app.get("/api/models", tags=["Dashboard"])
@app.get("/models", tags=["Dashboard"])
def get_root_model_registry(
    db = Depends(dashboard.get_db),
    current_user = Depends(dashboard.get_current_user),
):
    return dashboard.get_model_registry(db, current_user)


@app.get("/", tags=["Health"])
async def root():
    return {
        "project": settings.PROJECT_NAME,
        "project_id": settings.PROJECT_ID,
        "status": "Backend running successfully!",
        "docs_url": "/docs",
    }
