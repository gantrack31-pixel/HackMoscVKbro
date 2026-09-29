"""One keep-alive pool per application event loop; explicit clients stay injectable."""
import asyncio
from weakref import WeakKeyDictionary
import httpx

_clients = WeakKeyDictionary()

async def start():
    client=httpx.AsyncClient(follow_redirects=False,limits=httpx.Limits(max_connections=20,max_keepalive_connections=10))
    _clients[asyncio.get_running_loop()]=client

def get():
    return _clients.get(asyncio.get_running_loop())

async def close():
    client=_clients.pop(asyncio.get_running_loop(),None)
    if client: await client.aclose()
