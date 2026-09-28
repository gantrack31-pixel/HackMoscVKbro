"""HTTP-маршруты. Запуск: python -m uvicorn app.main:app --host 127.0.0.1 --port 8000."""
import asyncio
import hashlib
import logging
import re
import smtplib
import time
from contextlib import asynccontextmanager
from email.message import EmailMessage
from pathlib import Path
from uuid import uuid4
from urllib.parse import quote
from time import monotonic
from fastapi import FastAPI, UploadFile, HTTPException, BackgroundTasks, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from .config import settings, BASE, validate_settings
from . import database as db
from .models import OutlineRequest, GenerateRequest, RegenerateRequest, ProjectUpdate, FixRequest, DeckContent, Issue, AssistantRequest
from .services.assistant import edit_presentation
from .services.templates import seed_templates, analyze_template, BUILTIN_IDS
from .services.template_parser import NORMALIZATION_VERSION, fingerprint
from .services.pptx_security import validate_pptx_archive
from .services.llm import make_outline, review_content, create_design_variants, configured, LLMError
from .services.layout import build_scene
from .services.audit import audit_deck
from .services.sources import slide_binding
from .services.export import export_pptx, export_pdf, export_html
from .services import cloud
from .services.materials import read_material, MAX_FILE_BYTES, MAX_PACKET_CHARS
from .services.workflow import recipe, manifest, generation_budget, OUTLINE_BUDGET_SECONDS
from .services.images import generate_image, MODEL as IMAGE_MODEL
from pydantic import BaseModel, Field, field_validator
from .auth import router as auth_router, current_user

logger=logging.getLogger('deckly')
generation_slots=asyncio.Semaphore(2)
SUPPORT_RATE_WINDOW_SECONDS=900
SUPPORT_RATE_LIMIT=3

@asynccontextmanager
async def lifespan(app):
    validate_settings()
    settings.storage.mkdir(parents=True,exist_ok=True)
    db.initialize();seed_templates(settings.storage)
    yield

app=FastAPI(title='Deckly.Ai API',version='0.3.0',lifespan=lifespan,
            docs_url=None if settings.app_env=='production' else '/docs',
            redoc_url=None if settings.app_env=='production' else '/redoc',
            openapi_url=None if settings.app_env=='production' else '/openapi.json')
app.add_middleware(CORSMiddleware,allow_origins=settings.origins,allow_credentials=True,
                   allow_methods=['GET','POST','PUT','DELETE'],allow_headers=['Content-Type','X-CSRF-Token'])
app.include_router(auth_router)

