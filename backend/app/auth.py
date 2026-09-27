"""Учётные записи SQLite, scrypt-пароли, серверные сессии и Яндекс OAuth + PKCE."""
import base64
import hashlib
import hmac
import re
import secrets
import sqlite3
import smtplib
import time
import logging
import asyncio
from html import escape
from uuid import uuid4
from urllib.parse import urlencode, quote
from email.message import EmailMessage
import httpx
from fastapi import APIRouter, Request, Response, HTTPException, Depends, UploadFile
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, field_validator
from .config import settings
from .database import connection, now
from .services.avatar import normalize_avatar, MAX_AVATAR_BYTES

router=APIRouter(prefix='/api/auth',tags=['Аккаунт'])
COOKIE='deckly_session'; OAUTH_COOKIE='deckly_oauth'; TTL=7*24*3600
VERIFICATION_TTL=24*3600
logger=logging.getLogger('deckly.auth')

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
            'avatar_url':('/api/auth/avatar?v='+user['avatar_version']) if user.get('avatar_version') else None,
            'password_enabled':bool(user.get('password_hash')),
            'email_verified':bool(user.get('email_verified',True))}

def build_verification_email(email, url):
    """Build branded HTML confirmation email with a plain-text fallback."""
    message=EmailMessage()
    message['Subject']='Подтвердите адрес электронной почты — Deckly.Ai'
    message['From']=settings.email_from
    message['To']=email
    message.set_content(
        'Здравствуйте!\n\n'
        'Подтвердите адрес электронной почты, чтобы завершить регистрацию в Deckly.Ai.\n\n'
        f'Подтвердить почту: {url}\n\n'
        'Ссылка действует 24 часа и может быть использована только один раз.\n\n'
        'Если вы не создавали аккаунт Deckly.Ai, просто проигнорируйте это письмо.'
    )
    safe_url=escape(url,quote=True)
    message.add_alternative(f'''<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Подтвердите адрес электронной почты — Deckly.Ai</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f1f5f9;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:24px 32px;background-color:#0f172a;color:#ffffff;">
            <div style="font-size:24px;font-weight:700;letter-spacing:-1px;">Deckly<span style="color:#ff817b;">.</span><span style="font-size:14px;">Ai</span></div>
          </td></tr>
          <tr><td style="padding:36px 32px 20px;">
            <div style="margin-bottom:12px;color:#0077ff;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Почти готово</div>
            <h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;letter-spacing:-0.7px;color:#0f172a;">Подтвердите почту</h1>
            <p style="margin:0;color:#526176;font-size:16px;line-height:1.6;">Подтвердите адрес электронной почты, чтобы завершить регистрацию и войти в Deckly.Ai.</p>
          </td></tr>
          <tr><td align="center" style="padding:12px 32px 28px;">
            <a href="{safe_url}" style="display:inline-block;padding:15px 28px;border-radius:9px;background-color:#0077ff;color:#ffffff;font-size:15px;font-weight:700;line-height:1.2;text-decoration:none;">Подтвердить почту</a>
          </td></tr>
          <tr><td style="padding:0 32px 28px;">
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.6;">Кнопка не работает? Скопируйте ссылку и откройте её в браузере:</p>
            <p style="margin:0;overflow-wrap:anywhere;word-break:break-word;font-size:13px;line-height:1.6;"><a href="{safe_url}" style="color:#0063d6;text-decoration:underline;">{safe_url}</a></p>
          </td></tr>
          <tr><td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
            <p style="margin:0 0 8px;color:#526176;font-size:13px;line-height:1.6;">Ссылка действует 24 часа и используется только один раз.</p>
            <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">Если вы не создавали аккаунт Deckly.Ai, просто проигнорируйте это письмо.</p>
          </td></tr>
        </table>
        <p style="margin:18px 0 0;color:#94a3b8;font-size:11px;line-height:1.5;">Ваши идеи. Ваш стиль. · Deckly.Ai</p>
      </td></tr>
    </table>
  </body>
</html>''',subtype='html')
    return message

def deliver_verification_email(email, url):
    """Send confirmation through SMTP; local development logs only the one-time URL."""
    if not settings.smtp_host or not settings.smtp_username or not settings.smtp_password or not settings.email_from:
        if settings.app_env == 'production':
            raise RuntimeError('SMTP для подтверждения email не настроен.')
        logger.warning('Email verification link for %s: %s', email, url)
        return 'logged'
    message=build_verification_email(email,url)
    with smtplib.SMTP_SSL(settings.smtp_host,settings.smtp_port,timeout=15) as server:
        server.login(settings.smtp_username,settings.smtp_password)
        server.send_message(message)
    return 'sent'

def create_verification(user_id,email):
    token=secrets.token_urlsafe(32);timestamp=int(time.time())
    with connection() as db:
        db.execute('''INSERT INTO email_verifications (user_id,token_hash,expires_at,last_sent_at)
          VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,
          expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at''',
          (user_id,digest(token),timestamp+VERIFICATION_TTL,timestamp))
    url=settings.public_url+'/#verify-email='+quote(token,safe='')
    return deliver_verification_email(email,url)

