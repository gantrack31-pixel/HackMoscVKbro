"""Store only decoded, resized PNG pixels, never original uploads or metadata."""
from io import BytesIO
import warnings
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import HTTPException

MAX_AVATAR_BYTES = 5 * 1024 * 1024

def normalize_avatar(data: bytes) -> bytes:
    if not data or len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(413, 'Выберите изображение до 5 МБ.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data), formats=('JPEG', 'PNG', 'WEBP')) as source:
                if max(source.size) > 4096 or min(source.size) < 1:
                    raise HTTPException(422, 'Размер изображения не должен превышать 4096 × 4096 пикселей.')
                source.load()
                portrait = ImageOps.fit(ImageOps.exif_transpose(source).convert('RGBA'), (256, 256), Image.Resampling.LANCZOS)
                # A fresh image drops EXIF, comments and other source metadata.
                clean = Image.new('RGBA', portrait.size)
                clean.paste(portrait)
                output = BytesIO()
                clean.save(output, format='PNG')
                return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, 'Не удалось прочитать фото. Выберите корректный JPG, PNG или WebP.') from None
