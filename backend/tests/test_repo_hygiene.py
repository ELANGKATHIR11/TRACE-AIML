import subprocess, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]

def _ignored(path: str) -> bool:
    return subprocess.run(["git", "check-ignore", "-q", path], cwd=ROOT).returncode == 0

def test_frontend_lib_is_not_ignored():
    assert not _ignored("frontend/src/lib/api/transport.ts")

def test_generated_outputs_are_ignored():
    for p in ["backend/uploads/app_1/x.pdf", "reports/x.md", "backend/reports/x.md", "backend/aicte_platform.db", "backend/.env"]:
        assert _ignored(p), p

def test_no_uploads_tracked():
    out = subprocess.run(["git", "ls-files", "backend/uploads", "reports", "backend/reports"], cwd=ROOT, capture_output=True, text=True).stdout
    assert out.strip() == ""

def test_playwright_mcp_output_is_ignored():
    assert _ignored(".playwright-mcp/page-snapshot.yml")

def test_backend_dependencies():
    import tomllib
    deps = tomllib.loads((ROOT / "backend" / "pyproject.toml").read_text(encoding="utf-8"))["project"]["dependencies"]
    names = [d.split(">")[0].split("[")[0].split("=")[0].strip().lower() for d in deps]
    assert "passlib" not in names  # unused; bcrypt is used directly
    assert "email-validator" in names  # backs pydantic EmailStr

def test_readme_has_no_alembic_stamp_advice():
    # Stamping a pre-migration database would keep its old seeded demo accounts.
    assert "alembic stamp" not in (ROOT / "README.md").read_text(encoding="utf-8")
