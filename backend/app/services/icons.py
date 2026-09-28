"""Local, theme-aware IconaMoon assets; one raster source for every exporter."""
import base64
from functools import lru_cache
from io import BytesIO
from pathlib import Path
import re
from PIL import Image
from ..icon_catalog import ICONS

ASSETS = Path(__file__).resolve().parents[1] / 'assets/iconamoon'
ATTRIBUTION = 'Icons: IconaMoon by Dariush Habibpour (CC BY 4.0); theme recoloring. https://github.com/dariushhpg1/IconaMoon'

@lru_cache(maxsize=256)
def icon_data(name: str, color: str) -> str:
    if name not in ICONS or not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
        raise ValueError('Unknown icon or invalid theme color')
    with Image.open(ASSETS / f'{name}.png') as original:
        image = Image.new('RGBA', original.size, color)
        image.putalpha(original.convert('RGBA').getchannel('A'))
    output = BytesIO()
    image.save(output, format='PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode()

def choose_icon(label: str) -> str | None:
    """Conservative offline fallback; an unrelated bullet gets no random icon."""
    rules = [
        ('heart', r'здоров|гигиен|забот'), ('shield', r'защит|безопас|надёж|надеж'),
        ('people', r'команд|аудитор|люд|сотрудник'), ('clock', r'врем|срок|скорост'),
        ('education', r'обуч|образован|студент|школ'), ('growth', r'рост|прогресс|динамик'),
        ('calculator', r'бюджет|расчёт|расчет|эконом'), ('search', r'исслед|поиск|анализ'),
        ('target', r'цел[ьи]|результат'), ('idea', r'иде[яи]|инновац'),
        ('check', r'проверк|качеств|готов'), ('document', r'отчёт|отчет|документ'),
        ('calendar', r'план|расписан'), ('chat', r'обсужд|обратн.*связ'),
    ]
    return next((name for name, pattern in rules if re.search(pattern, label, re.I)), None)
