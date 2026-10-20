"""Repair static-instance names without changing outlines or advance widths.

Development-only: requires fontTools; the application does not depend on it.
The bundled instances retained the variable font's ExtraLight names, preventing
Office from distinguishing the regular and bold faces when embedded.
"""
from pathlib import Path
from fontTools.ttLib import TTFont


def prepare(path, bold):
    font = TTFont(path, recalcTimestamp=False)
    style = 'Bold' if bold else 'Regular'
    names = {1: 'Manrope', 2: style, 3: f'Manrope-{style}-4.505',
             4: f'Manrope {style}', 6: f'Manrope-{style}', 16: 'Manrope', 17: style}
    for name_id, value in names.items():
        for record in list(font['name'].names):
            if record.nameID == name_id:
                font['name'].setName(value, name_id, record.platformID, record.platEncID, record.langID)
        font['name'].setName(value, name_id, 3, 1, 0x409)
    font['OS/2'].fsSelection = (font['OS/2'].fsSelection & ~0x60) | (0x20 if bold else 0x40)
    font['head'].macStyle = (font['head'].macStyle & ~1) | int(bold)
    font.save(path)


if __name__ == '__main__':
    folder = Path(__file__).resolve().parents[1] / 'backend/app/services'
    prepare(folder / 'Manrope-Regular.ttf', False)
    prepare(folder / 'Manrope-Bold.ttf', True)
