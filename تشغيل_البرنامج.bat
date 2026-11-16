@echo off
chcp 65001 >nul
title تشغيل منظومة المحاسبة ونقاط البيع
cd /d "%~dp0AccountingNewteps-main"

if not exist "scripts\service\start_service_silent.vbs" (
    echo تعذر العثور على ملفات تشغيل البرنامج.
    pause
    exit /b 1
)

sc query MSSQLSERVER | find /I "RUNNING" >nul
if errorlevel 1 (
    echo جاري تشغيل خدمة قاعدة البيانات...
    net start MSSQLSERVER
)

echo جاري تشغيل البرنامج...
wscript.exe "%~dp0AccountingNewteps-main\scripts\service\start_service_silent.vbs"
echo في انتظار جاهزية البرنامج...
powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(60); while ((Get-Date) -lt $deadline) { $client=New-Object Net.Sockets.TcpClient; try { $client.Connect('127.0.0.1',9002); $client.Close(); exit 0 } catch { $client.Close(); Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 (
    echo تعذر الاتصال بالبرنامج. راجع تشغيل قاعدة البيانات وسجل الخدمة.
    pause
    exit /b 1
)

start "" "http://localhost:9002"
exit /b 0
