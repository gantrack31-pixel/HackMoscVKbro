"""Небольшой слой SQLite. SQL и хранение JSON изолированы от HTTP-маршрутов."""
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import json
import sqlite3
from .config import settings

def now() -> str:
    return datetime.now(timezone.utc).isoformat()

@contextmanager
def connection():
    settings.database.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(settings.database, timeout=15)
    db.row_factory = sqlite3.Row
    try:
        db.execute('PRAGMA journal_mode=WAL')
        yield db
        db.commit()
    finally:
        db.close()

def initialize():
    with connection() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT,
            metadata TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, template_id TEXT NOT NULL,
            content TEXT NOT NULL, source_text TEXT NOT NULL,
            variant TEXT NOT NULL DEFAULT 'a', revisions TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, state TEXT NOT NULL, stage TEXT NOT NULL,
            project_id TEXT, error TEXT, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, first_name TEXT NOT NULL,
            last_name TEXT NOT NULL, password_hash TEXT, yandex_id TEXT UNIQUE,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, csrf TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS oauth_states (
            state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL,
            verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_attempts (ip_hash TEXT NOT NULL, time INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS auth_attempts_lookup ON auth_attempts(ip_hash,time);
        CREATE TABLE IF NOT EXISTS favorites (user_id TEXT NOT NULL,template_id TEXT NOT NULL,PRIMARY KEY(user_id,template_id));
        ''')
        for table in ['templates','projects','jobs']:
            columns={row['name'] for row in db.execute(f'PRAGMA table_info({table})')}
            if 'user_id' not in columns: db.execute(f'ALTER TABLE {table} ADD COLUMN user_id TEXT')
        for table, additions in {'users': [('avatar_color', "TEXT NOT NULL DEFAULT '#0077FF'")],
                                 'oauth_states': [('user_id', 'TEXT'), ('session_hash', 'TEXT')]}.items():
            columns={row['name'] for row in db.execute(f'PRAGMA table_info({table})')}
            for column, declaration in additions:
                if column not in columns: db.execute(f'ALTER TABLE {table} ADD COLUMN {column} {declaration}')
        db.execute("UPDATE jobs SET state='failed', error='Сервер перезапущен. Повторите создание.' WHERE state IN ('queued','running')")

def template_save(tid: str, name: str, path: str | None, metadata: dict, user_id=None):
    with connection() as db:
        db.execute('INSERT OR REPLACE INTO templates (id,name,path,metadata,created_at,user_id) VALUES (?,?,?,?,?,?)', (tid, name, path, json.dumps(metadata, ensure_ascii=False), now(),user_id))

def templates_list() -> list[dict]:
    with connection() as db:
        return [decode(row, ['metadata']) for row in db.execute('SELECT * FROM templates ORDER BY created_at')]

def template_get(tid: str) -> dict | None:
    with connection() as db:
        row = db.execute('SELECT * FROM templates WHERE id=?', (tid,)).fetchone()
        return decode(row, ['metadata']) if row else None

def decode(row, fields):
    result = dict(row)
    for field in fields: result[field] = json.loads(result[field])
    return result

def project_create(pid: str, template_id: str, content: dict, source_text: str, user_id=None):
    with connection() as db:
        db.execute('INSERT INTO projects (id,title,template_id,content,source_text,variant,revisions,created_at,updated_at,user_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
                   (pid, content['title'], template_id, json.dumps(content, ensure_ascii=False), source_text, 'a', '[]', now(), now(),user_id))

def project_get(pid: str):
    with connection() as db:
        row = db.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone()
        return decode(row, ['content','revisions']) if row else None

def projects_list(user_id):
    with connection() as db:
        return [decode(row, ['content']) for row in db.execute('SELECT id,title,template_id,content,variant,updated_at FROM projects WHERE user_id=? ORDER BY updated_at DESC',(user_id,))]

def project_update(pid: str, content: dict, variant: str):
    existing = project_get(pid)
    revisions = (existing['revisions'] + [{'content': existing['content'], 'variant': existing['variant']}])[-12:]
    with connection() as db:
        db.execute('UPDATE projects SET title=?, content=?, variant=?, revisions=?, updated_at=? WHERE id=?',
                   (content['title'], json.dumps(content, ensure_ascii=False), variant, json.dumps(revisions, ensure_ascii=False), now(), pid))

def project_undo(pid: str):
    project = project_get(pid)
    if not project or not project['revisions']: return False
    last = project['revisions'].pop()
    with connection() as db:
        db.execute('UPDATE projects SET title=?,content=?,variant=?,revisions=?,updated_at=? WHERE id=?',
                   (last['content']['title'], json.dumps(last['content'], ensure_ascii=False), last['variant'], json.dumps(project['revisions'], ensure_ascii=False), now(), pid))
    return True

def project_delete(pid: str):
    with connection() as db: db.execute('DELETE FROM projects WHERE id=?', (pid,))

def job_set(jid: str, state: str, stage: str, project_id=None, error=None, user_id=None):
    with connection() as db:
        db.execute('''INSERT INTO jobs (id,state,stage,project_id,error,updated_at,user_id) VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET state=excluded.state,stage=excluded.stage,project_id=excluded.project_id,error=excluded.error,updated_at=excluded.updated_at''', (jid, state, stage, project_id, error, now(),user_id))

def job_get(jid: str):
    with connection() as db:
        row = db.execute('SELECT * FROM jobs WHERE id=?', (jid,)).fetchone()
        return dict(row) if row else None
