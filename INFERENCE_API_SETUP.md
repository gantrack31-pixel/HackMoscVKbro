# Inference API Setup Guide

## Overview

The project has been migrated from **OpenRouter** to **Inference API** (platformpreview.ru).

## Configuration

### Environment Variables

You need to set three environment variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `LLM_API_KEY` | Your API key | Bearer token for authentication |
| `LLM_PROJECT_ID` | Your project ID | UUID of your project |
| `LLM_BASE_URL` | (optional) | Defaults to platformpreview.ru endpoint |
| `LLM_MODEL` | (optional) | Defaults to `qwen38-27b-fp8` |

### Setup Methods

#### Method 1: Docker (.env.docker)
```env
LLM_MODE=live
LLM_BASE_URL=https://ai-demo.platformpreview.ru/api/inference-providers-router/00000000-0000-0000-0000-000000000001/v1
LLM_API_KEY=your_api_key_here
LLM_PROJECT_ID=your_project_id_here
LLM_MODEL=qwen38-27b-fp8
LLM_JSON_MODE=false
```

#### Method 2: Local Development (backend/.env)
Create `backend/.env` file:
```env
LLM_MODE=live
LLM_API_KEY=your_api_key_here
LLM_PROJECT_ID=your_project_id_here
```

#### Method 3: Environment Variables
```bash
export LLM_MODE=live
export LLM_API_KEY="your_api_key_here"
export LLM_PROJECT_ID="your_project_id_here"
```

## Testing Connectivity

A test script is provided to verify API connectivity:

```bash
# Make sure your credentials are in .env.docker or set as env vars
python3 test_inference_api.py
```

Expected output on success:
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "qwen38-27b-fp8",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Moscow is the capital of Russia."
      },
      "finish_reason": "stop"
    }
  ]
}
```

## Troubleshooting

### Error: "HTTP 500 - Server error"

1. **Verify credentials:**
   - Check that `LLM_API_KEY` and `LLM_PROJECT_ID` are correct
   - Run `echo $LLM_API_KEY` to verify they're set
   - Run `python3 test_inference_api.py` to test directly

2. **Check API status:**
   - The API might be under maintenance
   - Try the request a few minutes later

3. **Network issues:**
   - Ensure your network can reach `ai-demo.platformpreview.ru`
   - Check if your IP address is blocked (contact API provider if needed)

4. **Wrong credentials:**
   - Ensure you're using the correct API key and Project ID from your account
   - Keys are case-sensitive

### Error: "401 Unauthorized"
- `LLM_API_KEY` is invalid or missing
- Verify the key is correctly formatted: `Bearer <key>` is added automatically

### Error: "403 Forbidden"  
- `LLM_PROJECT_ID` is invalid or missing
- The key might not have access to this project

### Error: "No JSON in response"
- Ensure `LLM_JSON_MODE=false` in your configuration
- The Inference API may not support OpenAI's `response_format` parameter

## Migration Notes

### What Changed

| Aspect | Before (OpenRouter) | After (Inference API) |
|--------|---------------------|----------------------|
| Endpoint | `https://openrouter.ai/api/v1` | `https://ai-demo.platformpreview.ru/api/inference-providers-router/...` |
| Auth Header | `Authorization: Bearer <key>` | Same + `Project-ID: <id>` |
| Model | `qwen/qwen3.8-27b` | `qwen38-27b-fp8` |
| JSON Mode | Supported | Currently disabled (`LLM_JSON_MODE=false`) |
| Referer Header | Required (`HTTP-Referer`) | Not required |

### Files Modified

- `backend/app/config.py` - Configuration loading
- `backend/app/services/llm.py` - LLM request handling
- `backend/tests/conftest.py` - Test configuration
- All test files referencing OpenRouter

## Support

If you continue experiencing issues:

1. **Check logs:**
   ```bash
   docker logs <container_name> 2>&1 | grep -i "llm\|error" | tail -50
   ```

2. **Enable verbose logging:**
   - Set `LLM_DEBUG=true` (if supported by the backend)

3. **Contact API support:**
   - Email: your_support_contact@example.com
   - Include: API key (first 20 chars), Project ID, error message

## References

- Inference API Documentation: See `inference_quickstart.md`
- Original implementation: `backend/app/services/llm.py`
- Configuration: `backend/app/config.py`
