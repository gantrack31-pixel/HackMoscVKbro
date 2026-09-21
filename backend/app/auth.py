"""Учётные записи SQLite, scrypt-пароли, серверные сессии и Яндекс OAuth + PKCE."""
import base64
import hashlib
import hmac
import re
import secrets
import sqlite3
import time
from uuid import uuid4
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, field_validator
from .config import settings
from .database import connection, now

router=APIRouter(prefix='/api/auth',tags=['Аккаунт'])
COOKIE='deckly_session'; OAUTH_COOKIE='deckly_oauth'; TTL=7*24*3600

def digest(value): return hashlib.sha256(value.encode()).hexdigest()

def password_hash(password, salt=None):
    salt=salt or secrets.token_bytes(16)
    key=hashlib.scrypt(password.encode(),salt=salt,n=32768,r=8,p=1,maxmem=64*1024**2,dklen=64)
    return 'scrypt$'+salt.hex()+'$'+key.hex()

def password_valid(password, encoded):
    # Одинаковая дорогая операция и для несуществующего аккаунта.
    if not encoded:
        password_hash(password);return False
    try:
        _,salt,_=encoded.split('$')
        return hmac.compare_digest(password_hash(password,bytes.fromhex(salt)),encoded)
    except (ValueError,TypeError): return False

class Credentials(BaseModel):
    email: str=Field(min_length=3,max_length=254)
    password: str=Field(min_length=1,max_length=128)
    @field_validator('email')
    @classmethod
    def email_format(cls,value):
        value=value.strip().lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',value):raise ValueError('Укажите корректную электронную почту')
        return value

class Registration(Credentials):
    password: str=Field(min_length=10,max_length=128)
    first_name: str=Field(min_length=1,max_length=60)
    last_name: str=Field(min_length=1,max_length=60)
    @field_validator('first_name','last_name')
    @classmethod
    def name(cls,value):
        if not value.strip():raise ValueError('Заполните имя и фамилию')
        return value.strip()

def public_user(user):
    return {**{k:user[k] for k in ['id','email','first_name','last_name','created_at']},
            'avatar_color':user.get('avatar_color','#0077FF'), 'yandex_connected':bool(user.get('yandex_id')),
            'password_enabled':bool(user.get('password_hash'))}

def rate_limit(request):
    ip=digest(request.client.host if request.client else 'unknown');cutoff=int(time.time())-900
    with connection() as db:
        db.execute('DELETE FROM auth_attempts WHERE time<?',(cutoff,))
        count=db.execute('SELECT COUNT(*) FROM auth_attempts WHERE ip_hash=? AND time>=?',(ip,cutoff)).fetchone()[0]
        if count>=15:raise HTTPException(429,'Слишком много попыток. Повторите через 15 минут.')
        db.execute('INSERT INTO auth_attempts VALUES (?,?)',(ip,int(time.time())))

def set_session(response,user,request):
    token=secrets.token_urlsafe(32);csrf=secrets.token_urlsafe(32)
    with connection() as db:
        old=request.cookies.get(COOKIE)
        if old:db.execute('DELETE FROM sessions WHERE token_hash=?',(digest(old),))
        db.execute('DELETE FROM sessions WHERE expires_at<?',(int(time.time()),))
        db.execute('INSERT INTO sessions VALUES (?,?,?,?)',(digest(token),user['id'],csrf,int(time.time())+TTL))
    response.set_cookie(COOKIE,token,max_age=TTL,httponly=True,secure=settings.cookie_secure,samesite='lax',path='/')
    response.headers['Cache-Control']='no-store'
    return {'user':public_user(user),'csrf':csrf}

def session_user(request):
    token=request.cookies.get(COOKIE)
    if not token:return None
    with connection() as db:
        row=db.execute('''SELECT users.*,sessions.csrf FROM sessions JOIN users ON users.id=sessions.user_id
          WHERE token_hash=? AND expires_at>?''',(digest(token),int(time.time()))).fetchone()
        return dict(row) if row else None

def current_user(request:Request):
    user=session_user(request)
    if not user:raise HTTPException(401,'Войдите в свой аккаунт')
    if request.method not in {'GET','HEAD','OPTIONS'}:
        token=request.headers.get('X-CSRF-Token','')
        if not hmac.compare_digest(token,user['csrf']):raise HTTPException(403,'Обновите страницу и повторите действие')
    return user

