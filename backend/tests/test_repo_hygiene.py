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
