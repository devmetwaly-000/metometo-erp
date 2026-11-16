@echo off
setlocal
title Build and start the program

cd /d "%~dp0AccountingNewteps-main"
if not exist package.json goto no_project
where node >nul 2>nul
if errorlevel 1 goto no_node
where npm >nul 2>nul
if errorlevel 1 goto no_npm

echo Stopping the app before building...
node scripts\service\stop_service.js

echo.
echo Building the app...
call npm run build
if errorlevel 1 goto build_failed

echo.
echo Build completed. Starting the app...
start "" wscript.exe "%~dp0AccountingNewteps-main\scripts\service\start_service_silent.vbs"
powershell -NoProfile -Command "$d=(Get-Date).AddSeconds(60); do { $c=New-Object Net.Sockets.TcpClient; try { $c.Connect('127.0.0.1',9002); $c.Close(); exit 0 } catch { $c.Close(); Start-Sleep -Milliseconds 500 } } while ((Get-Date) -lt $d); exit 1"
if errorlevel 1 goto start_failed
start "" "http://localhost:9002"
echo Build and startup completed.
pause
exit /b 0

:no_project
echo ERROR: package.json was not found in the app folder.
goto failed

:no_node
echo ERROR: Node.js is missing or is not in PATH.
goto failed

:no_npm
echo ERROR: npm is missing or is not in PATH.
goto failed

:build_failed
echo ERROR: Build failed. Read the build output above.
goto failed

:start_failed
echo ERROR: Build succeeded, but the app did not start on port 9002.
goto failed

:failed
pause
exit /b 1
