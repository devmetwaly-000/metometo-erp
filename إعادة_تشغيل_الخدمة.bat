@echo off
chcp 65001 > nul
title إعادة تشغيل خدمة منظومة المحاسبة
cls
echo [1/3] إيقاف الخدمة الحالية...
cd /d "%~dp0\AccountingNewteps-main"
node scripts\service\stop_service.js

echo.
echo [2/3] بدء تشغيل الخدمة مجدداً...
wscript "%~dp0\AccountingNewteps-main\scripts\service\start_service_silent.vbs"

echo.
echo [3/3] جاري فتح المنظومة في المتصفح...
timeout /t 3 /nobreak > nul
start http://localhost:9002

echo.
echo [✓] تمت إعادة التشغيل بنجاح!
timeout /t 3 > nul
exit

