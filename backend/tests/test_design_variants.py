"""Design variants are planned by three independent, concurrent model requests."""
import asyncio
import pytest
from app.config import settings
from app.models import DeckContent, Slide
from app.services import llm

TEMPLATE={'id':'tech','name':'Test','metadata':{'ratio':16/9}}
CONTENT=DeckContent(title='Обзор',slides=[Slide(title='Обзор',kind='title'),Slide(title='Контекст',body='Текст')])
STYLE={'a':'editorial','b':'split','c':'grid'}


def plan(composition,density='balanced'):
    return {'slides':[{'slide':i,'design':{'composition':composition,'density':density,'layout_shift':0}} for i in range(2)]}


@pytest.fixture(autouse=True)
def live(monkeypatch):
    monkeypatch.setattr(settings,'mode','live')


def run(monkeypatch,respond):
    calls=[]
    async def recorder(system,payload,template,**kwargs):
        calls.append(dict(payload)); return await respond(payload,calls)
    monkeypatch.setattr(llm,'complete_with_template',recorder)
    return asyncio.run(llm.create_design_variants(CONTENT,TEMPLATE)),calls


def test_variants_are_requested_concurrently_each_with_its_role(monkeypatch):
    arrived=[]; all_here=asyncio.Event()
    async def respond(payload,calls):
        arrived.append(payload['variant'])
        if len(arrived)==3: all_here.set()
        # Each request waits for the others: this only completes if all three are in flight.
        await asyncio.wait_for(all_here.wait(),2)
        return plan(STYLE[payload['variant']])
    result,calls=run(monkeypatch,respond)
    assert sorted(c['variant'] for c in calls)==['a','b','c']
    assert {c['variant']:c['variant_role'] for c in calls}=={'a':'классический','b':'акцентный','c':'минималистичный'}
    assert all(c['schema']['title']=='DesignPlan' for c in calls)
    assert {v:d.composition for v,d in result.slides[1].designs.items()}==STYLE


def test_only_the_failed_variant_is_retried(monkeypatch):
    async def respond(payload,calls):
        if payload['variant']=='b' and 'format_correction' not in payload: return {'slides':[]}
        return plan(STYLE[payload['variant']])
    result,calls=run(monkeypatch,respond)
    assert sorted(c['variant'] for c in calls)==['a','b','b','c']
    assert result.slides[0].designs['b'].composition=='split'


def test_duplicate_plan_rerequests_one_variant(monkeypatch):
    async def respond(payload,calls):
        if payload['variant']=='c' and 'format_correction' not in payload: return plan('editorial')
        return plan(STYLE[payload['variant']])
    result,calls=run(monkeypatch,respond)
    assert sorted(c['variant'] for c in calls)==['a','b','c','c']
    assert 'совпал' in calls[-1]['format_correction']
    assert result.slides[0].designs['c'].composition=='grid'


def test_full_three_plan_answer_is_narrowed_to_the_requested_variant(monkeypatch):
    async def respond(payload,calls): return {v:plan(STYLE[v]) for v in 'abc'}
    result,calls=run(monkeypatch,respond)
    assert len(calls)==3 and {v:d.composition for v,d in result.slides[0].designs.items()}==STYLE


def test_variant_failing_twice_reports_error(monkeypatch):
    async def respond(payload,calls):
        return {'slides':[]} if payload['variant']=='a' else plan(STYLE[payload['variant']])
    with pytest.raises(llm.LLMError,match='три корректные композиции'):
        run(monkeypatch,respond)
