"""Optional FLUX.1-schnell (12B) service. No remote URL downloads from model output."""
import base64
import asyncio
from io import BytesIO
from urllib.parse import urlparse
import httpx
from PIL import Image
from fastapi import HTTPException
from ..config import settings
from . import provider_http

MODEL = 'black-forest-labs/FLUX.1-schnell'

async def generate_image(prompt, client=None):
    url=urlparse(settings.image_base_url)
    if not settings.image_base_url:
        raise HTTPException(409, 'Генератор изображений не подключён. Укажите IMAGE_BASE_URL сервиса FLUX.1-schnell.')
    if url.scheme!='https' and not (url.scheme=='http' and url.hostname in {'localhost','127.0.0.1','::1'}):
        raise HTTPException(409, 'Генератор изображений требует HTTPS или локальный сервер.')
    if url.username or url.password or url.query or url.fragment:
        raise HTTPException(409, 'Адрес генератора изображений не должен содержать секреты или query.')
    client=client or provider_http.get()
    owned=client is None
    transport=client or httpx.AsyncClient(timeout=100,follow_redirects=False)
    try:
        headers={'Authorization':'Bearer '+settings.image_api_key} if settings.image_api_key else {}
        async with asyncio.timeout(100), transport.stream('POST',settings.image_base_url+'/generate',headers=headers,
                                    json={'prompt':prompt,'model':MODEL,'steps':4,'size':512},
                                    timeout=httpx.Timeout(100,connect=15,pool=15)) as response:
            if response.status_code!=200:
                raise HTTPException(502, 'Генератор изображения недоступен. Проверьте сервер FLUX.')
            data=bytearray()
            async for chunk in response.aiter_bytes():
                data.extend(chunk)
                if len(data)>1024*1024:raise HTTPException(502,'Изображение превышает допустимый размер.')
        with Image.open(BytesIO(data),formats=['PNG','JPEG','WEBP']) as im:
            if max(im.size)>1024: raise ValueError('dimensions')
            im.load()
            im.thumbnail((768,768))
            clean=Image.new('RGB',im.size);clean.paste(im.convert('RGB'))
            output=BytesIO();clean.save(output,format='PNG')
        if len(output.getvalue())>1000000: raise ValueError('size')
        return {'image_data':'data:image/png;base64,'+base64.b64encode(output.getvalue()).decode(),
                'model':MODEL,'parameters_billion':12}
    except HTTPException: raise
    except Exception: raise HTTPException(502,'Не удалось получить корректное изображение от FLUX.') from None
    finally:
        if owned: await transport.aclose()

async def fill_missing_images(content, *, slide_indices=None):
    from .operations import checkpoint
    slots=asyncio.Semaphore(settings.image_concurrency)
    async def fill(slide, element=None):
        async with slots:
            checkpoint()
            result=await generate_image(element.image_prompt if element else slide.image_prompt)
            if element: slide.element_images[element.id]=result['image_data']
            else: slide.image_data=result['image_data']
    slides=[slide for i,slide in enumerate(content.slides) if slide_indices is None or i in slide_indices]
    tasks=[asyncio.create_task(fill(slide)) for slide in slides
           if slide.kind=='image' and slide.image_prompt and not slide.image_data and not slide.template_asset_id]
    tasks += [asyncio.create_task(fill(slide, element)) for slide in slides for element in slide.elements
              if element.type == 'image' and element.image_prompt and not element.template_asset_id
              and not element.resource_id and not slide.element_images.get(element.id)]
    try:
        if tasks: await asyncio.gather(*tasks)
    finally:
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
