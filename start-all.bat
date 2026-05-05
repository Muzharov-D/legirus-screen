@echo off
REM Запуск backend + frontend dev в двух отдельных окнах cmd.
REM Не закрывай открывшиеся окна — иначе процессы умрут.

echo Killing old node on :4000 and :5173 if any...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

start "AvanData Backend" cmd /k "cd /d %~dp0backend && npm start"
timeout /t 2 /nobreak >nul
start "AvanData Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Two cmd windows opened: backend (:4000) and frontend (:5173).
echo Wait ~10 seconds, then open http://localhost:5173/
echo.
pause