@app.exception_handler(RequestValidationError)
async def private_validation_error(request: Request, exc: RequestValidationError):
    # Default validation responses may echo passwords, materials and other input.
    return JSONResponse({'detail':'Проверьте заполнение полей и допустимый объём данных.'}, status_code=422)

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
    response.headers['Permissions-Policy']='camera=(), microphone=(), geolocation=(), payment=(), fullscreen=(self)'
    if request.url.path not in {'/docs','/redoc','/docs/oauth2-redirect'}:
        response.headers['Content-Security-Policy']=(
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "
            "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
    if settings.app_env=='production':
        response.headers['Strict-Transport-Security']='max-age=31536000'
    if request.url.path.startswith('/api/'):response.headers['Cache-Control']='no-store'
    return response


def visible_template(template,user_id):
    return template.get('user_id')==user_id or (template['id'] in BUILTIN_IDS and not template.get('user_id'))

def get_template(tid,user_id=None):
    result=db.template_get(tid)
    if not result or (user_id and not visible_template(result,user_id)): raise HTTPException(404,'Шаблон не найден')
    if result.get('path'):
        try:
            stale = (result['metadata'].get('normalization_version') != NORMALIZATION_VERSION
                     or result['metadata'].get('file_fingerprint') != fingerprint(result['path']))
            if stale:
                fresh=analyze_template(Path(result['path']))
                catalog={k:result['metadata'][k] for k in ('category','cover_title') if k in result['metadata']}
                result['metadata']={**catalog,**fresh}
                db.template_save(tid,result['name'],result['path'],result['metadata'],result.get('user_id'))
        except (OSError,ValueError):
            pass  # A previously saved project remains readable if its source is unavailable.
    return result

def get_project(pid,user_id=None):
    result=db.project_get(pid)
    if not result or (user_id and result.get('user_id')!=user_id): raise HTTPException(404,'Презентация не найдена')
    return result

def public_template(template):
    return {key:value for key,value in template.items() if key not in {'path','user_id'}}

def project_response(project):
    content=DeckContent.model_validate(project['content']);template=get_template(project['template_id'])
    return {**{k:v for k,v in project.items() if k not in {'revisions','future','user_id'}},'can_undo':bool(project.get('revisions')),
            'can_redo':bool(project.get('future')),
            'template':public_template(template),
            'variants':{variant:[build_scene(slide,template['metadata'],variant,i) for i,slide in enumerate(content.slides)] for variant in ['a','b','c']},
            'sources':[{'slide':i,**slide_binding(slide,project['source_text'])} for i,slide in enumerate(content.slides)]}

@app.get('/api/health')
def health():
    return {'ok':True,'mode':settings.mode,'model':settings.model,'llm_configured':configured(),
            'database':'SQLite','max_upload_mb':settings.max_upload_mb,'context_audit':settings.context_audit,
            'yandex_enabled':bool(settings.yandex_id), 'image_generation':bool(settings.image_base_url),
            'image_model':IMAGE_MODEL,'generation_budget_seconds':300,'vision_enabled':settings.vision,
            'export_note':'PPTX сохраняет ресурсы мастера. PDF и HTML используют схему размещения и Manrope.'}

@app.get('/api/workflow')
def workflow(user=Depends(current_user)):
    return recipe()

@app.post('/api/materials/import')
async def import_materials(files: list[UploadFile], user=Depends(current_user)):
    try:
        if not 1<=len(files)<=8:raise HTTPException(422,'Выберите от одного до восьми файлов.')
        documents=[];total=0
        for file in files:
            data=await file.read(MAX_FILE_BYTES+1)
            total+=len(data)
            if total>15*1024*1024:raise HTTPException(413,'Пакет должен быть не больше 15 МБ.')
            name=Path((file.filename or 'Документ').replace('\\','/')).name
            doc=await asyncio.to_thread(read_material,name,data)
            documents.append(doc)
        text='\n\n'.join(f'Источник: {d["name"]}\n{d["text"]}' for d in documents)
        if len(text)>MAX_PACKET_CHARS:raise HTTPException(413,'В пакете больше 50 000 символов. Уберите часть документов.')
        return {'text':text,'documents':[{k:v for k,v in d.items() if k!='text'} for d in documents]}
    finally:
        for file in files:await file.close()

class ImagePrompt(BaseModel):
    prompt: str=Field(min_length=3,max_length=1000)

@app.post('/api/images/generate')
async def image_generation(request:ImagePrompt,user=Depends(current_user)):
    if not request.prompt.strip():raise HTTPException(422,'Опишите иллюстрацию.')
    async with generation_slots:
        return await generate_image(request.prompt.strip())

class SupportMessage(BaseModel):
    email: str=Field(min_length=3,max_length=254)
    message: str=Field(min_length=10,max_length=4000)

    @field_validator('email')
    @classmethod
    def valid_email(cls,value):
        value=value.strip().lower()
        if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',value):
            raise ValueError('Укажите корректную электронную почту.')
        return value

    @field_validator('message')
    @classmethod
    def nonempty_message(cls,value):
        value=value.strip()
        if len(value)<10:
            raise ValueError('Опишите вопрос подробнее — минимум 10 символов.')
        return value


def deliver_support_message(email: str, message: str, user: dict) -> None:
    if not all((settings.smtp_host.strip(), settings.smtp_username.strip(),
                settings.smtp_password, settings.email_from.strip())):
        raise RuntimeError('SMTP для обращений в поддержку не настроен.')

    email_message=EmailMessage()
    email_message['Subject']='Обращение в поддержку Deckly.Ai'
    email_message['From']=settings.email_from
    email_message['To']=settings.email_from
    email_message['Reply-To']=email
    email_message.set_content(
        'Новое обращение в поддержку Deckly.Ai\n\n'
        f'Почта для ответа: {email}\n'
        f'Аккаунт: {user["email"]}\n'
        f'Имя: {user["first_name"]} {user["last_name"]}\n\n'
        f'Сообщение:\n{message}\n'
    )
    with smtplib.SMTP_SSL(settings.smtp_host,settings.smtp_port,timeout=15) as server:
        server.login(settings.smtp_username,settings.smtp_password)
        server.send_message(email_message)


def rate_limit_support_message(request: Request, user_id: str) -> None:
    ip=request.client.host if request.client else 'unknown'
    ip_hash=hashlib.sha256(ip.encode()).hexdigest()
    user_hash=hashlib.sha256(user_id.encode()).hexdigest()
    now=int(time.time())
    cutoff=now-SUPPORT_RATE_WINDOW_SECONDS
    with db.connection() as connection:
        connection.execute('BEGIN IMMEDIATE')
        connection.execute('DELETE FROM support_attempts WHERE time<?',(cutoff,))
        ip_count=connection.execute(
            'SELECT COUNT(*) FROM support_attempts WHERE ip_hash=? AND time>=?',
            (ip_hash,cutoff),
        ).fetchone()[0]
        user_count=connection.execute(
            'SELECT COUNT(*) FROM support_attempts WHERE user_hash=? AND time>=?',
            (user_hash,cutoff),
        ).fetchone()[0]
        if ip_count>=SUPPORT_RATE_LIMIT or user_count>=SUPPORT_RATE_LIMIT:
            raise HTTPException(429,'Слишком много обращений. Попробуйте отправить сообщение позже.')
        connection.execute(
            'INSERT INTO support_attempts (ip_hash,user_hash,time) VALUES (?,?,?)',
            (ip_hash,user_hash,now),
        )


@app.post('/api/support/messages',status_code=202)
async def send_support_message(data: SupportMessage, request: Request, user=Depends(current_user)):
    rate_limit_support_message(request,user['id'])
    try:
        await asyncio.to_thread(deliver_support_message,data.email,data.message,user)
    except Exception:
        logger.error('Support message delivery failed.')
        raise HTTPException(503,'Не удалось отправить сообщение. Попробуйте позже.') from None
    return {'sent':True}

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

@app.get('/api/templates/{tid}/original')
def original_template(tid: str,user=Depends(current_user)):
    template=get_template(tid,user['id'])
    path=template.get('path')
    if not path or not Path(path).is_file(): raise HTTPException(404,'Исходный PPTX отсутствует')
    return FileResponse(path,media_type='application/vnd.openxmlformats-officedocument.presentationml.presentation',
                        filename='template.pptx',headers={'Cache-Control':'private, no-store'})

@app.post('/api/outline')
async def outline(request: OutlineRequest,user=Depends(current_user)):
    template=get_template(request.template_id,user['id'])
    try:
        async with asyncio.timeout(OUTLINE_BUDGET_SECONDS):
            async with generation_slots:
                result=await make_outline(request,template)
        return {'content':result.model_dump(),'mode':settings.mode}
    except LLMError as exc: raise HTTPException(502,str(exc)) from exc
    except TimeoutError as exc: raise HTTPException(504,'Создание структуры превысило две минуты. Попробуйте меньший объём.') from exc

@generation_budget
async def generate_job(jid: str, request: GenerateRequest,user_id: str, result_project_id: str | None = None):
    started=monotonic()
    if not db.job_start(jid,user_id): return
    result_project_id=result_project_id or str(uuid4())
    async with generation_slots:
        try:
            template=get_template(request.template_id,user_id)
            db.job_set(jid,'running','design',user_id=user_id)
            source=request.content.model_copy(update={'audience':request.audience})
            content=await create_design_variants(source,template)
            for slide in content.slides:
                if slide.kind=='image' and slide.image_prompt and not slide.image_data and not slide.template_asset_id:
                    db.job_set(jid,'running','images',user_id=user_id)
                    slide.image_data=(await generate_image(slide.image_prompt))['image_data']
            db.job_set(jid,'running','layout',user_id=user_id)
            # Материалы уже согласованы пользователем; LLM не переписывает их при вёрстке.
            scenes=await asyncio.to_thread(lambda:{v:[build_scene(s,template['metadata'],v,i) for i,s in enumerate(content.slides)] for v in ('a','b','c')})
            db.job_set(jid,'running','export',user_id=user_id)
            for variant in ['a','b','c']:
                await asyncio.to_thread(export_pptx,content,template,variant,scenes=scenes[variant])
            db.job_set(jid,'running','audit',user_id=user_id)
            counts={}
            for variant in ('a','b','c'):
                issues=await asyncio.to_thread(audit_deck,content,template,variant,request.source_text,scenes=scenes[variant])
                counts[variant]={'issues':len(issues),'errors':sum(i.severity=='error' for i in issues)}
            db.job_complete_with_project(jid,result_project_id,request.template_id,
                                         content.model_dump(),request.source_text,user_id,
                                         manifest(template,content,request.source_text,counts,monotonic()-started,jid))
        except LLMError as exc:
            db.job_set(jid,'failed','failed',error=str(exc),user_id=user_id)
        except HTTPException as exc:
            db.job_set(jid,'failed','failed',error=str(exc.detail),user_id=user_id)
        except TimeoutError:
            db.job_set(jid,'failed','failed',error='Модель не успела подготовить три варианта. Повторите запрос.',user_id=user_id)
        except Exception as exc:
            logger.error('Ошибка сборки презентации %s (%s)',jid,type(exc).__name__)
            db.job_set(jid,'failed','failed',error='Не удалось собрать презентацию. Проверьте шаблон и структуру, затем повторите.',user_id=user_id)

@app.post('/api/generate',status_code=202)
def generate(request: GenerateRequest,tasks: BackgroundTasks,user=Depends(current_user)):
    get_template(request.template_id,user['id'])
    if settings.mode=='live' and not configured():
        raise HTTPException(409,'Модель ещё не подключена. Настройте её на сервере и повторите.')
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

@generation_budget
async def regenerate_job(jid: str, original: dict, instruction: str, user_id: str, result_project_id=None):
    started=monotonic()
    if not db.job_start(jid,user_id): return
    result_project_id=result_project_id or str(uuid4())
    async with generation_slots:
        try:
            template=get_template(original['template_id'],user_id)
            db.job_set(jid,'running','design',user_id=user_id)
            content=await create_design_variants(DeckContent.model_validate(original['content']),template,instruction)
            db.job_set(jid,'running','layout',user_id=user_id)
            scenes=await asyncio.to_thread(lambda:{v:[build_scene(s,template['metadata'],v,i) for i,s in enumerate(content.slides)] for v in ('a','b','c')})
            db.job_set(jid,'running','export',user_id=user_id)
            for variant in ['a','b','c']:
                await asyncio.to_thread(export_pptx,content,template,variant,scenes=scenes[variant])
            db.job_set(jid,'running','audit',user_id=user_id)
            counts={}
            for variant in ('a','b','c'):
                issues=await asyncio.to_thread(audit_deck,content,template,variant,original['source_text'],scenes=scenes[variant])
                counts[variant]={'issues':len(issues),'errors':sum(i.severity=='error' for i in issues)}
            # Persist only a complete result, as a copy; never overwrite the user's working project.
            db.job_complete_with_project(jid,result_project_id,original['template_id'],
                                         content.model_dump(),original['source_text'],user_id,
                                         manifest(template,content,original['source_text'],counts,monotonic()-started,jid))
        except LLMError as exc:
            db.job_set(jid,'failed','failed',error=str(exc),user_id=user_id)
        except TimeoutError:
            db.job_set(jid,'failed','failed',error='Модель не успела подготовить оформление. Предыдущая презентация сохранена.',user_id=user_id)
        except Exception as exc:
            logger.error('Ошибка нового оформления %s (%s)',jid,type(exc).__name__)
            db.job_set(jid,'failed','failed',error='Не удалось создать новое оформление. Предыдущая презентация сохранена.',user_id=user_id)

@app.post('/api/projects/{pid}/regenerate',status_code=202)
def regenerate(pid: str, request: RegenerateRequest, tasks: BackgroundTasks, user=Depends(current_user)):
    original=get_project(pid,user['id'])
    if not request.instruction.strip():
        raise HTTPException(422,'Опишите, что изменить в композиции, прежде чем отправлять запрос.')
    request.instruction=request.instruction.strip()
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

@app.post('/api/projects/{pid}/assistant')
async def assistant_edit(pid: str, request: AssistantRequest, user=Depends(current_user)):
    project=get_project(pid,user['id'])
    if project['updated_at'] != request.base_updated_at:
        raise HTTPException(409,'Презентация изменилась в другой вкладке. Откройте актуальную версию перед запросом AI.')
    if settings.mode!='live' or not configured():
        raise HTTPException(409,'Редактирование с AI доступно при подключённой модели. Ручные правки работают без неё.')
    if request.action=='edit' and not request.instruction.strip():
        raise HTTPException(422,'Напишите, что изменить в презентации.')
    if request.slide is not None and request.slide >= len(request.content.slides):
        raise HTTPException(422,'Указанный слайд отсутствует.')
    template=get_template(project['template_id'])
    try:
        async with asyncio.timeout(180):
            async with generation_slots:
                result,report=await edit_presentation(request,template,project['source_text'])
                await asyncio.to_thread(export_pptx,result,template,request.variant)
                # Verify the full response geometry before publishing a revision.
                await asyncio.to_thread(lambda:[build_scene(s,template['metadata'],v,i)
                    for v in ('a','b','c') for i,s in enumerate(result.slides)])
        if result != request.content:
            if not db.project_ai_update(pid,user['id'],request.base_updated_at,
                                        request.content.model_dump(),result.model_dump(),request.variant):
                raise HTTPException(409,'Во время работы AI презентация изменилась. Результат не перезаписал новые правки; повторите запрос из актуальной версии.')
        else:
            # No AI changes: retain unsaved client draft instead of losing it in a saved-project response.
            return {'project':None, **report}
        return {'project':project_response(get_project(pid,user['id'])), **report}
    except LLMError as exc:
        raise HTTPException(502,str(exc)) from exc
    except TimeoutError as exc:
        raise HTTPException(504,'AI не успел за три минуты. Ваши правки не изменены; попробуйте один слайд.') from exc

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

@app.post('/api/projects/{pid}/redo')
def redo(pid: str,user=Depends(current_user)):
    get_project(pid,user['id'])
    if not db.project_history(pid,'redo'): raise HTTPException(409,'Нет следующей версии')
    return project_response(get_project(pid))

@app.get('/api/projects/{pid}/audit')
def audit(pid: str,variant: str=Query('a',pattern='^[abc]$'),user=Depends(current_user)):
    project=get_project(pid,user['id']);template=get_template(project['template_id'])
    issues=audit_deck(DeckContent.model_validate(project['content']),template,variant,project['source_text'])
    return {'issues':[i.model_dump() for i in issues],
            'sources':[{'slide':i,**slide_binding(s,project['source_text'])} for i,s in enumerate(DeckContent.model_validate(project['content']).slides)],
            'context_status':'available' if settings.mode=='live' and settings.context_audit else 'not_connected'}

@app.post('/api/projects/{pid}/audit/content')
async def content_audit(pid: str,user=Depends(current_user)):
    project=get_project(pid,user['id'])
    if settings.mode!='live' or not settings.context_audit: raise HTTPException(409,'Смысловая проверка доступна при подключённой LLM.')
    try:
        async with generation_slots:
            raw=await review_content(project['content'],project['source_text'])
        issues=[Issue(id=f"llm:{i}",slide=item['slide'],code='context',title=item['title'][:180],detail=item['detail'][:1200],
                      category='content',severity='info' if item.get('grounding')=='unavailable' else 'warning',
                      deterministic=False,source_bindings=item.get('source_bindings',[]),
                      grounding=item.get('grounding','unverified')).model_dump() for i,item in enumerate(raw)]
        return {'issues':issues,'model':settings.model,
                'context_status':'unavailable' if any(i['grounding']=='unavailable' for i in issues) else 'completed'}
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
@app.get('/login', include_in_schema=False)
@app.get('/register', include_in_schema=False)
@app.get('/auth/yandex', include_in_schema=False)
@app.get('/auth/yandex/', include_in_schema=False)
def yandex_host_page():
    if not (frontend/'index.html').exists():
        raise HTTPException(503, 'Сначала соберите интерфейс приложения.')
    return FileResponse(frontend/'index.html', headers={'Cache-Control': 'no-store'})

if frontend.exists(): app.mount('/',StaticFiles(directory=frontend,html=True),name='frontend')
