"""Isolated entrypoint; never imports settings or the application's .env."""
from pathlib import Path
import json
import sys

# -I excludes ambient PYTHONPATH; allow only this trusted parser directory.
sys.path.insert(0,str(Path(__file__).resolve().parent))
try:
    import resource
    resource.setrlimit(resource.RLIMIT_AS,(512*1024*1024,512*1024*1024))
    resource.setrlimit(resource.RLIMIT_CPU,(10,10))
except ImportError:
    pass  # Windows uses wall timeout + strict byte/node/page bounds.

from brand_parser import parse_brand,BrandError

if __name__=='__main__':
    try:
        result={'result':parse_brand(Path(sys.argv[1]).read_bytes(),sys.argv[2])}
    except BrandError as exc:
        result={'error':str(exc)}
    except Exception:
        result={'error':'Не удалось прочитать стиль. Проверьте формат или загрузите JSON с точными токенами.'}
    Path(sys.argv[3]).write_text(json.dumps(result,ensure_ascii=False,allow_nan=False),encoding='utf-8')
