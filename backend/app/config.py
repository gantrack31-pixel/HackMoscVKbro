"""Настройки сервера. .env не попадает во фронтенд и в ответы API."""
from dataclasses import dataclass, field
import ipaddress
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from dotenv import load_dotenv

BASE = Path(__file__).resolve().parents[1]
load_dotenv(BASE / '.env')

def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else BASE / path


def _is_local_host(host: str) -> bool:
    host = host.lower().rstrip('.')
    if host == 'localhost' or host.endswith('.localhost') or host.endswith('.local'):
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _https_origin(value: str) -> str | None:
    try:
        parsed = urlsplit(value)
        if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.path not in ('', '/')
                or _is_local_host(parsed.hostname)):
            return None
        # Accessing .port also validates that an explicit port is numeric and in range.
        port = parsed.port
        if port == 0:
            return None
        return f'https://{parsed.hostname.lower()}' + (f':{port}' if port and port != 443 else '')
    except ValueError:
        return None

@dataclass
class Settings:
    app_env: str = field(default_factory=lambda: os.getenv('APP_ENV', 'development').strip().lower())
    allow_demo_in_production: bool = field(default_factory=lambda: os.getenv('ALLOW_DEMO_IN_PRODUCTION', 'false').strip().lower() == 'true')
    mode: str = field(default_factory=lambda: os.getenv('LLM_MODE', 'demo'))
    base_url: str = field(default_factory=lambda: os.getenv('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1').rstrip('/'))
    api_key: str = field(default_factory=lambda: os.getenv('OPENROUTER_API_KEY', ''), repr=False)
    openrouter_referer: str = field(default_factory=lambda: os.getenv('OPENROUTER_HTTP_REFERER', os.getenv('PUBLIC_BASE_URL', 'http://127.0.0.1:8000')))
    image_base_url: str = field(default_factory=lambda: os.getenv('IMAGE_BASE_URL', '').rstrip('/'))
    image_api_key: str = field(default_factory=lambda: os.getenv('IMAGE_API_KEY', ''), repr=False)
    model: str = field(default_factory=lambda: os.getenv('OPENROUTER_MODEL', 'qwen/qwen-2.5-72b-instruct'))
    timeout: int = field(default_factory=lambda: int(os.getenv('LLM_TIMEOUT_SECONDS', '180')))
    max_tokens: int = field(default_factory=lambda: int(os.getenv('LLM_MAX_TOKENS', '8000')))
    temperature: float = field(default_factory=lambda: float(os.getenv('LLM_TEMPERATURE', '0.3')))
    json_mode: bool = field(default_factory=lambda: os.getenv('LLM_JSON_MODE', 'true').lower() == 'true')
    vision: bool = field(default_factory=lambda: os.getenv('LLM_VISION_ENABLED', 'false').lower() == 'true')
    context_audit: bool = field(default_factory=lambda: os.getenv('LLM_CONTEXT_AUDIT', 'true').lower() == 'true')
    extra_body: dict = field(default_factory=lambda: json.loads(os.getenv('LLM_EXTRA_BODY', '{}')))
    storage: Path = field(default_factory=lambda: resolve_path(os.getenv('STORAGE_PATH', 'data')))
    database: Path = field(default_factory=lambda: resolve_path(os.getenv('DATABASE_PATH', 'data/deckly.sqlite3')))
    cloud_database_url: str = field(default_factory=lambda: os.getenv('CLOUD_DATABASE_URL', ''), repr=False)
    max_upload_mb: int = field(default_factory=lambda: int(os.getenv('MAX_UPLOAD_MB', '50')))
    origins: list[str] = field(default_factory=lambda: [origin.strip().rstrip('/') for origin in os.getenv('CORS_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173').split(',') if origin.strip()])
    public_url: str = field(default_factory=lambda: os.getenv('PUBLIC_BASE_URL','http://127.0.0.1:8000').rstrip('/'))
    cookie_secure: bool = field(default_factory=lambda: os.getenv('COOKIE_SECURE','false').lower()=='true')
    yandex_id: str = field(default_factory=lambda: os.getenv('YANDEX_CLIENT_ID',''))
    yandex_secret: str = field(default_factory=lambda: os.getenv('YANDEX_CLIENT_SECRET',''), repr=False)
    yandex_redirect: str = field(default_factory=lambda: os.getenv('YANDEX_REDIRECT_URI','http://127.0.0.1:8000/api/auth/yandex/callback'))
    email_verification_required: bool = field(default_factory=lambda: os.getenv('EMAIL_VERIFICATION_REQUIRED','true').lower() == 'true')
    smtp_host: str = field(default_factory=lambda: os.getenv('SMTP_HOST',''))
    smtp_port: int = field(default_factory=lambda: int(os.getenv('SMTP_PORT','465')))
    smtp_username: str = field(default_factory=lambda: os.getenv('SMTP_USERNAME',''))
    smtp_password: str = field(default_factory=lambda: os.getenv('SMTP_PASSWORD',''), repr=False)
    email_from: str = field(default_factory=lambda: os.getenv('EMAIL_FROM',''))


