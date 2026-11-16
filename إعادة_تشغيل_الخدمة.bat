@echo off
chcp 65001 >nul
title إعادة تشغيل منظومة المحاسبة
cd /d "%~dp0AccountingNewteps-main"

echo إيقاف النسخة الحالية...
node scripts\service\stop_service.js
if errorlevel 1 (
    echo تعذر إيقاف الخدمة الحالية.
    pause
    exit /b 1
)

echo تشغيل البرنامج...
wscript.exe "%~dp0AccountingNewteps-main\scripts\service\start_service_silent.vbs"
echo في انتظار جاهزية البرنامج...
powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(60); while ((Get-Date) -lt $deadline) { $client=New-Object Net.Sockets.TcpClient; try { $client.Connect('127.0.0.1',9002); $client.Close(); exit 0 } catch { $client.Close(); Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 (
    echo تعذر الاتصال بالبرنامج خلال دقيقة.
    pause
    exit /b 1
)

start "" "http://localhost:9002"
echo تمت إعادة تشغيل البرنامج بنجاح.
pause
