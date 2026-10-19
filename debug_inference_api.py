#!/usr/bin/env python3
"""Detailed debugging of Inference API requests."""
import os
import json
import urllib.request
import urllib.error

API_KEY = os.getenv('LLM_API_KEY', '')
PROJECT_ID = os.getenv('LLM_PROJECT_ID', '')
BASE_URL = os.getenv('LLM_BASE_URL', 'https://ai-demo.platformpreview.ru/api/inference-providers-router/00000000-0000-0000-0000-000000000001/v1')
MODEL = os.getenv('LLM_MODEL', 'qwen38-27b-fp8')

if not API_KEY or not PROJECT_ID:
    print("❌ Error: LLM_API_KEY and LLM_PROJECT_ID must be set")
    print(f"   LLM_API_KEY is {'SET' if API_KEY else 'NOT SET'}")
    print(f"   LLM_PROJECT_ID is {'SET' if PROJECT_ID else 'NOT SET'}")
    exit(1)

print("=" * 80)
print("INFERENCE API DIAGNOSTIC")
print("=" * 80)
print()

print("📋 CREDENTIALS")
print(f"  API_KEY:    {API_KEY[:30]}...{API_KEY[-10:]}")
print(f"  PROJECT_ID: {PROJECT_ID}")
print(f"  BASE_URL:   {BASE_URL}")
print(f"  MODEL:      {MODEL}")
print()

headers = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {API_KEY}',
    'Project-ID': PROJECT_ID,
}

print("📤 REQUEST HEADERS")
for key, value in headers.items():
    if key == 'Authorization':
        print(f"  {key}: Bearer {value[7:37]}...{value[-10:]}")
    else:
        print(f"  {key}: {value}")
print()

# Test 1: Minimal request
print("=" * 80)
print("TEST 1: MINIMAL REQUEST (no temperature/max_tokens)")
print("=" * 80)

payload1 = {
    'model': MODEL,
    'messages': [
        {'role': 'user', 'content': 'Hello'}
    ],
}

print("📨 REQUEST BODY:")
print(json.dumps(payload1, indent=2, ensure_ascii=False))
print(f"    Size: {len(json.dumps(payload1))} bytes")
print()

try:
    url = f'{BASE_URL}/chat/completions'
    req = urllib.request.Request(
        url,
        data=json.dumps(payload1).encode('utf-8'),
        headers=headers,
        method='POST'
    )

    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read().decode('utf-8'))
        print(f"✅ Status: {response.status}")
        print("📝 RESPONSE (first 500 chars):")
        response_str = json.dumps(result, indent=2, ensure_ascii=False)
        print(response_str[:500])
        if len(response_str) > 500:
            print(f"    ... ({len(response_str)} chars total)")

except urllib.error.HTTPError as e:
    print(f"❌ HTTP Error {e.code}:")
    error_body = e.read().decode('utf-8')
    print(error_body)

except Exception as e:
    print(f"❌ Error: {type(e).__name__}: {e}")

print()

# Test 2: With temperature and max_tokens
print("=" * 80)
print("TEST 2: WITH PARAMETERS (temperature + max_tokens)")
print("=" * 80)

payload2 = {
    'model': MODEL,
    'messages': [
        {'role': 'user', 'content': 'Hello'}
    ],
    'temperature': 0.3,
    'max_tokens': 256,
}

print("📨 REQUEST BODY:")
print(json.dumps(payload2, indent=2, ensure_ascii=False))
print()

try:
    req = urllib.request.Request(
        f'{BASE_URL}/chat/completions',
        data=json.dumps(payload2).encode('utf-8'),
        headers=headers,
        method='POST'
    )

    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read().decode('utf-8'))
        print(f"✅ Status: {response.status}")
        print("📝 RESPONSE (first 500 chars):")
        response_str = json.dumps(result, indent=2, ensure_ascii=False)
        print(response_str[:500])

except urllib.error.HTTPError as e:
    print(f"❌ HTTP Error {e.code}:")
    error_body = e.read().decode('utf-8')
    print(error_body)

except Exception as e:
    print(f"❌ Error: {type(e).__name__}: {e}")

print()

# Test 3: With system message (like real requests)
print("=" * 80)
print("TEST 3: WITH SYSTEM MESSAGE (like Deckly uses)")
print("=" * 80)

system_prompt = "You are a helpful assistant. Format responses in JSON."
user_content = json.dumps({"instruction": "Create a presentation outline", "topic": "Python"})

payload3 = {
    'model': MODEL,
    'messages': [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': user_content}
    ],
    'temperature': 0.3,
    'max_tokens': 1000,
}

print("📨 REQUEST BODY:")
print(json.dumps(payload3, indent=2, ensure_ascii=False)[:800])
print(f"    ... (full size: {len(json.dumps(payload3))} bytes)")
print()

try:
    req = urllib.request.Request(
        f'{BASE_URL}/chat/completions',
        data=json.dumps(payload3).encode('utf-8'),
        headers=headers,
        method='POST'
    )

    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read().decode('utf-8'))
        print(f"✅ Status: {response.status}")
        print("📝 RESPONSE (first 500 chars):")
        response_str = json.dumps(result, indent=2, ensure_ascii=False)
        print(response_str[:500])

except urllib.error.HTTPError as e:
    print(f"❌ HTTP Error {e.code}:")
    error_body = e.read().decode('utf-8')
    try:
        error_json = json.loads(error_body)
        print(json.dumps(error_json, indent=2, ensure_ascii=False))
    except:
        print(error_body[:500])

except Exception as e:
    print(f"❌ Error: {type(e).__name__}: {e}")

print()
print("=" * 80)
print("SUMMARY")
print("=" * 80)
print()
print("If all tests fail with HTTP 500:")
print("  1. Check API_KEY and PROJECT_ID are correct")
print("  2. Contact API provider support")
print("  3. Ask about supported parameters (temperature, max_tokens, etc.)")
print("  4. Ask about request size limits")
print()
print("If some tests pass but others fail:")
print("  1. Note which parameters cause the error")
print("  2. Deckly might need to adjust request formatting")
print("  3. May need to use different parameters")
print()
