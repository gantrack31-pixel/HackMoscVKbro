"""Real Yandex Disk uploads, isolated to the application's folder.

Tokens are encrypted at rest; API and upload errors never expose URLs/tokens.
Legacy PostgreSQL backups are deliberately not relabelled as Disk uploads.
"""
from contextlib import asynccontextmanager
from hashlib import md5
from time import time
from urllib.parse import urlsplit
from uuid import uuid4
import re
import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from ..config import settings
from .. import database as db
from . import provider_http

API='https://cloud-api.yandex.net/v1/disk'
FOLDER='app:/Deckly'

def configured(): return bool(settings.yandex_id and settings.yandex_disk_token_key)

def save_token(user_id,access_token,expires_in,yandex_id):
    encrypted=Fernet(settings.yandex_disk_token_key.encode()).encrypt(access_token.encode()).decode()
    with db.connection() as conn:
        conn.execute('INSERT OR REPLACE INTO yandex_disk_tokens VALUES (?,?,?,?)',
                     (user_id,encrypted,time()+float(expires_in) if expires_in else 0,yandex_id))

def forget(user_id):
    with db.connection() as conn: conn.execute('DELETE FROM yandex_disk_tokens WHERE user_id=?',(user_id,))

def token_for(user_id):
    with db.connection() as conn:
        row=conn.execute('SELECT * FROM yandex_disk_tokens WHERE user_id=?',(user_id,)).fetchone()
    if not row: raise HTTPException(409,'Подключите Яндекс.Диск для сохранения файлов.')
    if row['expires_at'] and row['expires_at']<=time():
        forget(user_id);raise HTTPException(409,'Доступ к Яндекс.Диску истёк. Подключите его заново.')
    try: return Fernet(settings.yandex_disk_token_key.encode()).decrypt(row['token'].encode()).decode()
    except (InvalidToken,ValueError):
        raise HTTPException(409,'Подключите Яндекс.Диск заново: сохранённое разрешение недоступно.') from None

@asynccontextmanager
async def client_scope(client=None):
    client=client or provider_http.get();owned=client is None
    client=client or httpx.AsyncClient(follow_redirects=False)
    try: yield client
    except httpx.HTTPError:
        raise HTTPException(503,'Не удалось связаться с Яндекс.Диском. Локальная презентация сохранена.') from None
    finally:
        if owned: await client.aclose()

async def request(client,user_id,method,path,**kwargs):
    response=await client.request(method,API+path,headers={'Authorization':'OAuth '+token_for(user_id)},
                                  timeout=httpx.Timeout(90,connect=15,pool=15),follow_redirects=False,**kwargs)
    if response.status_code==401:
        forget(user_id);raise HTTPException(409,'Разрешение Яндекс.Диска истекло или отозвано. Подключите его заново.')
    if response.status_code==403:
        forget(user_id);raise HTTPException(409,'Не выданы права на папку приложения Яндекс.Диска. Подключите его заново.')
    if response.status_code in {429,507}:
        raise HTTPException(503,'Яндекс.Диск временно ограничил запросы или закончилось место. Попробуйте позже.')
    if response.status_code>=500: raise HTTPException(503,'Яндекс.Диск временно недоступен. Локальная презентация сохранена.')
    return response

async def status(user_id,client=None):
    result={'configured':configured(),'ready':False,'provider':'yandex_disk'}
    if not configured(): return result
    try: token_for(user_id)
    except HTTPException: return result
    async with client_scope(client) as transport:
        try: response=await request(transport,user_id,'GET','/resources',params={'path':'app:/','fields':'name'})
        except HTTPException as exc:
            if exc.status_code==409: return result
            raise
        if response.status_code!=200: raise HTTPException(503,'Не удалось проверить папку Яндекс.Диска.')
    return {**result,'ready':True}

def upload_url(data):
    href=data.get('href','');parsed=urlsplit(href)
    if (parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password
            or parsed.port not in {None,443} or not parsed.hostname.endswith(('.disk.yandex.net','.disk.yandex.ru'))
            or data.get('method','PUT')!='PUT'):
        raise HTTPException(502,'Яндекс.Диск вернул недопустимый адрес загрузки.')
    return href

async def upload(user_id,title,data,client=None):
    token_for(user_id)
    if len(data)>75*1024*1024: raise HTTPException(413,'Файл больше 75 МБ. Скачайте его на устройство.')
    stem=re.sub(r'[^\w\s.-]','_',title,flags=re.UNICODE).strip(' .')[:90] or 'Презентация'
    path=FOLDER+'/'+stem+'-'+uuid4().hex[:12]+'.pptx'
    async with client_scope(client) as transport:
        folder=await request(transport,user_id,'PUT','/resources',params={'path':FOLDER})
        if folder.status_code not in {201,409}: raise HTTPException(502,'Не удалось создать папку Deckly на Яндекс.Диске.')
        link=await request(transport,user_id,'GET','/resources/upload',params={'path':path,'overwrite':'false'})
        if link.status_code!=200: raise HTTPException(502,'Яндекс.Диск не разрешил загрузить файл. Повторите сохранение.')
        try: href=upload_url(link.json())
        except (ValueError,TypeError,AttributeError): raise HTTPException(502,'Некорректный ответ Яндекс.Диска.') from None
        sent=await transport.put(href,content=data,headers={'Content-Type':'application/vnd.openxmlformats-officedocument.presentationml.presentation'},
                                  timeout=httpx.Timeout(90,connect=15,pool=15),follow_redirects=False)
        if sent.status_code!=201: raise HTTPException(502,'Яндекс.Диск не подтвердил загрузку файла. Локальная копия сохранена.')
        verification=await request(transport,user_id,'GET','/resources',params={'path':path,'fields':'name,path,size,md5,modified'})
        if verification.status_code!=200: raise HTTPException(502,'Файл отправлен, но Яндекс.Диск не подтвердил сохранение. Проверьте папку Deckly.')
        try: resource=verification.json()
        except ValueError: raise HTTPException(502,'Не удалось проверить сохранённый файл на Яндекс.Диске.') from None
        if not isinstance(resource,dict) or resource.get('size')!=len(data) or resource.get('md5')!=md5(data).hexdigest():
            raise HTTPException(502,'Яндекс.Диск не подтвердил целостность файла. Проверьте папку Deckly.')
    return {'name':path.rsplit('/',1)[1],'path':path,'saved_at':resource.get('modified') or db.now(),'provider':'yandex_disk'}

async def files(user_id,client=None):
    async with client_scope(client) as transport:
        response=await request(transport,user_id,'GET','/resources',params={'path':FOLDER,'limit':100,'sort':'-modified',
            'fields':'_embedded.items.name,_embedded.items.type,_embedded.items.modified'})
        if response.status_code==404:return []
        if response.status_code!=200: raise HTTPException(502,'Не удалось получить список файлов Яндекс.Диска.')
        try:
            return [{'name':f['name'],'saved_at':f.get('modified','')} for f in response.json().get('_embedded',{}).get('items',[])
                    if f.get('type')=='file' and f.get('name','').endswith('.pptx')]
        except (ValueError,TypeError,AttributeError,KeyError):
            raise HTTPException(502,'Некорректный список файлов Яндекс.Диска.') from None
