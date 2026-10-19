"""Reviewed AI edits: owner-bound, expiring, atomic proposals and application."""
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from uuid import uuid4
from fastapi import HTTPException
from .. import database as db
from .operations import OperationCancelled


def fingerprint(value):
    return sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def conflict(code, message):
    raise HTTPException(409, {'code': code, 'message': message})


def changes_between(before, after):
    changes = []
    for index, (old, new) in enumerate(zip(before['slides'], after['slides'])):
        for field in new:
            if old.get(field) != new[field]:
                changes.append({'slide': index, 'field': field,
                                'before': old.get(field), 'after': new[field]})
    if before.get('evidence_sources', []) != after.get('evidence_sources', []):
        changes.append({'slide': -1, 'field': 'evidence_sources', 'before': before.get('evidence_sources', []), 'after': after.get('evidence_sources', [])})
    return changes


def create_proposal(pid, user_id, request, content, source, report, operation_id):
    draft = request.content.model_dump()
    proposed = content.model_dump()
    created = datetime.now(timezone.utc)
    result = {'id': str(uuid4()), 'project_id': pid, 'state': 'pending',
              'content': proposed, 'changes': changes_between(draft, proposed),
              'base_updated_at': request.base_updated_at,
              'draft_fingerprint': fingerprint(draft), 'source_fingerprint': fingerprint(source),
              'slide': request.slide, 'variant': request.variant,
              'expires_at': (created + timedelta(minutes=30)).isoformat()}
    payload = {'draft': draft, 'content': proposed, 'variant': request.variant,
               'slide': request.slide, 'report': report}
    with db.connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        job = conn.execute('SELECT state FROM jobs WHERE id=? AND user_id=?', (operation_id, user_id)).fetchone()
        if not job or job['state'] != 'running':
            raise OperationCancelled()
        row = conn.execute('SELECT * FROM projects WHERE id=? AND user_id=?', (pid, user_id)).fetchone()
        db.require_project_version(row, request.base_updated_at, user_id)
        if fingerprint(row['source_text']) != result['source_fingerprint']:
            conflict('SOURCE_CHANGED', 'Исходный материал изменился. Запросите новое предложение.')
        conn.execute('DELETE FROM assistant_proposals WHERE expires_at<=?', (created.isoformat(),))
        # Bound retained private content for repeated retries within one project.
        conn.execute('DELETE FROM assistant_proposals WHERE id IN (SELECT id FROM assistant_proposals '
                     'WHERE user_id=? AND project_id=? ORDER BY created_at DESC LIMIT -1 OFFSET 19)', (user_id, pid))
        conn.execute('INSERT INTO assistant_proposals '
                     '(id,project_id,user_id,base_updated_at,draft_fingerprint,source_fingerprint,payload,created_at,expires_at) '
                     'VALUES (?,?,?,?,?,?,?,?,?)',
                     (result['id'], pid, user_id, result['base_updated_at'], result['draft_fingerprint'],
                      result['source_fingerprint'], json.dumps(payload, ensure_ascii=False),
                      created.isoformat(), result['expires_at']))
        # Stop and publication use the same DB transaction: only one can win.
        conn.execute("UPDATE jobs SET state='complete',stage='complete',updated_at=? WHERE id=?", (db.now(), operation_id))
    return result


def get_pending(conn, pid, user_id, proposal_id):
    proposal = conn.execute('SELECT * FROM assistant_proposals WHERE id=? AND project_id=? AND user_id=?',
                            (proposal_id, pid, user_id)).fetchone()
    if not proposal:
        raise HTTPException(404, 'Предложение не найдено.')
    if proposal['state'] == 'expired' or proposal['expires_at'] <= db.now():
        conflict('PROPOSAL_EXPIRED', 'Предложение устарело. Черновик не изменён; создайте новый запрос.')
    if proposal['state'] != 'pending':
        conflict('PROPOSAL_CLOSED', 'Предложение уже применено или отклонено. Создайте новый запрос.')
    return proposal


def scrub_expired():
    # Commit cleanup before a subsequent conflict can roll back its own transaction.
    with db.connection() as conn:
        conn.execute("UPDATE assistant_proposals SET state='expired',payload='{}' WHERE expires_at<=? AND state='pending'", (db.now(),))


def apply_proposal(pid, user_id, proposal_id, request):
    scrub_expired()
    with db.connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        proposal = get_pending(conn, pid, user_id, proposal_id)
        if not request.base_updated_at or request.base_updated_at != proposal['base_updated_at']:
            conflict('VERSION_CONFLICT', 'Версия презентации изменилась. Черновик не изменён; запросите новое предложение.')
        row = conn.execute('SELECT * FROM projects WHERE id=? AND user_id=?', (pid, user_id)).fetchone()
        db.require_project_version(row, request.base_updated_at, user_id)
        if fingerprint(row['source_text']) != proposal['source_fingerprint']:
            conflict('SOURCE_CHANGED', 'Исходный материал изменился. Запросите новое предложение.')
        payload = json.loads(proposal['payload'])
        if fingerprint(request.content.model_dump()) != proposal['draft_fingerprint'] or request.variant != payload['variant']:
            conflict('DRAFT_CHANGED', 'Вы изменили черновик после запроса. Правки AI не применены; отправьте новый запрос из текущего черновика.')
        existing = db.decode(row, ['content', 'revisions'])
        past = existing['revisions'] + [{'content': existing['content'], 'variant': existing['variant']}]
        if payload['draft'] != existing['content'] or payload['variant'] != existing['variant']:
            past.append({'content': payload['draft'], 'variant': payload['variant']})
        content = payload['content']
        from .analytics_store import validate_content_evidence
        validate_content_evidence(content,payload['draft'],user_id)
        conn.execute("UPDATE projects SET title=?,content=?,variant=?,revisions=?,future='[]',updated_at=? WHERE id=? AND user_id=?",
                     (content['title'], json.dumps(content, ensure_ascii=False), payload['variant'],
                      json.dumps(past[-12:], ensure_ascii=False), db.now(), pid, user_id))
        conn.execute("UPDATE assistant_proposals SET state='applied',payload='{}' WHERE id=?", (proposal_id,))
    return payload['report']


def reject_proposal(pid, user_id, proposal_id):
    scrub_expired()
    with db.connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        get_pending(conn, pid, user_id, proposal_id)
        conn.execute("UPDATE assistant_proposals SET state='rejected',payload='{}' WHERE id=?", (proposal_id,))
    return {'id': proposal_id, 'state': 'rejected'}
