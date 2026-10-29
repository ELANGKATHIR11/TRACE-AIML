from fastapi import APIRouter
from sqlalchemy import text
from sqlmodel import Session

from app.database import get_engine

router = APIRouter(prefix="/api", tags=["Health"])


@router.get("/health")
def health():
    try:
        with Session(get_engine()) as session:
            session.exec(text("SELECT 1"))
        database = "ok"
    except Exception:
        database = "error"
    return {"status": "ok", "database": database}
