"""HTTP-маршруты. Запуск: python -m uvicorn app.main:app --host 127.0.0.1 --port 8000."""
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4
from urllib.parse import quote
import logging
from fastapi import FastAPI, UploadFile, HTTPException, BackgroundTasks, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from .config import settings, BASE, validate_settings
from . import database as db
from .models import OutlineRequest, GenerateRequest, RegenerateRequest, ProjectUpdate, FixRequest, DeckContent, Issue
from .services.templates import seed_templates, analyze_template, BUILTIN_IDS
from .services.pptx_security import validate_pptx_archive
from .services.llm import make_outline, review_content, redesign_layout, configured, LLMError
from .services.layout import build_scene
from .services.audit import audit_deck, source_status
from .services.export import export_pptx, export_pdf, export_html
from .services import cloud
from .auth import router as auth_router, current_user

logger=logging.getLogger('deckly')
generation_slots=asyncio.Semaphore(2)

@asynccontextmanager
async def lifespan(app):
    validate_settings()
    settings.storage.mkdir(parents=True,exist_ok=True)
    db.initialize();seed_templates(settings.storage)
    yield

app=FastAPI(title='Deckly.Ai API',version='0.3.0',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=settings.origins,allow_credentials=True,
                   allow_methods=['GET','POST','PUT','DELETE'],allow_headers=['Content-Type','X-CSRF-Token'])
app.include_router(auth_router)

@app.middleware('http')
async def browser_security(request:Request,call_next):
    if request.method not in {'GET','HEAD','OPTIONS'}:
        origin=request.headers.get('origin')
        if (origin and origin not in [settings.public_url,*settings.origins]) or request.headers.get('sec-fetch-site')=='cross-site':
            return JSONResponse({'detail':'Запрос с постороннего сайта отклонён'},status_code=403)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='no-referrer'
    response.headers['X-Frame-Options']='DENY'
    if request.url.path.startswith('/api/'):response.headers['Cache-Control']='no-store'
    return response


def visible_template(template,user_id):
    return template.get('user_id')==user_id or (template['id'] in BUILTIN_IDS and not template.get('user_id'))

def get_template(tid,user_id=None):
    result=db.template_get(tid)
    if not result or (user_id and not visible_template(result,user_id)): raise HTTPException(404,'Шаблон не найден')
    return result

def get_project(pid,user_id=None):
    result=db.project_get(pid)
    if not result or (user_id and result.get('user_id')!=user_id): raise HTTPException(404,'Презентация не найдена')
    return result

def public_template(template):
    return {key:value for key,value in template.items() if key not in {'path','user_id'}}

def project_response(project):
    content=DeckContent.model_validate(project['content']);template=get_template(project['template_id'])
    return {**{k:v for k,v in project.items() if k not in {'revisions','user_id'}},'can_undo':bool(project.get('revisions')),
            'template':public_template(template),
            'variants':{variant:[build_scene(slide,template['metadata'],variant,i) for i,slide in enumerate(content.slides)] for variant in ['a','b','c']},
            'sources':[{'slide':i,'status':source_status(slide.source_quote,project['source_text'])} for i,slide in enumerate(content.slides)]}

@app.get('/api/health')
def health():
    return {'ok':True,'mode':settings.mode,'model':settings.model,'llm_configured':configured(),
            'database':'SQLite','max_upload_mb':settings.max_upload_mb,'context_audit':settings.context_audit,
            'yandex_enabled':bool(settings.yandex_id),
            'export_note':'PPTX сохраняет ресурсы мастера. PDF и HTML используют схему размещения и Manrope.'}

@app.get('/api/public/templates')
def public_templates(): return [public_template(t) for t in db.templates_list() if t['id'] in BUILTIN_IDS]

@app.get('/api/templates')
def templates(user=Depends(current_user)): return [public_template(t) for t in db.templates_list() if visible_template(t,user['id'])]