def validate_settings(config: Settings = None) -> None:
    """Fail fast on unsafe public settings without restricting local development."""
    config = config or settings
    if config.app_env not in {'development', 'production'}:
        raise ValueError('APP_ENV должен быть development или production.')
    if config.mode not in {'demo', 'live'}:
        raise ValueError('LLM_MODE должен быть demo или live.')
    if config.smtp_port < 1 or config.smtp_port > 65535:
        raise ValueError('SMTP_PORT должен быть в диапазоне 1–65535.')
    smtp_values=(config.smtp_host.strip(),config.smtp_username.strip(),config.smtp_password,config.email_from.strip())
    if any(smtp_values) and not all(smtp_values):
        raise ValueError('Для SMTP задайте все параметры: SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD и EMAIL_FROM.')
    if config.app_env != 'production':
        return

    public_origin = _https_origin(config.public_url)
    if not public_origin or public_origin != config.public_url:
        raise ValueError('В production PUBLIC_BASE_URL должен быть публичным HTTPS URL без пути.')
    if not config.cookie_secure:
        raise ValueError('В production требуется COOKIE_SECURE=true.')
    if not config.origins:
        raise ValueError('В production CORS_ORIGINS должен содержать хотя бы один доверенный HTTPS origin.')
    normalized_origins = [_https_origin(origin) for origin in config.origins]
    if any(origin is None or origin != configured for origin, configured in zip(normalized_origins, config.origins)):
        raise ValueError('В production каждый CORS_ORIGINS должен быть публичным HTTPS origin; wildcard и localhost запрещены.')
    if public_origin not in normalized_origins:
        raise ValueError('Origin из PUBLIC_BASE_URL должен присутствовать в CORS_ORIGINS.')
    if config.mode == 'demo' and not config.allow_demo_in_production:
        raise ValueError('LLM_MODE=demo в production запрещён; для осознанного demo-режима задайте ALLOW_DEMO_IN_PRODUCTION=true.')
    if config.mode == 'live' and not config.api_key.strip():
        raise ValueError('Для LLM_MODE=live в production требуется OPENROUTER_API_KEY.')
    if config.email_verification_required and not all((config.smtp_host.strip(), config.smtp_username.strip(),
                                                        config.smtp_password, config.email_from.strip())):
        raise ValueError('Для подтверждения email в production задайте SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD и EMAIL_FROM.')
    if config.yandex_id:
        try:
            parsed = urlsplit(config.yandex_redirect)
            redirect_origin = _https_origin(f'{parsed.scheme}://{parsed.netloc}')
            valid_redirect = (redirect_origin == public_origin
                              and parsed.path == '/api/auth/yandex/callback'
                              and not parsed.query and not parsed.fragment)
        except ValueError:
            valid_redirect = False
        if not valid_redirect:
            raise ValueError('В production YANDEX_REDIRECT_URI должен быть HTTPS callback на PUBLIC_BASE_URL.')

settings = Settings()
