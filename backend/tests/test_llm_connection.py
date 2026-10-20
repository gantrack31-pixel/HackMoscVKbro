"""Transport resilience of the single provider call, without a real provider."""
import asyncio
import json
import httpx
import pytest
from app.config import _llm_base_url, settings
from app.services import llm


@pytest.mark.parametrize('suffix', ['', '/', '/chat/completions', '/chat/completions/'])
def test_llm_base_url_accepts_root_and_full_endpoint(suffix):
    root = 'https://provider.example/v1'
    assert _llm_base_url(root + suffix) == root
    assert _llm_base_url(root + suffix) + '/chat/completions' == root + '/chat/completions'


def sse(*events):
    return ''.join(f'data: {json.dumps(event)}\n\n' for event in events)+'data: [DONE]\n\n'


class FlakyClient(httpx.AsyncClient):
    """Fails the first calls at the transport level, then answers; records request bodies."""
    def __init__(self, failures, reply=None):
        self.failures=list(failures); self.calls=0; self.bodies=[]
        self.reply=reply or (lambda request: httpx.Response(200,json={'choices':[{'message':{'content':'{"ok": true}'},'finish_reason':'stop'}]}))
        super().__init__(transport=httpx.MockTransport(self.handle))
    async def handle(self, request):
        self.calls+=1; self.bodies.append(json.loads(request.content))
        if self.failures:
            raise self.failures.pop(0)(f'provider dropped call {self.calls}',request=request)
        return self.reply(request)


def streamed(*events):
    return lambda request: httpx.Response(200,headers={'content-type':'text/event-stream'},content=sse(*events).encode())


@pytest.fixture(autouse=True)
def provider(monkeypatch):
    monkeypatch.setattr(settings,'base_url','https://provider.example/v1')
    monkeypatch.setattr(settings,'model','test-model')
    monkeypatch.setattr(settings,'api_key','test-key')
    async def instant(_): return None
    monkeypatch.setattr(llm.asyncio,'sleep',instant)


@pytest.mark.parametrize('failure',[httpx.RemoteProtocolError,httpx.ReadError,httpx.ConnectError])
def test_dropped_connection_is_resent_once(failure):
    client=FlakyClient([failure])
    assert asyncio.run(llm.complete_json('system',{'task':'x'},client=client))=={'ok':True}
    assert client.calls==2


def test_second_drop_reports_connection_error():
    client=FlakyClient([httpx.RemoteProtocolError,httpx.RemoteProtocolError])
    with pytest.raises(llm.LLMError,match='Сервис модели временно недоступен'):
        asyncio.run(llm.complete_json('system',{'task':'x'},client=client))
    assert client.calls==2


def test_timeouts_are_not_resent():
    client=FlakyClient([httpx.ReadTimeout])
    with pytest.raises(llm.LLMError,match='лимита времени'):
        asyncio.run(llm.complete_json('system',{'task':'x'},client=client))
    assert client.calls==1


def test_requests_stream_and_joins_sse_chunks():
    client=FlakyClient([],streamed(
        {'choices':[{'delta':{'role':'assistant'}}]},
        {'choices':[{'delta':{'content':'{"ok": '}}]},
        {'choices':[{'delta':{'content':'true}'},'finish_reason':'stop'}]},
        {'choices':[],'usage':{'prompt_tokens':5,'completion_tokens':3}}))
    assert asyncio.run(llm.complete_json('system',{'task':'x'},client=client))=={'ok':True}
    assert client.bodies[0]['stream'] is True


def test_stream_can_be_disabled(monkeypatch):
    monkeypatch.setattr(settings,'stream',False)
    client=FlakyClient([])
    assert asyncio.run(llm.complete_json('system',{'task':'x'},client=client))=={'ok':True}
    assert 'stream' not in client.bodies[0]


def test_stream_dropped_midway_is_resent_once():
    attempts=[]
    def reply(request):
        attempts.append(1)
        if len(attempts)==1:
            class Broken(httpx.AsyncByteStream):
                async def __aiter__(self):
                    yield sse({'choices':[{'delta':{'content':'{"ok"'}}]}).split('data: [DONE]')[0].encode()
                    raise httpx.RemoteProtocolError('peer closed connection',request=request)
            return httpx.Response(200,headers={'content-type':'text/event-stream'},stream=Broken())
        return streamed({'choices':[{'delta':{'content':'{"ok": true}'},'finish_reason':'stop'}]})(request)
    client=FlakyClient([],reply)
    assert asyncio.run(llm.complete_json('system',{'task':'x'},client=client))=={'ok':True}
    assert client.calls==2


def test_stream_truncated_by_token_limit():
    client=FlakyClient([],streamed({'choices':[{'delta':{'content':'{"ok": '},'finish_reason':'length'}]}))
    with pytest.raises(llm.LLMTruncatedError):
        asyncio.run(llm.complete_json('system',{'task':'x'},client=client))


def test_stream_error_event_is_reported_without_key():
    client=FlakyClient([],streamed({'error':{'message':'upstream failed for test-key'}}))
    with pytest.raises(llm.LLMError,match='Сервис модели прервал ответ') as error:
        asyncio.run(llm.complete_json('system',{'task':'x'},client=client))
    assert 'test-key' not in str(error.value)
