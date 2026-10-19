# Inference API Integration Checklist

## ✅ Completed

- [x] Removed all OpenRouter references from codebase
- [x] Updated configuration system (config.py)
  - Changed from `OPENROUTER_*` to `LLM_*` variables
  - Added `LLM_PROJECT_ID` field
  - Updated error messages
  
- [x] Updated LLM service (llm.py)
  - Added `Project-ID` header support
  - Removed OpenRouter-specific logic (HTTP-Referer, reasoning)
  - Disabled `response_format` for platformpreview API
  
- [x] Updated environment files
  - .env.docker
  - .env.docker.example
  - backend/.env.example
  
- [x] Updated tests (8 files)
  - conftest.py
  - test_template_openrouter.py (renamed functionality tests)
  - test_ai_flexibility.py
  - test_live_generation.py
  - test_config.py
  - test_brand_style.py
  - test_analytics_integration.py
  - asgi-worker.py

- [x] Created test script (test_inference_api.py)

## 📋 Next Steps

### 1. Verify Credentials
```bash
# Check that your credentials are correct
cd HackMoscVKbro
set -a && source .env.docker && set +a
python3 test_inference_api.py
```

If you get HTTP 500:
- Confirm `LLM_API_KEY` value is correct
- Confirm `LLM_PROJECT_ID` value is correct
- Contact API provider to verify endpoint availability

### 2. Run Tests (in Docker)
```bash
docker compose up
# Tests should pass with the new API configuration
```

### 3. Test in Development
```bash
cd backend
python3 -m pytest tests/test_config.py tests/test_template_openrouter.py -v
```

### 4. Update Documentation
- [ ] Update project README.md with Inference API instructions
- [ ] Add Inference API section to docs/INTEGRATIONS.md

## 🔧 Technical Details

### Request Format
```http
POST https://ai-demo.platformpreview.ru/api/inference-providers-router/00000000-0000-0000-0000-000000000001/v1/chat/completions

Headers:
  Authorization: Bearer <LLM_API_KEY>
  Project-ID: <LLM_PROJECT_ID>
  Content-Type: application/json

Body:
{
  "model": "qwen38-27b-fp8",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "temperature": 0.3,
  "max_tokens": 8000
}
```

### Configuration Hierarchy
1. Environment variables (highest priority)
2. .env file in backend/ directory
3. .env.docker file (for Docker)
4. Hardcoded defaults (lowest priority)

### Changes from OpenRouter

#### Headers
- ❌ Removed: `HTTP-Referer`, `X-Title`
- ✅ Added: `Project-ID`
- ✅ Kept: `Authorization: Bearer`

#### Parameters
- ❌ Removed: `reasoning` option (not supported)
- ✅ Kept: `temperature`, `max_tokens`, `messages`
- ❓ Disabled: `response_format` (may not be supported)

#### Models
- ❌ Old: `qwen/qwen3.8-27b` (OpenRouter format)
- ✅ New: `qwen38-27b-fp8` (Inference API format)

## 📊 Error Reference

| HTTP Status | Cause | Solution |
|-------------|-------|----------|
| 400 | Invalid request format | Check request body JSON |
| 401 | Missing/invalid auth | Verify `LLM_API_KEY` |
| 403 | Invalid project | Verify `LLM_PROJECT_ID` |
| 500 | Server error | Check API status, retry later |
| 429 | Rate limited | Wait and retry |

## 🚀 Deployment

### Docker
```bash
# The image will pick up .env.docker
docker compose up -d
```

### Manual/VPS
```bash
# Set environment variables before starting
export LLM_API_KEY="your_key"
export LLM_PROJECT_ID="your_id"
python3 -m uvicorn app.main:app
```

### Railway / Cloud Platform
Set these environment variables in the platform UI:
- `LLM_MODE=live`
- `LLM_API_KEY=...`
- `LLM_PROJECT_ID=...`

## 📝 Commit History

All changes have been committed with message: "Switch from OpenRouter to Inference API (platformpreview.ru)"

Review changes with:
```bash
git log --oneline -1
git show HEAD
```

## ⚠️ Known Issues

- **HTTP 500 on initial test**: Likely API provider issue or incorrect credentials
  - Verify credentials with API provider
  - Check API endpoint status
  - Try again in a few moments

- **response_format errors**: Not supported by platformpreview API
  - `LLM_JSON_MODE=false` is set by default
  - Backend validates JSON structure separately

- **Slow responses**: May occur during high load
  - Increase `LLM_TIMEOUT_SECONDS` if needed
  - Default is 180 seconds (3 minutes)
