"""Небольшой слой SQLite. SQL и хранение JSON изолированы от HTTP-маршрутов."""
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import json
import sqlite3
from uuid import uuid4
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
                                 'oauth_states': [('user_id', 'TEXT'), ('session_hash', 'TEXT')],
                                 'jobs': [('task_type', "TEXT NOT NULL DEFAULT 'legacy'"),
                                          ('payload', 'TEXT'), ('retry_of', 'TEXT'), ('retry_job_id', 'TEXT')]}.items():
            columns={row['name'] for row in db.execute(f'PRAGMA table_info({table})')}
            for column, declaration in additions:
                if column not in columns: db.execute(f'ALTER TABLE {table} ADD COLUMN {column} {declaration}')
        db.execute("""UPDATE jobs SET state='failed',
          error=CASE WHEN payload IS NULL THEN 'Сервер перезапущен. Старое задание нельзя восстановить; создайте презентацию заново.'
                     ELSE COALESCE(error, 'Сервер перезапущен. Задание можно повторить.') END,
          updated_at=? WHERE state IN ('queued','running','retrying')""", (now(),))

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

def job_create(jid: str, user_id: str, task_type: str, payload: dict, retry_of=None):
    with connection() as db:
        db.execute('''INSERT INTO jobs
          (id,state,stage,project_id,error,updated_at,user_id,task_type,payload,retry_of)
          VALUES (?,'queued','queued',NULL,NULL,?,?,?,?,?)''',
          (jid, now(), user_id, task_type, json.dumps(payload, ensure_ascii=False), retry_of))


def job_set(jid: str, state: str, stage: str, project_id=None, error=None, user_id=None):
    with connection() as db:
        db.execute('''UPDATE jobs SET state=?,stage=?,project_id=COALESCE(?,project_id),
          error=?,updated_at=?,user_id=COALESCE(?,user_id) WHERE id=?''',
          (state, stage, project_id, error, now(), user_id, jid))
        if state=='failed':
            child=db.execute('SELECT retry_of FROM jobs WHERE id=?',(jid,)).fetchone()
            if child and child['retry_of']:
                db.execute('''UPDATE jobs SET state='failed',stage='failed',error=?,updated_at=?
                  WHERE id=? AND retry_job_id=? AND state='retrying' ''',
                  (error or 'Повтор задания завершился ошибкой.',now(),child['retry_of'],jid))

def job_get(jid: str):
    with connection() as db:
        row = db.execute('SELECT * FROM jobs WHERE id=?', (jid,)).fetchone()
        if not row: return None
        result=dict(row)
        if result.get('payload'):
            result['payload']=json.loads(result['payload'])
        return result


def job_retry_claim(jid: str, user_id: str):
    """Atomically claim a failed job and reuse one retry child for concurrent callers."""
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT * FROM jobs WHERE id=? AND user_id=?',(jid,user_id)).fetchone()
        if not row: return 'not_found',None
        source=dict(row)
        if source['state']=='retrying' and source.get('retry_job_id'):
            child=db.execute('SELECT id FROM jobs WHERE id=? AND user_id=?',(source['retry_job_id'],user_id)).fetchone()
            if child:return 'existing',child['id']
        if source['state']=='complete' and source.get('retry_job_id'):
            child=db.execute('SELECT id FROM jobs WHERE id=? AND user_id=? AND state IN (\'queued\',\'running\',\'complete\')',
                             (source['retry_job_id'],user_id)).fetchone()
            if child:return 'existing',child['id']
        if source['state']=='complete': return 'complete',None
        if source['state'] in {'queued','running'}: return 'in_progress',None
        if source['state']!='failed' or not source.get('payload'): return 'unavailable',None
        child=None
        if source.get('retry_job_id'):
            child=db.execute('SELECT * FROM jobs WHERE id=? AND user_id=?',(source['retry_job_id'],user_id)).fetchone()
        if child and child['state'] in {'queued','running','complete'}:
            return 'existing',child['id']
        if child and child['state']=='failed':
            retry_id=child['id']
            payload=json.loads(child['payload'])
            db.execute("UPDATE jobs SET state='queued',stage='queued',error=NULL,updated_at=? WHERE id=?",
                       (now(),retry_id))
            return 'claimed',retry_id
        retry_id=str(uuid4())
        payload=json.loads(source['payload'])
        payload.setdefault('result_project_id',str(uuid4()))
        db.execute('''INSERT INTO jobs
          (id,state,stage,project_id,error,updated_at,user_id,task_type,payload,retry_of)
          VALUES (?,'queued','queued',NULL,NULL,?,?,?,?,?)''',
          (retry_id,now(),user_id,source['task_type'],json.dumps(payload,ensure_ascii=False),jid))
        db.execute('UPDATE jobs SET retry_job_id=?,updated_at=? WHERE id=?',(retry_id,now(),jid))
        return 'claimed',retry_id


def job_complete_with_project(jid: str, pid: str, template_id: str, content: dict,
                              source_text: str, user_id: str):
    """Atomically persist the single result and mark its job complete."""
    timestamp=now()
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        job=db.execute('SELECT state,retry_of FROM jobs WHERE id=? AND user_id=?',(jid,user_id)).fetchone()
        if not job: raise ValueError('Задание не найдено при сохранении результата.')
        if job['state']=='complete':
            return db.execute('SELECT project_id FROM jobs WHERE id=?',(jid,)).fetchone()['project_id']
        if job['state']!='running':
            raise ValueError('Нельзя сохранить результат задания, которое не выполняется.')
        reserved=db.execute('SELECT user_id FROM projects WHERE id=?',(pid,)).fetchone()
        if reserved and reserved['user_id']!=user_id:
            raise ValueError('ID результата уже принадлежит другому пользователю.')
        db.execute('''INSERT OR IGNORE INTO projects
          (id,title,template_id,content,source_text,variant,revisions,created_at,updated_at,user_id)
          VALUES (?,?,?,?,?,'a','[]',?,?,?)''',
          (pid,content['title'],template_id,json.dumps(content,ensure_ascii=False),source_text,timestamp,timestamp,user_id))
        project=db.execute('SELECT user_id,template_id,content,source_text FROM projects WHERE id=?',(pid,)).fetchone()
        if (not project or project['user_id']!=user_id or project['template_id']!=template_id
                or project['content']!=json.dumps(content,ensure_ascii=False) or project['source_text']!=source_text):
            raise ValueError('ID результата уже занят другой презентацией.')
        db.execute('UPDATE jobs SET state=\'complete\',stage=\'complete\',project_id=?,error=NULL,updated_at=? WHERE id=?',
                   (pid,timestamp,jid))
        if job['retry_of']:
            db.execute('''UPDATE jobs SET state='complete',stage='complete',project_id=?,error=NULL,updated_at=?
              WHERE id=? AND retry_job_id=?''',(pid,timestamp,job['retry_of'],jid))
        return pid


def job_start(jid: str, user_id: str) -> bool:
    """Acquire a single worker lease for a queued job using an atomic transition."""
    with connection() as db:
        cursor=db.execute("UPDATE jobs SET state='running',stage='starting',error=NULL,updated_at=? WHERE id=? AND user_id=? AND state='queued'",
                          (now(),jid,user_id))
        return cursor.rowcount==1
