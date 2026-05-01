@echo off
setlocal
set PORT=1024
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
  taskkill /pid %%p /f >nul 2>nul
)
if /i not "%~1"=="--quiet" (
  echo Port %PORT% has been cleared.
  pause
)
endlocal
