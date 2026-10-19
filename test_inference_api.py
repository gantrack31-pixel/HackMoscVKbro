#!/usr/bin/env python3
"""Test Inference API connectivity directly."""
import os
import json
import urllib.request
import urllib.error

API_KEY = os.getenv('LLM_API_KEY', '')
PROJECT_ID = os.getenv('LLM_PROJECT_ID', '')
BASE_URL = os.getenv('LLM_BASE_URL', 'https://ai-demo.platformpreview.ru/api/inference-providers-router/00000000-0000-0000-0000-000000000001/v1')
MODEL = os.getenv('LLM_MODEL', 'qwen38-27b-fp8')

if not API_KEY or not PROJECT_ID:
    print("Error: LLM_API_KEY and LLM_PROJECT_ID must be set")
    exit(1)

print(f"API_KEY: {API_KEY[:20]}...")
print(f"PROJECT_ID: {PROJECT_ID}")
print(f"BASE_URL: {BASE_URL}")
print(f"MODEL: {MODEL}")
print()

headers = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {API_KEY}',
    'Project-ID': PROJECT_ID,
}

payload = {
    'model': MODEL,
    'messages': [
        {'role': 'user', 'content': 'What is the capital of Russia?'}
    ],
}

print("Sending request...")
print(json.dumps(payload, indent=2))
print()

try:
    url = f'{BASE_URL}/chat/completions'
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers=headers,
        method='POST'
    )

    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read().decode('utf-8'))
        print(f"Status: {response.status}")
        print(f"Response:\n{json.dumps(result, indent=2, ensure_ascii=False)}")

except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}:")
    error_body = e.read().decode('utf-8')
    try:
        error_json = json.loads(error_body)
        print(json.dumps(error_json, indent=2, ensure_ascii=False))
    except:
        print(error_body)
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
