FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app/frontend

RUN corepack enable && corepack prepare pnpm@11.12.0 --activate

COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build


FROM python:3.12-slim AS app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-impress poppler-utils fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN python -m pip install --no-cache-dir --disable-pip-version-check \
    -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend-build /app/frontend/dist/ /app/frontend/dist/
COPY backend/data/templates/tech.pptx \
    backend/data/templates/workspace.pptx \
    backend/data/templates/education.pptx \
    /app/backend/seed-templates/

RUN addgroup --system deckly \
    && adduser --system --ingroup deckly --home /nonexistent deckly \
    && mkdir -p /app/backend/data \
    && chown -R deckly:deckly /app/backend/data \
    && chmod +x /app/backend/docker-entrypoint.sh

WORKDIR /app/backend

USER deckly

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/api/health', timeout=3)" || exit 1

ENTRYPOINT ["/app/backend/docker-entrypoint.sh"]
