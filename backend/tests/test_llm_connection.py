"""Transport resilience of the single provider call, without a real provider."""
import asyncio
import httpx
import pytest
from app.config import settings
from app.services import llm


class FlakyClient:
    def __init__(self, failures):
        self.failures=list(failures); self.calls=0
    async def post(self, url, **kwargs):
        self.calls+=1
        request=httpx.Request('POST',url)
        if self.failures:
            raise self.failures.pop(0)(f'provider dropped call {self.calls}',request=request)
        return httpx.Response(200,request=request,json={'choices':[{'message':{'content':'{"ok": true}'},'finish_reason':'stop'}]})


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
    with pytest.raises(llm.LLMError,match='Не удалось подключиться к LLM'):
        asyncio.run(llm.complete_json('system',{'task':'x'},client=client))
    assert client.calls==2


def test_timeouts_are_not_resent():
    client=FlakyClient([httpx.ReadTimeout])
    with pytest.raises(llm.LLMError,match='лимита времени'):
        asyncio.run(llm.complete_json('system',{'task':'x'},client=client))
    assert client.calls==1