@app.get('/api/favorites')
def favorites(user=Depends(current_user)):
    with db.connection() as connection:
        return [row['template_id'] for row in connection.execute('SELECT template_id FROM favorites WHERE user_id=?',(user['id'],))]

@app.put('/api/favorites/{tid}',status_code=204)
def add_favorite(tid:str,user=Depends(current_user)):
    get_template(tid,user['id'])
    with db.connection() as connection:connection.execute('INSERT OR IGNORE INTO favorites VALUES (?,?)',(user['id'],tid))

@app.delete('/api/favorites/{tid}',status_code=204)
def delete_favorite(tid:str,user=Depends(current_user)):
    with db.connection() as connection:connection.execute('DELETE FROM favorites WHERE user_id=? AND template_id=?',(user['id'],tid))

@app.post('/api/templates',status_code=201)
async def upload_template(file: UploadFile,user=Depends(current_user)):
    if not file.filename or not file.filename.lower().endswith('.pptx'):
        raise HTTPException(422,'Выберите файл .pptx')
    tid=str(uuid4());folder=settings.storage/'templates';folder.mkdir(parents=True,exist_ok=True)
    path=folder/f'{tid}.pptx';size=0
    try:
        with path.open('wb') as dest:
            while chunk:=await file.read(1024*1024):
                size+=len(chunk)
                if size>settings.max_upload_mb*1024**2: raise HTTPException(413,f'Максимум {settings.max_upload_mb} МБ')
                dest.write(chunk)
        await asyncio.to_thread(validate_pptx_archive,path)
        metadata=await asyncio.to_thread(analyze_template,path)
        name=Path(file.filename.replace('\\','/')).stem[:120]
        metadata.update(category='Мои шаблоны',cover_title=name)
        db.template_save(tid,name,str(path),metadata,user['id'])
        return public_template(get_template(tid))
    except HTTPException:
        path.unlink(missing_ok=True);raise
    except Exception as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(422,str(exc) if isinstance(exc,ValueError) else 'Не удалось прочитать структуру PPTX.') from None
    finally: await file.close()

@app.post('/api/outline')
async def outline(request: OutlineRequest,user=Depends(current_user)):
    template=get_template(request.template_id,user['id'])
    try:
        async with generation_slots:
            result=await make_outline(request,template)
        return {'content':result.model_dump(),'mode':settings.mode}
    except LLMError as exc: raise HTTPException(502,str(exc)) from exc
    except TimeoutError as exc: raise HTTPException(504,'Создание структуры превысило четыре минуты. Попробуйте меньший объём.') from exc

async def generate_job(jid: str, request: GenerateRequest,user_id: str, result_project_id: str | None = None):
    if not db.job_start(jid,user_id): return
    result_project_id=result_project_id or str(uuid4())
    async with generation_slots:
        try:
            template=get_template(request.template_id,user_id)
            db.job_set(jid,'running','layout',user_id=user_id)
            # Материалы уже согласованы пользователем; LLM не переписывает их при вёрстке.
            await asyncio.to_thread(lambda:[build_scene(s,template['metadata'],'a',i) for i,s in enumerate(request.content.slides)])
            db.job_set(jid,'running','export',user_id=user_id)
            for variant in ['a','b','c']:
                await asyncio.to_thread(export_pptx,request.content,template,variant)
            db.job_set(jid,'running','audit',user_id=user_id)
            audit_deck(request.content,template,'a',request.source_text)
            db.job_complete_with_project(jid,result_project_id,request.template_id,
                                         request.content.model_dump(),request.source_text,user_id)
        except Exception:
            logger.exception('Ошибка сборки презентации %s',jid)
            db.job_set(jid,'failed','failed',error='Не удалось собрать презентацию. Проверьте шаблон и структуру, затем повторите.',user_id=user_id)

