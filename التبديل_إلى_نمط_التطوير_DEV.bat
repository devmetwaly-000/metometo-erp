@echo off
chcp 65001 >nul
title التبديل إلى نمط التطوير (Development Mode)
cd /d "%~dp0AccountingNewteps-main"

echo ===================================================
echo     جاري التحويل إلى نمط التطوير (Development Mode)
echo ===================================================
echo 1. إيقاف الخدمة الحالية...
node scripts\service\stop_service.js

echo 2. حذف ملفات التجميع المسبق للعودة إلى وضع التحديث الحي...
if exist ".next" (
    rd /s /q ".next"
)

echo 3. تشغيل الخدمة في وضع التطوير الحي...
wscript.exe "%~dp0AccountingNewteps-main\scripts\service\start_service_silent.vbs"

echo 4. التحقق من جاهزية البرنامج على المنفذ 9002...
powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(60); while ((Get-Date) -lt $deadline) { $client=New-Object Net.Sockets.TcpClient; try { $client.Connect('127.0.0.1',9002); $client.Close(); exit 0 } catch { $client.Close(); Start-Sleep -Milliseconds 500 } }; exit 1"

if errorlevel 1 (
    echo [تنبيه] استغرق الخادم وقتاً أطول للبدء. يرجى مراجعة logs\pos_service.log
) else (
    echo تم تشغيل البرنامج بنجاح في نمط التطوير (Development Mode)!
    start "" "http://localhost:9002"
)

pause
exit /b 0
