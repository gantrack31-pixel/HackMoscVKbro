"""Owner-scoped cancellation for background jobs and direct AI requests."""
import asyncio
from contextvars import ContextVar
from functools import wraps
from time import monotonic
from uuid import uuid4
from fastapi import HTTPException
from .. import database as db

current_operation = ContextVar('current_operation', default=None)
operation_deadline = ContextVar('operation_deadline', default=None)

class OperationCancelled(Exception):
    pass

def check_deadline():
    deadline=operation_deadline.get()
    if deadline is not None and monotonic() >= deadline:
        raise TimeoutError('Full build deadline exceeded')

def checkpoint():
    """Also gate stage transitions between watcher ticks."""
    jid=current_operation.get()
    if jid:
        job=db.job_get(jid)
        if not job or job['state']=='cancelled': raise OperationCancelled()
    check_deadline()

async def run_operation(jid, factory, *, request=None, business_limit=None):
    """Cancel the actual coroutine/HTTP wait; DB gates prevent late publication.

    A DB watcher works across API workers. CPU work already in a thread cannot
    be preempted, but it has no permission to publish after cancellation.
    """
    token=current_operation.set(jid)
    deadline_token=operation_deadline.set(monotonic()+business_limit if business_limit is not None else None)
    work=asyncio.create_task(factory())
    async def watch():
        while True:
            job=db.job_get(jid)
            if not job or job['state']=='cancelled': return
            await asyncio.sleep(.1)
    watcher=asyncio.create_task(watch())
    try:
        # None disables the business deadline; HTTP idle/connect timeouts remain.
        async with asyncio.timeout(business_limit):
            done,_=await asyncio.wait((work,watcher),return_when=asyncio.FIRST_COMPLETED)
            if watcher in done: raise OperationCancelled()
            result=await work
            if request is not None and not db.job_finish_ai(jid): raise OperationCancelled()
            return result
    except OperationCancelled:
        if request is not None:
            raise HTTPException(409, {'code':'AI_CANCELLED','message':'Остановлено'}) from None
        return None
    except asyncio.CancelledError:
        job=db.job_get(jid)
        if job: db.job_cancel(jid, job['user_id'])
        raise
    except TimeoutError:
        db.job_set(jid,'failed','failed',error='Полная сборка превысила лимит 300 секунд (5 минут). Результат не опубликован.')
        if request is not None: raise
    except Exception:
        job=db.job_get(jid)
        if job and job['state']=='cancelled':
            if request is not None:
                raise HTTPException(409, {'code':'AI_CANCELLED','message':'Остановлено'}) from None
            return None
        db.job_set(jid,'failed','failed',error='AI-операция завершилась ошибкой.')
        raise
    finally:
        work.cancel();watcher.cancel()
        await asyncio.gather(work,watcher,return_exceptions=True)
        current_operation.reset(token)
        operation_deadline.reset(deadline_token)

def standalone_ai(function):
    @wraps(function)
    async def wrapped(*args, **kwargs):
        request=kwargs['http_request']; user=kwargs['user']
        jid=request.headers.get('X-AI-Operation-ID')
        if jid:
            job=db.job_get(jid)
            if not job or job['user_id']!=user['id'] or job['task_type']!='ai':
                raise HTTPException(404,'AI-операция не найдена')
            if job['state']=='cancelled':
                raise HTTPException(409,{'code':'AI_CANCELLED','message':'Остановлено'})
        else:
            jid=str(uuid4());db.job_create(jid,user['id'],'ai',{})
        if not db.job_start(jid,user['id']): raise HTTPException(409,'Операция уже запущена')
        return await run_operation(jid,lambda:function(*args,**kwargs),request=request)
    return wrapped
