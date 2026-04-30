@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ============================================================
echo   Запуск Claude Code в проекте «Экран Легирус»
echo ============================================================
echo.
echo Папка: %CD%
echo.
echo После запуска вставь в чат содержимое файла CODE_PROMPT.txt
echo (открывается рядом). Или просто скажи Code:
echo.
echo   "Прочитай START_HERE.md и реализуй MVP по TASK_SPEC_FOR_CODE.md"
echo.
echo ============================================================
echo.

REM Открываем CODE_PROMPT.txt в блокноте чтобы было удобно скопировать
start notepad CODE_PROMPT.txt

REM Запускаем Claude Code в этой папке
claude
