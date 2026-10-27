@echo off
echo Starte lokalen Redis-Server (Port 6379)...
start "VurKac Pro Redis" /min "C:\Users\Eymen\AppData\Local\Programs\Python\Python312\python.exe" "%~dp0backend\redis_server.py"
timeout /t 2 /nobreak >nul

echo Starte FastAPI Realtime Backend (Port 8000)...
cd /d "%~dp0backend\app"
start "VurKac Pro FastAPI" /min "C:\Users\Eymen\AppData\Local\Programs\Python\Python312\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000

echo.
echo Alle Backend-Services laufen!
echo - Redis:   redis://localhost:6379
echo - FastAPI: http://localhost:8000/api/deals/recent
echo - WebUI:   http://localhost:3000
