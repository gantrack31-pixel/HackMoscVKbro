"""Development-only, pinned upstream import. No downloads during generation."""
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.icon_catalog import ICONS

REVISION = 'b568f9845ca633fa30918b31d166a4de9fe7edb2'
BASE = f'https://raw.githubusercontent.com/dariushhpg1/IconaMoon/{REVISION}/'
DEST = Path(__file__).resolve().parents[1] / 'app/assets/iconamoon'

def fetch(item):
    name, (category, stem, _) = item
    for extension, upstream in (
        ('png', f'PNG/192x192/Regular/{category}/{stem} - 192x192.png'),
        ('svg', f'SVG/Regular/{category}/{stem} - SVG.svg'),
    ):
        with urlopen(BASE + quote(upstream), timeout=30) as response:
            data = response.read()
        if extension == 'png' and not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError(f'Not a PNG: {upstream}')
        if extension == 'svg' and b'<svg' not in data:
            raise ValueError(f'Not an SVG: {upstream}')
        (DEST / f'{name}.{extension}').write_bytes(data)
    return name

if __name__ == '__main__':
    DEST.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        for name in pool.map(fetch, ICONS.items()):
            print(name)
