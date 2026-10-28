from fastapi.testclient import TestClient


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok"}


def test_security_headers(client):
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert "strict-transport-security" not in r.headers  # development


def _preflight(client, origin):
    return client.options(
        "/api/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )


def test_cors_allowed_origin(client):
    r = _preflight(client, "http://localhost:3000")
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_cors_disallowed_origin(client):
    r = _preflight(client, "http://evil.test")
    assert "access-control-allow-origin" not in r.headers


def test_docs_disabled_by_default(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_reports_not_served(client):
    assert client.get("/reports/TRACE_AI_AUDIT_REPORT.md").status_code == 404


def test_unhandled_error_hides_message(client, caplog):
    from app.main import app

    async def boom():
        raise RuntimeError("secret-path C:/x")

    app.add_api_route("/api/_boom", boom)
    try:
        with caplog.at_level("ERROR", logger="app.http"):
            r = TestClient(app, raise_server_exceptions=False).get("/api/_boom")
    finally:
        app.router.routes[:] = [
            x for x in app.router.routes if getattr(x, "path", None) != "/api/_boom"
        ]
    assert r.status_code == 500
    body = r.json()
    assert body["detail"] == "Internal server error"
    assert "secret-path" not in r.text
    assert r.headers["x-content-type-options"] == "nosniff"
    assert any(body["error_id"] in rec.getMessage() for rec in caplog.records)
