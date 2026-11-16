@echo off
chcp 65001 >nul
title التبديل إلى نمط الإنتاج (Production Mode)
cd /d "%~dp0AccountingNewteps-main"

echo ===================================================
echo     جاري التجميع والتحويل لنمط الإنتاج (Production)
echo    (النمط الأمثل للفروع وسرعة الـ 200 جهاز وموبايل)
echo ===================================================

echo 1. إيقاف الخدمة الحالية...
node scripts\service\stop_service.js

echo 2. بناء وتجميع الكود البرمجي (npm run build)...
call npm run build
if errorlevel 1 (
    echo [خطأ] فشلت عملية البناء والتجميع. راجع الأخطاء بالأعلى.
    pause
    exit /b 1
)

echo 3. إطلاق خادم الإنتاج المحسّن في الخلفية...
wscript.exe "%~dp0AccountingNewteps-main\scripts\service\start_service_silent.vbs"

echo 4. التحقق من جاهزية البرنامج على المنفذ 9002...
powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(60); while ((Get-Date) -lt $deadline) { $client=New-Object Net.Sockets.TcpClient; try { $client.Connect('127.0.0.1',9002); $client.Close(); exit 0 } catch { $client.Close(); Start-Sleep -Milliseconds 500 } }; exit 1"

if errorlevel 1 (
    echo [تنبيه] استغرق الخادم وقتاً للبدء. يرجى مراجعة logs\pos_service.log
) else (
    echo تم تشغيل البرنامج بنجاح بنمط الإنتاج الفائق (Production Mode)!
    start "" "http://localhost:9002"
)

pause
exit /b 0
