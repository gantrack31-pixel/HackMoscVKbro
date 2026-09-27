"""Unit tests must never inherit real service credentials from a developer's .env."""
import os

# Set before test collection imports app.config / load_dotenv (override=False).
os.environ.update({
    'APP_ENV': 'development', 'LLM_MODE': 'demo', 'ALLOW_DEMO_IN_PRODUCTION': 'false',
    'LLM_BASE_URL': 'http://127.0.0.1:8001/v1', 'LLM_MODEL': 'test-model',
    'LLM_API_KEY': '', 'YANDEX_FOLDER_ID': '', 'LLM_JSON_MODE': 'true',
    'LLM_EXTRA_BODY': '{}', 'LLM_CONTEXT_AUDIT': 'true',
    'LLM_VISION_ENABLED': 'false',
    'YANDEX_CLIENT_ID': '', 'YANDEX_CLIENT_SECRET': '',
    'YANDEX_REDIRECT_URI': 'http://127.0.0.1:8000/api/auth/yandex/callback',
    'SMTP_HOST': '', 'SMTP_USERNAME': '', 'SMTP_PASSWORD': '', 'EMAIL_FROM': '',
    'SMTP_PORT': '465', 'EMAIL_VERIFICATION_REQUIRED': 'true',
    'PUBLIC_BASE_URL': 'http://127.0.0.1:8000', 'COOKIE_SECURE': 'false',
    'CORS_ORIGINS': 'http://127.0.0.1:5173,http://localhost:5173',
    'CLOUD_DATABASE_URL': '',
})
