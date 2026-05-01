@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)
set PORT=1024
call "%~dp0stop-tool.bat" --quiet
start "" cmd /c "timeout /t 1 /nobreak >nul && start "" http://127.0.0.1:%PORT%/"
node server.js
call "%~dp0stop-tool.bat" --quiet
pause
