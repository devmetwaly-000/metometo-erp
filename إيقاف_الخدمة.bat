@echo off
chcp 65001 >nul
title إيقاف خدمة منظومة المحاسبة
cd /d "%~dp0AccountingNewteps-main"

node scripts\service\stop_service.js
if errorlevel 1 (
    echo تعذر إكمال إيقاف الخدمة.
    pause
    exit /b 1
)

echo انتهى طلب إيقاف البرنامج.
pause
