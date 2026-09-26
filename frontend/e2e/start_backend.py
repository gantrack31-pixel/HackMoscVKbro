"""Start a deterministic, disposable backend for Playwright runs."""
import os
from pathlib import Path
import sys


backend = Path(__file__).resolve().parents[2] / "backend"
run_dir = Path(__file__).resolve().parents[1] / "test-results" / "runtime"
sys.path.insert(0, str(backend))
os.chdir(backend)

os.environ.update({
    "APP_ENV": "development",
    "LLM_MODE": "demo",
    "COOKIE_SECURE": "false",
    "DATABASE_PATH": str(run_dir / "deckly-e2e.sqlite3"),
    "STORAGE_PATH": str(run_dir / "data"),
    "CORS_ORIGINS": "http://127.0.0.1:5183",
})

from app import database

database.initialize()

import uvicorn

uvicorn.run("app.main:app", host="127.0.0.1", port=8183, access_log=False)