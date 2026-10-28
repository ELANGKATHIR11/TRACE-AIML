"""Tamper-evident HMAC audit chain (spec §5.4)."""
import io
import threading

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlmodel import Session, col, select

from app.models.models import AuditLog
from app.services.audit_service import log_audit_event, verify_chain
from tests.conftest import BACKEND_DIR, make_application

GENESIS = "0" * 64
PASSWORD = "Correct-Horse-9"


def _login(client, user):
    r = client.post("/api/auth/login", data={"username": user.email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _all_rows(session):
    session.expire_all()
    return session.exec(select(AuditLog).order_by(col(AuditLog.id))).all()


def _seed_actions(client, session, headers, applicant_a):
    """Log in, create an application, upload a document — each of which audits."""
    h = _login(client, applicant_a)
    body = {"academic_year": "2026-27", "category": "EXTENSION_OF_APPROVAL", "declared_data": {}}
    r = client.post("/api/applications", headers=h, json=body)
    assert r.status_code == 201, r.text
    app_id = r.json()["id"]
    r = client.post(
        "/api/documents/upload",
        headers=h,
        data={"application_id": str(app_id), "document_type": "AFFIDAVIT"},
        files={"file": ("a.pdf", io.BytesIO(b"%PDF-1.4 chain"), "application/pdf")},
    )
    assert r.status_code == 201, r.text
    return app_id


def test_chain_intact_after_actions(client, session, headers, applicant_a, reviewer):
    _seed_actions(client, session, headers, applicant_a)
    rows = _all_rows(session)
    actions = {r.action_type for r in rows}
    assert {"LOGIN_SUCCEEDED", "DOCUMENT_UPLOADED"} <= actions

    r = client.get("/api/audit/verify-chain", headers=headers(reviewer))
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "INTACT"
    assert body["broken_at_id"] is None
    assert body["verified_count"] == len(rows)
    assert body["latest_hash"] == rows[-1].record_hash
    assert body["algorithm"] == "HMAC-SHA256 hash chain"
    assert body["verified_at"]

    # Linkage: genesis, then each prev_hash is the previous row's record_hash.
    assert rows[0].prev_hash == GENESIS
    for prev, row in zip(rows, rows[1:]):
        assert row.prev_hash == prev.record_hash
        assert len(row.record_hash) == 64


def test_db_edit_breaks_chain(client, session, headers, applicant_a, reviewer):
    _seed_actions(client, session, headers, applicant_a)
    rows = _all_rows(session)
    assert len(rows) >= 3
    middle = rows[len(rows) // 2].id

    session.connection().execute(text("UPDATE audit_logs SET summary='x' WHERE id=:id"), {"id": middle})
    session.commit()

    body = client.get("/api/audit/verify-chain", headers=headers(reviewer)).json()
    assert body["status"] == "BROKEN"
    assert body["broken_at_id"] == middle
    assert body["verified_count"] == len([r for r in rows if r.id < middle])


def test_relinked_row_breaks_chain(session):
    """Rewriting a row's hashes consistently still breaks linkage for the next row."""
    for i in range(3):
        log_audit_event(session, action_type="T", entity_type="Thing", summary=f"s{i}")
    rows = _all_rows(session)
    session.connection().execute(
        text("UPDATE audit_logs SET record_hash=:h WHERE id=:id"), {"h": "f" * 64, "id": rows[1].id}
    )
    session.commit()
    result = verify_chain(session)
    assert (result["status"], result["broken_at_id"], result["verified_count"]) == ("BROKEN", rows[1].id, 1)


def test_logs_return_stored_hashes(client, session, headers, applicant_a, reviewer):
    app_id = _seed_actions(client, session, headers, applicant_a)
    stored = {r.id: (r.prev_hash, r.record_hash) for r in _all_rows(session)}

    r = client.get("/api/audit/logs", headers=headers(reviewer))
    assert r.status_code == 200
    entries = r.json()
    assert [e["id"] for e in entries] == sorted(stored, reverse=True)  # newest first
    for e in entries:
        assert (e["prev_hash"], e["record_hash"]) == stored[e["id"]]

    scoped = client.get(f"/api/audit/logs?application_id={app_id}&limit=1", headers=headers(reviewer)).json()
    assert len(scoped) == 1 and scoped[0]["application_id"] == app_id

    assert client.get("/api/audit/logs?limit=501", headers=headers(reviewer)).status_code == 422
    assert client.get("/api/audit/logs?limit=0", headers=headers(reviewer)).status_code == 422
    assert client.get("/api/audit/logs?limit=500", headers=headers(reviewer)).status_code == 200


def test_log_audit_event_commits_callers_pending_changes_atomically(session, inst_a):
    application = make_application(session, inst_a)
    application.academic_year = "2099-00"
    session.add(application)
    entry = log_audit_event(
        session, action_type="T", entity_type="Application", summary="s", application_id=application.id
    )
    session.expire_all()
    assert session.get(type(application), application.id).academic_year == "2099-00"
    assert entry.record_hash and entry.prev_hash == GENESIS


def test_concurrent_writers_keep_chain_intact(db_path):
    from app.database import get_engine

    threads, per_thread = 8, 10
    barrier = threading.Barrier(threads)
    errors: list = []

    def worker(n):
        try:
            barrier.wait()
            for i in range(per_thread):
                with Session(get_engine()) as s:
                    log_audit_event(s, action_type="CONCURRENT", entity_type="Test", summary=f"t{n}-{i}")
        except Exception as exc:  # pragma: no cover - surfaced by the assertion below
            errors.append(exc)

    pool = [threading.Thread(target=worker, args=(n,)) for n in range(threads)]
    for t in pool:
        t.start()
    for t in pool:
        t.join()
    assert errors == []

    with Session(get_engine()) as s:
        result = verify_chain(s)
        rows = s.exec(select(AuditLog)).all()
    assert result["status"] == "INTACT", result
    assert result["verified_count"] == len(rows) == threads * per_thread
    assert len({r.prev_hash for r in rows}) == threads * per_thread


def test_migration_backfills_existing_rows(tmp_path):
    db = tmp_path / "migrate.db"
    url = f"sqlite:///{db.as_posix()}"
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)

    command.upgrade(cfg, "head")
    command.downgrade(cfg, "0002")
    engine = create_engine(url)
    with engine.begin() as conn:
        for i in range(3):
            conn.execute(
                text(
                    "INSERT INTO audit_logs (actor_role, action_type, entity_type, entity_id, summary, details, timestamp) "
                    "VALUES ('SYSTEM', 'LEGACY', 'Thing', :eid, :summary, :details, :ts)"
                ),
                {
                    "eid": str(i),
                    "summary": f"legacy row {i} — ünïcode",
                    "details": '{"b": [1, 2], "a": {"z": true}}',
                    "ts": f"2026-10-0{i + 1} 10:00:00.123456",
                },
            )
    command.upgrade(cfg, "head")

    try:
        with Session(engine) as s:
            result = verify_chain(s)
            rows = s.exec(select(AuditLog).order_by(col(AuditLog.id))).all()
            assert result["status"] == "INTACT", result
            assert result["verified_count"] == 3
            assert rows[0].prev_hash == GENESIS
            assert rows[2].prev_hash == rows[1].record_hash

            # New events continue the backfilled chain.
            log_audit_event(s, action_type="AFTER", entity_type="Thing", summary="after migration")
            assert verify_chain(s)["status"] == "INTACT"
    finally:
        engine.dispose()