class VerificationToken(BaseModel):
    token: str=Field(min_length=32,max_length=256)

class ResendVerification(BaseModel):
    email: str=Field(min_length=3,max_length=254)
    @field_validator('email')
    @classmethod
    def valid_email(cls,value):
        value=value.strip().lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',value):raise ValueError('Укажите корректную электронную почту')
        return value

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
            db.execute('INSERT INTO users (id,email,first_name,last_name,password_hash,yandex_id,created_at,email_verified) VALUES (?,?,?,?,?,?,?,?)',
                       (user['id'],user['email'],user['first_name'],user['last_name'],encoded,None,user['created_at'],int(not settings.email_verification_required)))
    except sqlite3.IntegrityError:raise HTTPException(409,'Аккаунт с этой почтой уже существует. Войдите в него.')
    user['password_hash']=encoded
    user['email_verified']=not settings.email_verification_required
    if settings.email_verification_required:
        delivery_pending=False
        try:
            delivery_mode=create_verification(user['id'],user['email'])
        except (OSError,smtplib.SMTPException,RuntimeError) as exc:
            logger.exception('Unable to deliver email verification message')
            with connection() as db:
                db.execute('UPDATE email_verifications SET last_sent_at=0 WHERE user_id=?',(user['id'],))
            delivery_pending=True
        response.headers['Cache-Control']='no-store'
        return {'verification_required':True,'email':user['email'],
                'delivery_pending':delivery_pending,'delivery_mode':'pending' if delivery_pending else delivery_mode}
    return set_session(response,user,request)

@router.post('/login')
def login(data:Credentials,request:Request,response:Response):
    rate_limit(request)
    with connection() as db: row=db.execute('SELECT * FROM users WHERE email=?',(data.email,)).fetchone()
    if not password_valid(data.password,row['password_hash'] if row else None):raise HTTPException(401,'Неверная почта или пароль')
    if row['password_hash'] and not row['email_verified']:
        raise HTTPException(403,'Подтвердите адрес электронной почты по ссылке из письма.')
    return set_session(response,dict(row),request)

@router.post('/verify-email')
def verify_email(data:VerificationToken,response:Response):
    timestamp=int(time.time())
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        verification=db.execute('SELECT user_id,expires_at FROM email_verifications WHERE token_hash=?',(digest(data.token),)).fetchone()
        if not verification or verification['expires_at']<timestamp:
            if verification:db.execute('DELETE FROM email_verifications WHERE user_id=?',(verification['user_id'],))
            raise HTTPException(400,'Ссылка подтверждения недействительна или истекла. Запросите новое письмо.')
        db.execute('UPDATE users SET email_verified=1 WHERE id=?',(verification['user_id'],))
        db.execute('DELETE FROM email_verifications WHERE user_id=?',(verification['user_id'],))
    response.headers['Cache-Control']='no-store'
    return {'verified':True}

@router.post('/verification/resend')
def resend_verification(data:ResendVerification,request:Request):
    rate_limit(request)
    timestamp=int(time.time())
    with connection() as db:
        row=db.execute('''SELECT users.id,users.email,users.email_verified,email_verifications.last_sent_at
          FROM users LEFT JOIN email_verifications ON users.id=email_verifications.user_id
          WHERE users.email=? AND users.password_hash IS NOT NULL''',(data.email,)).fetchone()
        if row and not row['email_verified']:
            if row['last_sent_at'] is not None and timestamp-row['last_sent_at']<60:
                return {'ok':True}
            user_id,email=row['id'],row['email']
        else:
            return {'ok':True}
    try:
        delivery_mode=create_verification(user_id,email)
    except (OSError,smtplib.SMTPException,RuntimeError) as exc:
        logger.exception('Unable to resend email verification message')
        with connection() as db:
            db.execute('UPDATE email_verifications SET last_sent_at=0 WHERE user_id=?',(user_id,))
        raise HTTPException(503,'Не удалось отправить письмо. Попробуйте позже.') from exc
    return {'ok':True}

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

@router.get('/avatar')
def get_avatar(user=Depends(current_user)):
    if not user.get('avatar_image'): raise HTTPException(404, 'Фото профиля не загружено.')
    return Response(user['avatar_image'], media_type='image/png')

@router.post('/avatar')
async def upload_avatar(file: UploadFile, user=Depends(current_user)):
    try:
        data=await file.read(MAX_AVATAR_BYTES+1)
    finally:
        await file.close()
    normalized=await asyncio.to_thread(normalize_avatar,data)
    version=hashlib.sha256(normalized).hexdigest()[:20]
    with connection() as db:
        db.execute('UPDATE users SET avatar_image=?,avatar_version=? WHERE id=?',(normalized,version,user['id']))
    return public_user({**user,'avatar_version':version})

@router.delete('/avatar')
def remove_avatar(user=Depends(current_user)):
    with connection() as db:
        db.execute('UPDATE users SET avatar_image=NULL,avatar_version=NULL WHERE id=?',(user['id'],))
    return public_user({**user,'avatar_version':None})

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
