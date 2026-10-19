"""Authenticated, local-only brand ingestion. No external Figma requests."""
import asyncio
from urllib.parse import quote
from fastapi import APIRouter,Depends,File,UploadFile,HTTPException
from fastapi.responses import Response
from pydantic import BaseModel,Field
from .auth import current_user
from .services import brand_style as service
from .services.brand_parser import BrandError,MAX_BYTES

router=APIRouter(prefix='/api/brands',tags=['brands'])


async def run(function,*args):
    try:return await asyncio.to_thread(function,*args)
    except BrandError as exc:raise HTTPException(422,str(exc)) from exc
    except KeyError as exc:raise HTTPException(404,'Стиль не найден.') from exc


@router.get('')
async def styles(user=Depends(current_user)):
    return await run(service.list_owned,user['id'])


@router.post('/upload',status_code=201)
async def upload(file:UploadFile=File(...),user=Depends(current_user)):
    data=await file.read(MAX_BYTES+1)
    if len(data)>MAX_BYTES:raise HTTPException(413,'Максимальный размер файла стиля — 8 МБ.')
    return await run(service.upload,user['id'],data,file.filename or 'style.json')


class CombineStyles(BaseModel):
    brand_ids:list[str]=Field(min_length=2,max_length=8)
    name:str=Field(default='Объединённый стиль',min_length=1,max_length=120)


class PreviewStyle(BaseModel):
    template_id:str=Field(min_length=1,max_length=80)
    prefer_template:bool=False


@router.post('/combine',status_code=201)
async def combine(body:CombineStyles,user=Depends(current_user)):
    return await run(service.combine,user['id'],body.brand_ids,body.name)


@router.post('/{brand_id}/preview')
async def preview(brand_id:str,body:PreviewStyle,user=Depends(current_user)):
    from .main import get_template
    template=get_template(body.template_id,user['id'])
    effective=await run(service.apply_brand,template,brand_id,user['id'],body.prefer_template)
    metadata=effective['metadata']
    return {'brand_style':metadata['brand_style'],'effective':metadata['brand_style']['effective'],
            'palette':metadata.get('palette',[]),'warnings':metadata.get('warnings',[]),
            'logo':{key:metadata['brand_logo'].get(key) for key in ('name','src','width','height','placement','clear_space')} if metadata.get('brand_logo') else None}


@router.get('/{brand_id}')
async def read(brand_id:str,user=Depends(current_user)):
    return await run(service.get,user['id'],brand_id)


@router.get('/{brand_id}/source')
async def source(brand_id:str,user=Depends(current_user)):
    name,data=await run(service.original,user['id'],brand_id)
    return Response(data,media_type='application/octet-stream',headers={'Content-Disposition':f"attachment; filename*=UTF-8''{quote(name,safe='')}"})


@router.delete('/{brand_id}')
async def delete(brand_id:str,user=Depends(current_user)):
    await run(service.remove,user['id'],brand_id)
    return {'deleted':True}