@app.post('/api/generate',status_code=202)
def generate(request: GenerateRequest,tasks: BackgroundTasks,user=Depends(current_user)):
    get_template(request.template_id,user['id'])
    jid=str(uuid4());pid=str(uuid4())
    db.job_create(jid,user['id'],'generate',{'request':request.model_dump(),'result_project_id':pid})
    tasks.add_task(generate_job,jid,request,user['id'],pid)
    return {'job_id':jid}

@app.get('/api/jobs/{jid}')
def job(jid: str,user=Depends(current_user)):
    result=db.job_get(jid)
    if not result or result['user_id']!=user['id']: raise HTTPException(404,'Задание не найдено')
    result.pop('user_id',None)
    result.pop('payload',None)
    result['can_retry']=result['state']=='failed' and bool(result.get('task_type') in {'generate','regenerate'})
    result.pop('task_type',None)
    result.pop('retry_of',None)
    result.pop('retry_job_id',None)
    return result


@app.post('/api/jobs/{jid}/retry',status_code=202)
def retry_job(jid: str,tasks: BackgroundTasks,user=Depends(current_user)):
    status,retry_id=db.job_retry_claim(jid,user['id'])
    if status=='not_found':raise HTTPException(404,'Задание не найдено')
    if status=='complete':raise HTTPException(409,'Завершённое задание нельзя повторить.')
    if status=='in_progress':raise HTTPException(409,'Задание ещё выполняется.')
    if status=='unavailable':raise HTTPException(409,'Для этого задания повтор недоступен.')
    retry=db.job_get(retry_id)
    if status=='existing' and retry and retry['state']=='complete':
        return {'job_id':retry_id}
    if status=='claimed' and retry and retry['state']=='queued':
        if retry['retry_of']:
            source=db.job_get(retry['retry_of'])
            if source and source['retry_job_id']==retry_id:
                db.job_set(source['id'],'retrying','retrying',user_id=user['id'])
        if retry['task_type']=='generate':
            request=GenerateRequest.model_validate(retry['payload']['request'])
            tasks.add_task(generate_job,retry_id,request,user['id'],retry['payload']['result_project_id'])
        elif retry['task_type']=='regenerate':
            original=retry['payload']['original']
            tasks.add_task(regenerate_job,retry_id,original,retry['payload']['instruction'],user['id'],retry['payload']['result_project_id'])
        else:
            raise HTTPException(409,'Для этого типа задания повтор недоступен.')
    return {'job_id':retry_id}

async def regenerate_job(jid: str, original: dict, instruction: str, user_id: str, result_project_id=None):
    if not db.job_start(jid,user_id): return
    result_project_id=result_project_id or str(uuid4())
    async with generation_slots:
        try:
            template=get_template(original['template_id'],user_id)
            db.job_set(jid,'running','design',user_id=user_id)
            content=await redesign_layout(DeckContent.model_validate(original['content']),template,instruction)
            db.job_set(jid,'running','layout',user_id=user_id)
            await asyncio.to_thread(lambda:[build_scene(s,template['metadata'],'a',i) for i,s in enumerate(content.slides)])
            db.job_set(jid,'running','export',user_id=user_id)
            for variant in ['a','b','c']:
                await asyncio.to_thread(export_pptx,content,template,variant)
            db.job_set(jid,'running','audit',user_id=user_id)
            await asyncio.to_thread(audit_deck,content,template,'a',original['source_text'])
            # Persist only a complete result, as a copy; never overwrite the user's working project.
            db.job_complete_with_project(jid,result_project_id,original['template_id'],
                                         content.model_dump(),original['source_text'],user_id)
        except LLMError as exc:
            db.job_set(jid,'failed','failed',error=str(exc),user_id=user_id)
        except TimeoutError:
            db.job_set(jid,'failed','failed',error='Модель не успела подготовить оформление. Предыдущая презентация сохранена.',user_id=user_id)
        except Exception:
            logger.exception('Ошибка нового оформления %s',jid)
            db.job_set(jid,'failed','failed',error='Не удалось создать новое оформление. Предыдущая презентация сохранена.',user_id=user_id)

