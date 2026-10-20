# Деплой Deckly на VPS

Схема: `Интернет → Caddy (HTTPS, сжатие) → deckly (uvicorn, 2 воркера) → SQLite в Docker volume`.
Всё поднимается одной командой из `compose.prod.yaml`.

## 1. Сервер

- Ubuntu 24.04, **от 2 vCPU / 4 GB RAM**, NVMe 30+ GB. Для демо перед жюри лучше 4 vCPU / 8 GB:
  экспорт в PDF идёт через LibreOffice, ему нужны память и CPU.
- Регион — Москва: ближе к LLM-провайдеру (`platformpreview.ru`) и Яндекс ID.
- Подойдут VK Cloud, Yandex Cloud, Selectel, Timeweb Cloud — обычная ВМ с публичным IPv4.

## 2. Домен

Создайте A-запись `deckly.example.ru → <IP сервера>`. Сертификат Caddy выпустит сам,
но только когда DNS уже указывает на сервер и открыты порты 80/443.

## 3. Подготовка сервера

```bash
ssh root@<IP>
apt update && apt -y upgrade
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
```

В облаках с группами безопасности (VK Cloud, Yandex Cloud) откройте 22, 80, 443 и там.

## 4. Код и настройки

```bash
git clone <URL репозитория> /opt/deckly && cd /opt/deckly
cp .env.production.example .env.production
nano .env.production            # домен, LLM_API_KEY, LLM_PROJECT_ID, SMTP
echo "DOMAIN=deckly.example.ru" > .env
```

Что production проверяет при старте (`backend/app/config.py`) — иначе контейнер не поднимется:

- `PUBLIC_BASE_URL` — `https://домен` без пути и слеша; тот же origin есть в `CORS_ORIGINS`.
- `COOKIE_SECURE=true`.
- `LLM_MODE=live` и непустой `LLM_API_KEY`.
- Если `EMAIL_VERIFICATION_REQUIRED=true` — заполнены все `SMTP_*` и `EMAIL_FROM`.
  Для быстрого демо без почты: `EMAIL_VERIFICATION_REQUIRED=false`.
  Многие облака блокируют исходящий порт 25 — используйте 465 или 587.
- Если включён Яндекс ID — `YANDEX_REDIRECT_URI=https://домен/api/auth/yandex/callback`,
  и этот же адрес указан в настройках приложения на oauth.yandex.ru.

## 5. Запуск

```bash
docker compose -f compose.prod.yaml up -d --build
docker compose -f compose.prod.yaml ps          # deckly должен быть healthy
curl https://deckly.example.ru/api/health
```

Если `deckly` перезапускается — смотрите `docker compose -f compose.prod.yaml logs deckly`:
там будет текст ошибки валидации настроек.

## 6. Обновление

```bash
cd /opt/deckly && git pull
docker compose -f compose.prod.yaml up -d --build
```

Данные в volume `deckly-data` при пересборке сохраняются. Простой — несколько секунд.

## 7. Бэкап

```bash
docker compose -f compose.prod.yaml exec deckly python -c \
  "import sqlite3; s=sqlite3.connect('data/deckly.sqlite3'); d=sqlite3.connect('data/backup.sqlite3'); s.backup(d)"
docker compose -f compose.prod.yaml cp deckly:/app/backend/data ./backup-$(date +%F)
```

Копируется весь каталог `data` — там же лежат загруженные файлы и шаблоны.

## Производительность

- **Воркеры.** `WEB_CONCURRENCY` (по умолчанию 2) задаётся в `.env`. Каждый воркер одновременно
  ведёт до 2 генераций, остальные ждут в очереди. На 4 vCPU / 8 GB можно поставить 3–4.
  SQLite в режиме WAL с этим справляется на одном сервере.
- **Узкое место — LLM-провайдер**, а не сервер: генерация ждёт ответа модели. Перед защитой
  проверьте его квоты и лимит запросов.
- **Прогрев.** После деплоя один раз сгенерируйте и экспортируйте презентацию: первый запуск
  LibreOffice медленный.
- **Таймауты.** Caddy ждёт ответа до 10 минут, так что долгие генерации не обрываются на прокси.

## Мониторинг

- Логи: `docker compose -f compose.prod.yaml logs -f --tail=100` (ротация уже настроена).
- Внешняя проверка: UptimeRobot или аналог на `https://домен/api/health` раз в минуту.
- Ресурсы: `docker stats`.

## Почему это безопасно

- Порт 8000 наружу не публикуется: к приложению ходит только Caddy по внутренней сети.
  Поэтому приложение может доверять `X-Forwarded-For` (`FORWARDED_ALLOW_IPS=*`), и лимиты
  на вход и поддержку считаются по реальному IP клиента, а не по IP прокси.
- `.env`, `.env.production` не попадают ни в git, ни в Docker-образ.
