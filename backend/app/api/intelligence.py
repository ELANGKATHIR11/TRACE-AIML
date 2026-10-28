"""AI / ML / RAG / media-intake endpoints for the standalone AICTE TRACE backend API.
Every endpoint calls the real backend service; nothing here returns canned data.
"""

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.config import settings
from app.database import get_session
from app.models.models import User
from app.services import workflow
from app.services.access import load_application, require_staff
from app.services.document_storage import read_upload_limited

router = APIRouter(prefix="/api", tags=["AI, ML & Intake Tools"])


# ---------------------------------------------------------------- ML models
class ForgeryFeatures(BaseModel):
    ela_std_error: float = Field(0.0, ge=0)
    font_count: int = Field(1, ge=0)
    time_delta_hours: float = Field(0.0, ge=0)
    has_editing_software: bool = False
    text_char_entropy: float = Field(4.0, ge=0)


class ClassifyRequest(BaseModel):
    text: str = Field(min_length=3)


@router.get("/models/metrics")
def model_metrics(current_user: User = Depends(require_staff)) -> Dict[str, Any]:
    """Evaluation metrics persisted at training time, plus which artifacts exist on disk."""
    from app.services.ml_training_platform import ml_training_platform as ml

    metrics: Dict[str, Any] = {}
    if ml.metrics_path.exists():
        try:
            metrics = json.loads(ml.metrics_path.read_text(encoding="utf-8"))
        except Exception:
            metrics = {}
    return {
        "metrics": metrics,
        "artifacts": {
            "document_classifier": ml.doc_classifier_path.exists(),
            "forgery_detector": ml.forgery_classifier_path.exists(),
        },
    }


@router.post("/models/predict-document")
def predict_document(payload: ClassifyRequest, current_user: User = Depends(require_staff)):
    from app.services.ml_training_platform import ModelUnavailable, ml_training_platform
    try:
        return ml_training_platform.predict_document_type(payload.text)
    except ModelUnavailable:
        raise HTTPException(status_code=503, detail="Model unavailable")


@router.post("/models/predict-forgery")
def predict_forgery(payload: ForgeryFeatures, current_user: User = Depends(require_staff)):
    from app.services.ml_training_platform import ModelUnavailable, ml_training_platform
    try:
        return ml_training_platform.predict_forgery_risk(payload.model_dump())
    except ModelUnavailable:
        raise HTTPException(status_code=503, detail="Model unavailable")


# ---------------------------------------------------------------------- RAG
class RagQuery(BaseModel):
    query: str = Field(min_length=3)
    top_k: int = Field(3, ge=1, le=8)
    application_id: Optional[int] = None


@router.post("/rag/search")
def rag_search(
    payload: RagQuery,
    session=Depends(get_session),
    current_user: User = Depends(require_staff),
) -> Dict[str, Any]:
    """Semantic search over the indexed Approval Process Handbook clauses (and, optionally,
    over an application's indexed document text for cross-document lookups)."""
    if payload.application_id is not None:
        load_application(session, payload.application_id, current_user)

    from app.services.vector_rag_service import vector_rag_service

    clauses = vector_rag_service.query_regulatory_knowledge(payload.query, top_k=payload.top_k)
    evidence: List[Dict[str, Any]] = []
    if payload.application_id is not None:
        evidence = vector_rag_service.reconcile_multihop_evidence(payload.application_id, payload.query)
    return {"query": payload.query, "clauses": clauses, "application_evidence": evidence}


# -------------------------------------------------------------- media intake
@router.post("/media/inspect")
async def inspect_media(
    file: UploadFile = File(...),
    ocr_text: str = Form(""),
    current_user: User = Depends(require_staff),
) -> Dict[str, Any]:
    """Analyse a floor plan / photo / walkthrough video without attaching it to an application."""
    from app.services.multi_source_ingestion import multi_source_ingestion

    contents = await read_upload_limited(file, 50 * 2**20)
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")
    name = file.filename or "upload"

    # Rasterised plans carry no embedded text; run OCR so room dimensions can be read.
    text = ocr_text
    if not text and not name.lower().endswith((".mp4", ".avi", ".mov")):
        text = _ocr_bytes(contents, name)

    return multi_source_ingestion.ingest_stream_3_infrastructure_media(
        file_bytes=contents, filename=name, raw_ocr_text=text
    )


def _ocr_bytes(contents: bytes, name: str) -> str:
    from app.services.ocr_service import ocr_service

    try:
        return ocr_service.extract_document_bytes(contents, name).get("full_text", "") or ""
    except Exception:
        return ""


@router.post("/intake/authority-check")
async def authority_check(
    file: UploadFile = File(...),
    current_user: User = Depends(require_staff),
) -> Dict[str, Any]:
    """Inspect an uploaded certificate for QR codes and embedded digital signatures."""
    from app.services.issuing_authority_hub import issuing_authority_hub

    contents = await read_upload_limited(file, settings.MAX_UPLOAD_MB * 2**20)
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")
    text = _ocr_bytes(contents, file.filename or "upload.pdf")
    return {
        "filename": file.filename,
        "qr": issuing_authority_hub._inspect_qr_code(contents, text),
        "digital_signature": issuing_authority_hub._inspect_digital_signature(contents, text),
    }


# ------------------------------------------------------------- agent review
@router.post("/applications/{application_id}/agent-review")
def agent_review(
    application_id: int,
    session=Depends(get_session),
    current_user: User = Depends(require_staff),
) -> Dict[str, Any]:
    """Run the grounded three-role AI review. 503 if the local model server is down.

    Advisory only: never changes the application's status (spec §6.1).
    """
    app_obj = load_application(session, application_id, current_user)
    workflow.ensure_status(app_obj, workflow.REVIEWABLE, "run an AI review on")

    from app.services.multi_agent_workflow import multi_agent_workflow_service
    from app.services.audit_service import log_audit_event

    if not multi_agent_workflow_service.is_available():
        raise HTTPException(status_code=503, detail="AI review unavailable")

    result = multi_agent_workflow_service.run_scrutiny_workflow(session, application_id)
    log_audit_event(
        session,
        application_id=application_id,
        action_type="LANGGRAPH_CREWAI_REVIEW_COMPLETED",
        entity_type="Application",
        entity_id=app_obj.application_number,
        actor=current_user,
        summary=f"LangGraph & CrewAI orchestrated review executed for {app_obj.application_number}.",
        details={"status": result.get("status"), "grounding": result.get("grounding")},
    )
    return result