@router.get('/me')
def me(request:Request,response:Response):
    user=session_user(request);response.headers['Cache-Control']='no-store'
    return {'user':public_user(user) if user else None,'csrf':user['csrf'] if user else ''}

@router.post('/register',status_code=201)
def register(data:Registration,request:Request,response:Response):
    rate_limit(request)
    user={'id':str(uuid4()),'email':data.email,'first_name':data.first_name,'last_name':data.last_name,'created_at':now()}
    encoded=password_hash(data.password)
    try:
        with connection() as db:
            db.execute('INSERT INTO users (id,email,first_name,last_name,password_hash,yandex_id,created_at) VALUES (?,?,?,?,?,?,?)',(user['id'],user['email'],user['first_name'],user['last_name'],encoded,None,user['created_at']))
    except sqlite3.IntegrityError:raise HTTPException(409,'Аккаунт с этой почтой уже существует. Войдите в него.')
    user['password_hash']=encoded
    return set_session(response,user,request)

@router.post('/login')
def login(data:Credentials,request:Request,response:Response):
    rate_limit(request)
    with connection() as db: row=db.execute('SELECT * FROM users WHERE email=?',(data.email,)).fetchone()
    if not password_valid(data.password,row['password_hash'] if row else None):raise HTTPException(401,'Неверная почта или пароль')
    return set_session(response,dict(row),request)

@router.post('/logout',status_code=204)
def logout(request:Request,response:Response,user=Depends(current_user)):
    with connection() as db:db.execute('DELETE FROM sessions WHERE token_hash=?',(digest(request.cookies[COOKIE]),))
    response.delete_cookie(COOKIE,path='/');response.headers['Cache-Control']='no-store'

class ProfileUpdate(BaseModel):
    first_name: str=Field(min_length=1,max_length=60)
    last_name: str=Field(max_length=60)
    avatar_color: str

    @field_validator('first_name','last_name')
    @classmethod
    def clean_name(cls,value,info):
        value=value.strip()
        if info.field_name=='first_name' and not value:raise ValueError('Укажите имя')
        return value

    @field_validator('avatar_color')
    @classmethod
    def color(cls,value):
        if value not in {'#0077FF','#7851BA','#29745F','#C05640','#0F172A','#B05A8B'}:raise ValueError('Выберите цвет аватара')
        return value

@router.put('/profile')
def update_profile(data:ProfileUpdate,user=Depends(current_user)):
    with connection() as db:
        db.execute('UPDATE users SET first_name=?,last_name=?,avatar_color=? WHERE id=?',
                   (data.first_name,data.last_name,data.avatar_color,user['id']))
    return public_user({**user,**data.model_dump()})

@router.get('/profile/stats')
def profile_stats(user=Depends(current_user)):
    with connection() as db:
        return {key:db.execute(f'SELECT COUNT(*) FROM {table} WHERE user_id=?',(user['id'],)).fetchone()[0]
                for key,table in [('projects','projects'),('favorites','favorites'),('templates','templates')]}

def begin_yandex(request,user=None):
    if not settings.yandex_id:raise HTTPException(503,'Вход через Яндекс пока не подключён. Попробуйте вход по почте.')
    state=secrets.token_urlsafe(32);browser=secrets.token_urlsafe(32);verifier=secrets.token_urlsafe(64)
    challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    with connection() as db:
        db.execute('DELETE FROM oauth_states WHERE expires_at<?',(int(time.time()),))
        db.execute('INSERT INTO oauth_states (state_hash,browser_hash,verifier,expires_at,user_id,session_hash) VALUES (?,?,?,?,?,?)',
                   (digest(state),digest(browser),verifier,int(time.time())+600,user['id'] if user else None,
                    digest(request.cookies.get(COOKIE,'')) if user else None))
    params={'response_type':'code','client_id':settings.yandex_id,'redirect_uri':settings.yandex_redirect,'scope':'login:info login:email',
            'state':state,'code_challenge':challenge,'code_challenge_method':'S256'}
    response=RedirectResponse('https://oauth.yandex.ru/authorize?'+urlencode(params),status_code=302)
    response.set_cookie(OAUTH_COOKIE,browser,max_age=600,httponly=True,secure=settings.cookie_secure,samesite='lax',path='/api/auth/yandex')
    response.headers['Cache-Control']='no-store';return response