@app.post('/api/projects/{pid}/regenerate',status_code=202)
def regenerate(pid: str, request: RegenerateRequest, tasks: BackgroundTasks, user=Depends(current_user)):
    original=get_project(pid,user['id'])
    get_template(original['template_id'],user['id'])
    if settings.mode=='live' and not configured():
        raise HTTPException(409,'Модель ещё не подключена. Настройте её на сервере и повторите.')
    jid=str(uuid4())
    result_project_id=str(uuid4())
    regeneration_source={
        'id':original['id'],
        'template_id':original['template_id'],
        'content':original['content'],
        'source_text':original['source_text'],
    }
    db.job_create(jid,user['id'],'regenerate',{
        'project_id':pid,'instruction':request.instruction,'original':regeneration_source,
        'result_project_id':result_project_id,
    })
    tasks.add_task(regenerate_job,jid,original,request.instruction,user['id'],result_project_id)
    return {'job_id':jid}

@app.get('/api/projects')
def projects(user=Depends(current_user)): return db.projects_list(user['id'])

@app.get('/api/projects/{pid}')
def project(pid: str,user=Depends(current_user)): return project_response(get_project(pid,user['id']))

@app.put('/api/projects/{pid}')
def update_project(pid: str,request: ProjectUpdate,user=Depends(current_user)):
    get_project(pid,user['id']);db.project_update(pid,request.content.model_dump(),request.variant)
    return project_response(get_project(pid))

@app.post('/api/projects/{pid}/preview')
def preview_project(pid: str, request: ProjectUpdate, user=Depends(current_user)):
    project=get_project(pid,user['id']);template=get_template(project['template_id'])
    return {'scenes':[build_scene(slide,template['metadata'],request.variant,i)
                      for i,slide in enumerate(request.content.slides)]}

@app.exception_handler(cloud.CloudError)
async def cloud_error(request: Request, exc: cloud.CloudError):
    return JSONResponse({'detail':str(exc)}, status_code=503)

@app.get('/api/cloud/status')
def cloud_status(user=Depends(current_user)):
    return cloud.status(user['id'])

@app.get('/api/cloud/projects')
def cloud_projects(user=Depends(current_user)):
    return cloud.list_projects(user['id'])

@app.post('/api/projects/{pid}/cloud')
def save_cloud(pid: str, user=Depends(current_user)):
    project=get_project(pid,user['id'])
    templates=[t for t in db.templates_list() if visible_template(t,user['id'])]
    return cloud.save_project(project,templates,user['id'])

@app.post('/api/cloud/projects/{pid}/restore',status_code=201)
def restore_cloud(pid: str, user=Depends(current_user)):
    saved=cloud.load_project(pid,user['id'])
    if not saved: raise HTTPException(404,'Облачная копия не найдена')
    content=DeckContent.model_validate(saved['payload']['content'])
    tid=str(uuid4());new_pid=str(uuid4());path=None
    if saved['pptx'] is not None:
        folder=settings.storage/'templates';folder.mkdir(parents=True,exist_ok=True)
        path=folder/f'{tid}.pptx';path.write_bytes(saved['pptx'])
    try:
        # Восстанавливаем отдельную копию: текущая работа и общие шаблоны не перезаписываются.
        db.template_save(tid,saved['name'],str(path) if path else None,saved['metadata'],user['id'])
        db.project_create(new_pid,tid,content.model_dump(),saved['payload']['source_text'],user['id'])
        db.project_update(new_pid,content.model_dump(),saved['payload']['variant'])
        return project_response(get_project(new_pid,user['id']))
    except Exception:
        if path: path.unlink(missing_ok=True)
        with db.connection() as conn:
            conn.execute('DELETE FROM projects WHERE id=?',(new_pid,))
            conn.execute('DELETE FROM templates WHERE id=?',(tid,))
        raise

