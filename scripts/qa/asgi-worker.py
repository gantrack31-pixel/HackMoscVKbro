"""Bounded QA worker: real ASGI handlers, temporary storage, no listening socket."""
import os,sys,json,base64,traceback
from tempfile import mkdtemp
from pathlib import Path
root=Path(__file__).resolve().parents[2]
qa=Path(mkdtemp(prefix='deckly-acceptance-'))
qa.mkdir(parents=True,exist_ok=True)
os.environ.update(CLOUD_DATABASE_URL='',YANDEX_CLIENT_ID='',YANDEX_CLIENT_SECRET='',EMAIL_FROM='',ALLOW_DEMO_IN_PRODUCTION='false',LLM_BASE_URL='http://127.0.0.1:1/v1')
os.environ.update(DATABASE_PATH=str(qa/'qa.sqlite'),STORAGE_PATH=str(qa/'storage'),LLM_MODE='demo',APP_ENV='development',EMAIL_VERIFICATION_REQUIRED='false',LLM_API_KEY='',LLM_PROJECT_ID='',IMAGE_API_KEY='',IMAGE_BASE_URL='',SMTP_HOST='',SMTP_USERNAME='',SMTP_PASSWORD='',PUBLIC_BASE_URL=os.environ.get('DECKLY_QA_STATIC_URL','http://127.0.0.1:8003'))
sys.path.insert(0,str(root/'backend'))
from fastapi.testclient import TestClient
from app.main import app
with TestClient(app,base_url=os.environ.get('DECKLY_QA_STATIC_URL','http://127.0.0.1:8003')) as client:
    auth=client.post('/api/auth/register',json={'email':'end-to-end@example.test','password':'Deckly-demo-2026!test','first_name':'Демо','last_name':'Аналитика'})
    if auth.status_code!=201:auth=client.post('/api/auth/login',json={'email':'end-to-end@example.test','password':'Deckly-demo-2026!test'})
    if auth.status_code not in (200,201):raise RuntimeError(auth.text)
    print(json.dumps({'ready':True,'auth':auth.json()},ensure_ascii=False),flush=True)
    for line in sys.stdin:
        try:
            message=json.loads(line)
            headers={k:v for k,v in message.get('headers',{}).items() if k.lower() in ('content-type','x-csrf-token','x-ai-operation-id','origin')}
            result=client.request(message.get('method','GET'),message['path'],headers=headers,content=base64.b64decode(message.get('body','')))
            response={'id':message['id'],'status':result.status_code,'headers':{k:v for k,v in result.headers.items() if k.lower() not in ('content-length','content-encoding','transfer-encoding','set-cookie')},'body':base64.b64encode(result.content).decode()}
            print(json.dumps(response),flush=True)
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({'id':message.get('id'),'error':str(exc)}),flush=True)
