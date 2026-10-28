"""Execution surface: no hard-coded drive paths, pinned model loading, honest AI availability."""
import shutil
from pathlib import Path

from app.models.enums import ApplicationStatus
from app.models.models import Application

APP_DIR = Path(__file__).resolve().parent.parent / "app"
FORGERY = {"ela_std_error": 1.0, "font_count": 2, "time_delta_hours": 1.0,
           "has_editing_software": False, "text_char_entropy": 4.0}


def test_no_hardcoded_drive_paths():
    offenders = []
    for path in APP_DIR.rglob("*.py"):
        text = path.read_text(encoding="utf-8", errors="ignore").lower()
        if "f:/" in text or "f:\\" in text:
            offenders.append(str(path))
    assert offenders == []


def _registry(tmp_path, monkeypatch):
    from app.services import ml_training_platform as mod

    dest = tmp_path / "models_registry"
    shutil.copytree(mod.MODELS_DIR, dest)
    monkeypatch.setattr(mod, "MODELS_DIR", dest)
    return dest


def test_tampered_model_returns_503(client, reviewer, headers, tmp_path, monkeypatch):
    dest = _registry(tmp_path, monkeypatch)
    with open(dest / "forgery_detector_v1.pkl", "ab") as f:
        f.write(b"\x00")
    r = client.post("/api/models/predict-forgery", json=FORGERY, headers=headers(reviewer))
    assert r.status_code == 503
    assert r.json() == {"detail": "Model unavailable"}


def test_pinned_model_predicts(client, reviewer, headers, tmp_path, monkeypatch):
    _registry(tmp_path, monkeypatch)
    r = client.post("/api/models/predict-forgery", json=FORGERY, headers=headers(reviewer))
    assert r.status_code == 200, r.text


def test_agent_review_unavailable_is_503(client, session, reviewer, inst_a, headers, monkeypatch):
    import sys
    import types

    # chromadb is not needed here; stub the vector service so the workflow module imports offline.
    fake = types.ModuleType("app.services.vector_rag_service")
    fake.vector_rag_service = types.SimpleNamespace()
    monkeypatch.setitem(sys.modules, "app.services.vector_rag_service", fake)
    sys.modules.pop("app.services.multi_agent_workflow", None)
    from app.services.multi_agent_workflow import multi_agent_workflow_service

    monkeypatch.setattr(multi_agent_workflow_service, "is_available", lambda: False)
    app_obj = _make_app(session, inst_a)
    r = client.post(f"/api/applications/{app_obj.id}/agent-review", headers=headers(reviewer))
    assert r.status_code == 503
    assert r.json() == {"detail": "AI review unavailable"}
    session.expire_all()
    assert session.get(Application, app_obj.id).status == ApplicationStatus.SUBMITTED


def _make_app(session, inst):
    from tests.conftest import make_application

    return make_application(session, inst, status=ApplicationStatus.SUBMITTED)
