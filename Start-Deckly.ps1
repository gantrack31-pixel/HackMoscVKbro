$ErrorActionPreference = 'Stop'
$backendPath = Join-Path $PSScriptRoot 'backend'
$pythonPath = Join-Path $backendPath '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $pythonPath)) {
    throw 'Сначала выполните установку из README.md: создайте .venv и установите requirements.txt.'
}
if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'frontend/dist/index.html'))) {
    throw 'Не найдена сборка интерфейса. Выполните pnpm build в папке frontend.'
}
Write-Host 'Deckly.Ai: http://127.0.0.1:8000. Для остановки нажмите Ctrl+C.'
Push-Location $backendPath
try { & $pythonPath -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log }
finally { Pop-Location }
