"""Analytical review API. Generation remains in Deckly's existing job pipeline."""
import asyncio
from urllib.parse import quote
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from .auth import current_user
from .analytics_models import AnalyzeTextRequest, AnalysisSelection, AnalysisPlanRequest
from .services.analytics_ingest import ingest, AnalysisError, MAX_BYTES
from .services.analytics_profile import profile_dataset, profile_table, recommendations
from .services import analytics_store as store

router=APIRouter(prefix='/api/analysis',tags=['analysis'])


async def run_bounded(function,*args):
    try:
        return await asyncio.wait_for(asyncio.to_thread(function,*args),timeout=12)
    except asyncio.TimeoutError as exc:
        raise HTTPException(408,'Разбор занял слишком много времени. Разделите таблицу или сохраните её в CSV.') from exc
    except AnalysisError as exc:
        raise HTTPException(422,str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(404,'Набор данных не найден.') from exc


@router.get('')
async def list_datasets(user=Depends(current_user)):
    return await run_bounded(store.list_owned,user['id'])


@router.post('/upload')
async def upload(file:UploadFile=File(...),context:str=Form(default='',max_length=50000),intent:str=Form(default='',max_length=1000),user=Depends(current_user)):
    data=await file.read(MAX_BYTES+1)
    if len(data)>MAX_BYTES: raise HTTPException(413,'Размер файла превышает 8 МБ.')
    parsed=await run_bounded(ingest,data,file.filename or 'data.csv',context,intent)
    return await run_bounded(store.save,user['id'],parsed,data)


@router.post('/text')
async def text_table(body:AnalyzeTextRequest,user=Depends(current_user)):
    data=body.text.encode('utf-8')
    parsed=await run_bounded(ingest,data,body.name,body.context,body.intent)
    return await run_bounded(store.save,user['id'],parsed,data)


@router.get('/{dataset_id}')
async def read(dataset_id:str,user=Depends(current_user)):
    dataset=await run_bounded(store.get,user['id'],dataset_id)
    response=profile_dataset(dataset)
    response['selection']=dataset.get('selection')
    return response


@router.put('/{dataset_id}/selection')
async def choose(dataset_id:str,body:AnalysisSelection,user=Depends(current_user)):
    selected=await run_bounded(store.select,user['id'],dataset_id,body)
    dataset=await run_bounded(store.get,user['id'],dataset_id)
    table=next(t for t in dataset['tables'] if t['id']==body.table_id)
    profile=profile_table(table,body.roles,body.semantics)
    return {'selection':selected,'profile':profile,**recommendations(profile,body.intent)}


@router.post('/{dataset_id}/plan')
async def preview_plan(dataset_id:str,body:AnalysisPlanRequest,user=Depends(current_user)):
    result=await run_bounded(store.plan_owned,user['id'],dataset_id,body.selection)
    if body.template_id:
        # Use the same owner guard and rendering adapter as the regular editor.
        from .main import get_template
        from .models import Slide
        from .services.layout import build_scene
        from .services.brand_style import apply_brand
        template=get_template(body.template_id,user['id'])
        try: template=apply_brand(template,body.brand_style_id,user['id'],body.brand_prefer_template)
        except KeyError: raise HTTPException(404,'Брендбук не найден или недоступен.') from None
        index=min(body.preview_index,len(result['slides'])-1)
        scene=await run_bounded(build_scene,Slide.model_validate(result['slides'][index]),template['metadata'],'a',index)
        result['preview']={'scene':scene,'index':index,'template_id':body.template_id,'brand_style_id':body.brand_style_id,'brand_prefer_template':body.brand_prefer_template}
    return result


@router.get('/{dataset_id}/rows')
async def rows(dataset_id:str,table_id:str='t1',offset:int=Query(default=0,ge=0),limit:int=Query(default=100,ge=1,le=500),user=Depends(current_user)):
    dataset=await run_bounded(store.get,user['id'],dataset_id)
    table=next((t for t in dataset['tables'] if t['id']==table_id),None)
    if table is None: raise HTTPException(404,'Таблица не найдена.')
    return {'columns':table['columns'],'rows':table['rows'][offset:offset+limit], 'lineage':table['lineage'][offset:offset+limit],
            'total':len(table['rows']),'offset':offset,'limit':limit,'next_offset':offset+limit if offset+limit<len(table['rows']) else None}


@router.get('/{dataset_id}/source')
async def source(dataset_id:str,user=Depends(current_user)):
    name,original=await run_bounded(store.original,user['id'],dataset_id)
    return Response(original,media_type='application/octet-stream',headers={'Content-Disposition':f"attachment; filename*=UTF-8''{quote(name,safe='')}"})


@router.delete('/{dataset_id}')
async def delete(dataset_id:str,user=Depends(current_user)):
    await run_bounded(store.remove,user['id'],dataset_id)
    return {'deleted':True}