@app.delete('/api/projects/{pid}',status_code=204)
def delete_project(pid: str,user=Depends(current_user)):
    get_project(pid,user['id']);db.project_delete(pid)

@app.post('/api/projects/{pid}/undo')
def undo(pid: str,user=Depends(current_user)):
    get_project(pid,user['id'])
    if not db.project_undo(pid): raise HTTPException(409,'Нет предыдущей версии')
    return project_response(get_project(pid))

@app.get('/api/projects/{pid}/audit')
def audit(pid: str,variant: str=Query('a',pattern='^[abc]$'),user=Depends(current_user)):
    project=get_project(pid,user['id']);template=get_template(project['template_id'])
    issues=audit_deck(DeckContent.model_validate(project['content']),template,variant,project['source_text'])
    return {'issues':[i.model_dump() for i in issues],'context_status':'available' if settings.mode=='live' and settings.context_audit else 'not_connected'}

@app.post('/api/projects/{pid}/audit/content')
async def content_audit(pid: str,user=Depends(current_user)):
    project=get_project(pid,user['id'])
    if settings.mode!='live' or not settings.context_audit: raise HTTPException(409,'Смысловая проверка доступна при подключённой LLM.')
    try:
        async with generation_slots:
            raw=await review_content(project['content'],project['source_text'])
        issues=[Issue(id=f"llm:{i}",slide=item['slide'],code='context',title=item['title'][:180],detail=item['detail'][:1200],
                      category='content',severity='warning',deterministic=False).model_dump() for i,item in enumerate(raw)]
        return {'issues':issues,'model':settings.model,'context_status':'completed'}
    except LLMError as exc: raise HTTPException(502,str(exc)) from exc

@app.post('/api/projects/{pid}/fix')
def fix(pid: str,request: FixRequest,user=Depends(current_user)):
    project=get_project(pid,user['id']);content=DeckContent.model_validate(project['content']);template=get_template(project['template_id'])
    available={i.id:i for i in audit_deck(content,template,request.variant,project['source_text']) if i.fixable}
    if any(i not in available for i in request.issue_ids): raise HTTPException(422,'Выберите только доступные автоматические исправления.')
    for iid in request.issue_ids:
        issue=available[iid]
        content.slides[issue.slide].fixed=list(set(content.slides[issue.slide].fixed+[issue.code]))
    db.project_update(pid,content.model_dump(),request.variant)
    return project_response(get_project(pid))

@app.get('/api/projects/{pid}/export/{format}')
def export(pid: str,format: str,variant: str=Query('a',pattern='^[abc]$'),user=Depends(current_user)):
    functions={'pptx':(export_pptx,'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
               'pdf':(export_pdf,'application/pdf'),'html':(export_html,'text/html; charset=utf-8')}
    if format not in functions: raise HTTPException(422,'Выберите PPTX, PDF или HTML')
    project=get_project(pid,user['id']);content=DeckContent.model_validate(project['content']);template=get_template(project['template_id'])
    function,mime=functions[format];payload=function(content,template,variant)
    filename=quote(content.title[:90]+f'-{variant}.{format}',safe='')
    return Response(payload,media_type=mime,headers={'Content-Disposition':f"attachment; filename=deckly-{variant}.{format}; filename*=UTF-8''{filename}"})

frontend=BASE.parent/'frontend/dist'
@app.get('/auth/yandex', include_in_schema=False)
@app.get('/auth/yandex/', include_in_schema=False)
def yandex_host_page():
    if not (frontend/'index.html').exists():
        raise HTTPException(503, 'Сначала соберите интерфейс приложения.')
    return FileResponse(frontend/'index.html', headers={'Cache-Control': 'no-store'})

if frontend.exists(): app.mount('/',StaticFiles(directory=frontend,html=True),name='frontend')
