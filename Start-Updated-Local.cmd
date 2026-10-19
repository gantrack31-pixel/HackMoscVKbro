@echo off
cd /d "%~dp0backend"
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8003 --no-access-log
pause