@router.get('/yandex/start')
def yandex_start(request:Request):
    return begin_yandex(request)

@router.post('/yandex/link')
def yandex_link(request:Request,response:Response,user=Depends(current_user)):
    if user['yandex_id']:raise HTTPException(409,'Яндекс ID уже подключён')
    redirect=begin_yandex(request,user)
    for cookie in redirect.raw_headers:
        if cookie[0]==b'set-cookie':response.raw_headers.append(cookie)
    return {'url':redirect.headers['location']}

@router.get('/yandex/callback')
async def yandex_callback(request:Request,code:str='',state:str='',error:str=''):
    linking=False
    def fail(reason):
        response=RedirectResponse(settings.public_url+('/#profile?yandex_error=' if linking else '/#auth-error=')+reason,status_code=302)
        response.delete_cookie(OAUTH_COOKIE,path='/api/auth/yandex');response.headers['Cache-Control']='no-store';return response
    if not state or len(state)>1024:return fail('state')
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT * FROM oauth_states WHERE state_hash=?',(digest(state),)).fetchone()
        db.execute('DELETE FROM oauth_states WHERE state_hash=?',(digest(state),))
    if not row or row['expires_at']<time.time() or not hmac.compare_digest(row['browser_hash'],digest(request.cookies.get(OAUTH_COOKIE,''))):return fail('state')
    linking=bool(row['user_id'])
    if linking:
        current=session_user(request)
        if not current or current['id']!=row['user_id'] or not hmac.compare_digest(row['session_hash'],digest(request.cookies.get(COOKIE,''))):return fail('state')
    if error or not code:return fail('cancelled')
    try:
        async with httpx.AsyncClient(timeout=20,follow_redirects=False) as client:
            token_data={'grant_type':'authorization_code','code':code,'client_id':settings.yandex_id,'code_verifier':row['verifier']}
            if settings.yandex_secret:token_data['client_secret']=settings.yandex_secret
            token=await client.post('https://oauth.yandex.ru/token',data=token_data)
            token.raise_for_status();access_token=token.json()['access_token']
            profile=await client.get('https://login.yandex.ru/info',params={'format':'json'},headers={'Authorization':'OAuth '+access_token})
            profile.raise_for_status();info=profile.json()
        yandex_id=str(info['id']);email=str(info.get('default_email','')).strip().lower()
        if not yandex_id or len(yandex_id)>128 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):return fail('profile')
        with connection() as db:
            db.execute('BEGIN IMMEDIATE')
            found=db.execute('SELECT * FROM users WHERE yandex_id=?',(yandex_id,)).fetchone()
            if linking:
                target=db.execute('SELECT * FROM users WHERE id=?',(row['user_id'],)).fetchone()
                if not target or (found and found['id']!=target['id']) or target['yandex_id']:return fail('linked')
                db.execute('UPDATE users SET yandex_id=? WHERE id=?',(yandex_id,target['id']))
                user={**dict(target),'yandex_id':yandex_id}
            elif found:user=dict(found)
            else:
                # Совпадение email само по себе не связывает два аккаунта.
                if db.execute('SELECT id FROM users WHERE email=?',(email,)).fetchone():return fail('exists')
                user={'id':str(uuid4()),'email':email,'first_name':str(info.get('first_name') or info.get('display_name') or 'Пользователь')[:60],
                      'last_name':str(info.get('last_name') or '')[:60],'created_at':now()}
                db.execute('INSERT INTO users (id,email,first_name,last_name,password_hash,yandex_id,created_at) VALUES (?,?,?,?,?,?,?)',(user['id'],email,user['first_name'],user['last_name'],None,yandex_id,user['created_at']))
                user['yandex_id']=yandex_id
        response=RedirectResponse(settings.public_url+('/#profile?yandex=connected' if linking else '/#home'),status_code=302)
        set_session(response,user,request);response.delete_cookie(OAUTH_COOKIE,path='/api/auth/yandex');return response
    except (httpx.HTTPError,KeyError,ValueError,TypeError,sqlite3.IntegrityError):return fail('provider')
