"""Настройки сервера. .env не попадает во фронтенд и в ответы API."""
from dataclasses import dataclass, field
from pathlib import Path
import json
import os
from dotenv import load_dotenv

BASE = Path(__file__).resolve().parents[1]
load_dotenv(BASE / '.env')

def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else BASE / path

@dataclass
class Settings:
    mode: str = field(default_factory=lambda: os.getenv('LLM_MODE', 'demo'))
    base_url: str = field(default_factory=lambda: os.getenv('LLM_BASE_URL', 'http://127.0.0.1:8001/v1').rstrip('/'))
    api_key: str = field(default_factory=lambda: os.getenv('LLM_API_KEY', ''))
    model: str = field(default_factory=lambda: os.getenv('LLM_MODEL', 'Qwen/Qwen3-32B'))
    timeout: int = field(default_factory=lambda: int(os.getenv('LLM_TIMEOUT_SECONDS', '180')))
    max_tokens: int = field(default_factory=lambda: int(os.getenv('LLM_MAX_TOKENS', '9000')))
    temperature: float = field(default_factory=lambda: float(os.getenv('LLM_TEMPERATURE', '0.3')))
    json_mode: bool = field(default_factory=lambda: os.getenv('LLM_JSON_MODE', 'true').lower() == 'true')
    context_audit: bool = field(default_factory=lambda: os.getenv('LLM_CONTEXT_AUDIT', 'true').lower() == 'true')
    extra_body: dict = field(default_factory=lambda: json.loads(os.getenv('LLM_EXTRA_BODY', '{}')))
    storage: Path = field(default_factory=lambda: resolve_path(os.getenv('STORAGE_PATH', 'data')))
    database: Path = field(default_factory=lambda: resolve_path(os.getenv('DATABASE_PATH', 'data/deckly.sqlite3')))
    cloud_database_url: str = field(default_factory=lambda: os.getenv('CLOUD_DATABASE_URL', ''))
    max_upload_mb: int = field(default_factory=lambda: int(os.getenv('MAX_UPLOAD_MB', '50')))
    origins: list[str] = field(default_factory=lambda: os.getenv('CORS_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173').split(','))
    public_url: str = field(default_factory=lambda: os.getenv('PUBLIC_BASE_URL','http://127.0.0.1:8000').rstrip('/'))
    cookie_secure: bool = field(default_factory=lambda: os.getenv('COOKIE_SECURE','false').lower()=='true')
    yandex_id: str = field(default_factory=lambda: os.getenv('YANDEX_CLIENT_ID',''))
    yandex_secret: str = field(default_factory=lambda: os.getenv('YANDEX_CLIENT_SECRET',''))
    yandex_redirect: str = field(default_factory=lambda: os.getenv('YANDEX_REDIRECT_URI','http://127.0.0.1:8000/api/auth/yandex/callback'))

settings = Settings()
