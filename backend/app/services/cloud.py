"""Облачные копии в PostgreSQL. Локальный SQLite не выдаётся за облако.

Презентация, библиотека тем и оригиналы PPTX фиксируются одной транзакцией.
Каждый запрос ограничен owner_id из серверной сессии, а не из тела запроса.
"""
from contextlib import contextmanager
from hashlib import sha256
from pathlib import Path
import json
from threading import Lock
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from ..config import settings


class CloudError(Exception):
    pass


_initialized = set()
_schema_lock = Lock()


@contextmanager
def connection():
    if not settings.cloud_database_url:
        raise CloudError('Облачное хранилище ещё не подключено. Добавьте адрес PostgreSQL в настройки сервера.')
    try:
        # URL с паролем никогда не включается в ошибки или ответы API.
        with psycopg.connect(settings.cloud_database_url, connect_timeout=8,
                            options='-c statement_timeout=30000', row_factory=dict_row) as conn:
            with _schema_lock:
                key = sha256(settings.cloud_database_url.encode()).hexdigest()
                if key not in _initialized:
                    conn.execute(Path(__file__).with_name('cloud_schema.sql').read_text(encoding='utf-8'))
                    conn.commit()
                    _initialized.add(key)
            yield conn
    except psycopg.Error as exc:
        raise CloudError('Облако недоступно. Проверьте подключение и повторите сохранение. Копия на сервере сохранена.') from None


def digest(value):
    return sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def save_project(project, templates, user_id):
    if not settings.cloud_database_url:
        raise CloudError('Облачное хранилище ещё не подключено. Добавьте адрес PostgreSQL в настройки сервера.')
    prepared = []
    for template in templates:
        try:
            binary = Path(template['path']).read_bytes() if template.get('path') else None
        except OSError:
            raise CloudError('Исходный PPTX недоступен. Загрузите шаблон заново перед сохранением.') from None
        if binary and len(binary) > settings.max_upload_mb * 1024 ** 2:
            raise CloudError('Исходный шаблон превышает допустимый размер.')
        fingerprint = digest([template['id'], template['name'], template['metadata'], sha256(binary or b'').hexdigest()])
        prepared.append((template, binary, fingerprint))
    chosen = next((fp for t, _, fp in prepared if t['id'] == project['template_id']), None)
    if not chosen:
        raise CloudError('Шаблон презентации не найден в библиотеке.')
    payload = {key: project[key] for key in ['title', 'content', 'variant', 'source_text']}
    fingerprint = digest([payload, chosen])
    with connection() as conn:
        for template, binary, fp in prepared:
            conn.execute('''INSERT INTO deckly_private.templates
                (owner_id,fingerprint,original_id,name,metadata,pptx) VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT (owner_id,fingerprint) DO NOTHING''',
                (user_id, fp, template['id'], template['name'], Jsonb(template['metadata']), binary))
        conn.execute('''INSERT INTO deckly_private.presentations
            (owner_id,project_id,title,payload,template_fingerprint,fingerprint,source_updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (owner_id,project_id) DO UPDATE SET
              title=EXCLUDED.title, payload=EXCLUDED.payload,
              template_fingerprint=EXCLUDED.template_fingerprint, fingerprint=EXCLUDED.fingerprint,
              source_updated_at=EXCLUDED.source_updated_at,
              revision=deckly_private.presentations.revision+1, saved_at=now()
            WHERE deckly_private.presentations.fingerprint <> EXCLUDED.fingerprint
              AND deckly_private.presentations.source_updated_at <= EXCLUDED.source_updated_at''',
            (user_id, project['id'], project['title'], Jsonb(payload), chosen, fingerprint, project['updated_at']))
        receipt = conn.execute('''SELECT project_id,title,revision,saved_at,source_updated_at,fingerprint
            FROM deckly_private.presentations WHERE owner_id=%s AND project_id=%s''',
            (user_id, project['id'])).fetchone()
        if receipt.pop('fingerprint') != fingerprint:
            raise CloudError('В облаке уже есть более свежая копия. Восстановите её перед следующим сохранением.')
        receipt['templates_saved'] = len(prepared)
    # Выход из context manager подтверждает COMMIT; при его ошибке успех не возвращается.
    return receipt


def status(user_id):
    if not settings.cloud_database_url:
        return {'configured': False, 'ready': False, 'templates': 0, 'projects': 0}
    with connection() as conn:
        counts = conn.execute('''SELECT
            (SELECT count(*) FROM deckly_private.templates WHERE owner_id=%s) AS templates,
            (SELECT count(*) FROM deckly_private.presentations WHERE owner_id=%s) AS projects''',
            (user_id, user_id)).fetchone()
    return {'configured': True, 'ready': True, **counts}


def list_projects(user_id):
    with connection() as conn:
        return conn.execute('''SELECT project_id,title,revision,saved_at,source_updated_at
            FROM deckly_private.presentations WHERE owner_id=%s ORDER BY saved_at DESC LIMIT 100''', (user_id,)).fetchall()


def load_project(project_id, user_id):
    with connection() as conn:
        return conn.execute('''SELECT p.payload,t.name,t.metadata,t.pptx
            FROM deckly_private.presentations p JOIN deckly_private.templates t
              ON t.owner_id=p.owner_id AND t.fingerprint=p.template_fingerprint
            WHERE p.owner_id=%s AND p.project_id=%s''', (user_id, project_id)).fetchone()
