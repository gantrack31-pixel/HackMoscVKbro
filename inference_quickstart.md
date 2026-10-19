# Инструкция по обращению к Inference API

Inference API предоставляет OpenAI-совместимый интерфейс для обращения к LLM.

### 1. Подключение

Endpoint:

```
POST https://ai-demo.platformpreview.ru/api/inference-providers-router/00000000-0000-0000-0000-000000000001/v1/chat/completions
```

Авторизация:

- `Authorization: Bearer <API_KEY>` — API-ключ.
- `Project-ID` — идентификатор проекта.
- `Content-Type: application/json`.

Доступная модель: `qwen38-27b-fp8`

### 2. Python (OpenAI SDK)

Установка зависимости:

```
pip install openai
```

Пример запроса:

```
import osfrom openai import OpenAIclient = OpenAI(    base_url="https://ai-demo.platformpreview.ru/api/inference-providers-router/00000000-0000-0000-0000-000000000001/v1",    api_key=os.environ["API_KEY"],    default_headers={        "Project-ID": "PRJ-UUID",    },)completion = client.chat.completions.create(    model="qwen38-27b-fp8",    messages=[        {"role": "user", "content": "What is the capital of Russia?"}    ],)print(completion.choices[0].message.content)
```

### 3. cURL

```
curl -X POST \
  "https://ai-demo.platformpreview.ru/api/inference-providers-router/00000000-0000-0000-0000-000000000001/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Project-ID: PRJ-UUID" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen38-27b-fp8",
    "messages": [
      {
        "role": "user",
        "content": "What is the capital of Russia?"
      }
    ]
  }'
```

### 4. Важные замечания

- API совместим с OpenAI Chat Completions.
- В `base_url` для Python SDK необходимо указывать путь до `/v1`, без `/chat/completions`. SDK самостоятельно добавляет нужный маршрут.
- API-ключ следует хранить в переменной окружения `API_KEY`.
- Для потоковой генерации можно передать `stream=True` в Python SDK или `"stream": true` в JSON-запросе.
