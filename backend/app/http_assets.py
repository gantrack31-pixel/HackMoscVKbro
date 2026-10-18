"""Serve public build assets efficiently; private images always revalidate access."""
import mimetypes
from pathlib import Path
import re
import stat

from fastapi import HTTPException
from starlette.middleware.gzip import GZipMiddleware
from starlette.datastructures import Headers
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles, NotModifiedResponse

_HASHED_ASSET = re.compile(r'^assets/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$')
_FONT_TYPES = {'.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf'}
_COMPRESSIBLE = {'.js', '.css', '.html', '.svg', '.json'}
_validators = StaticFiles()


def _encodings(value: str) -> list[str]:
    qualities = {}
    for item in value.lower().split(','):
        encoding, *parameters = item.strip().split(';')
        quality = 1.0
        for parameter in parameters:
            key, _, amount = parameter.strip().partition('=')
            if key == 'q':
                try:
                    quality = float(amount)
                except ValueError:
                    quality = 0.0
        qualities[encoding.strip()] = quality if 0 <= quality <= 1 else 0.0
    candidates = ['br', 'gzip']
    return sorted(
        (encoding for encoding in candidates
         if qualities.get(encoding, qualities.get('*', 0)) > 0
         and qualities.get(encoding, qualities.get('*', 0)) >= qualities.get('identity', 0)),
        key=lambda encoding: -qualities.get(encoding, qualities.get('*', 0)),
    )


class FrontendStaticFiles(StaticFiles):
    """Negotiate prebuilt sidecars without compressing on the request thread."""

    async def get_response(self, path, scope):
        if Path(path).suffix in {'.br', '.gz'}:
            raise HTTPException(404)
        return await super().get_response(path, scope)

    def file_response(self, full_path, stat_result, scope, status_code=200):
        original = Path(full_path)
        request_headers = Headers(scope=scope)
        representation = original
        encoding = None
        if original.suffix in _COMPRESSIBLE and 'range' not in request_headers:
            for candidate in _encodings(request_headers.get('accept-encoding', '')):
                sidecar = original.with_name(original.name + ('.br' if candidate == 'br' else '.gz'))
                try:
                    sidecar_stat = sidecar.stat()
                except OSError:
                    continue
                if (stat.S_ISREG(sidecar_stat.st_mode) and sidecar_stat.st_size < stat_result.st_size
                        and sidecar_stat.st_mtime_ns >= stat_result.st_mtime_ns):
                    representation, stat_result, encoding = sidecar, sidecar_stat, candidate
                    break
        path = original.relative_to(Path(self.directory).resolve()).as_posix()
        cache_control = ('no-store' if original.suffix == '.html' else
                         'public, max-age=31536000, immutable' if _HASHED_ASSET.fullmatch(path) else 'no-cache')
        response = FileResponse(representation, status_code=status_code, stat_result=stat_result,
                                media_type=_FONT_TYPES.get(original.suffix) or mimetypes.guess_type(str(original))[0],
                                headers={'Cache-Control': cache_control, 'Vary': 'Accept-Encoding'})
        if encoding:
            response.headers['Content-Encoding'] = encoding
        if cache_control != 'no-store' and self.is_not_modified(response.headers, request_headers):
            return NotModifiedResponse(response.headers)
        return response


def private_image_response(path: Path, request):
    response = _validators.file_response(path, path.stat(), request.scope)
    response.headers['Cache-Control'] = 'private, no-cache'
    return response


_JSON_ROUTES = re.compile(
    r'^/api/(?:public/templates|templates|projects(?:/[^/]+(?:/(?:undo|redo|fix|assistant|preview))?)?)$'
)


class JsonCompressionMiddleware:
    """Compress large catalog/deck JSON, leaving auth tokens and binary exports alone."""

    def __init__(self, app):
        self.app = app
        self.compressed = GZipMiddleware(app, minimum_size=1024, compresslevel=3)

    async def __call__(self, scope, receive, send):
        compress = (scope['type'] == 'http' and _JSON_ROUTES.fullmatch(scope['path'])
                    and 'gzip' in _encodings(Headers(scope=scope).get('accept-encoding', '')))
        await (self.compressed if compress else self.app)(scope, receive, send)
