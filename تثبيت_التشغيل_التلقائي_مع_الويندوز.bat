@echo off
chcp 65001 > nul
title تثبيت خدمة منظومة المحاسبة لتعمل تلقائياً مع فتح الويندوز
cls
echo ===================================================================
echo   تثبيت منظومة المحاسبة ونقاط البيع كخدمة تعمل تلقائياً مع فتح الـ PC
echo ===================================================================
echo.
cd /d "%~dp0\AccountingNewteps-main"
node scripts\service\install_autostart.js
echo.
echo جاري بدء تشغيل الخدمة الآن بالخلفية وفتح البرنامج...
wscript "%~dp0\AccountingNewteps-main\scripts\service\start_service_silent.vbs"
timeout /t 3 /nobreak > nul
start http://localhost:9002
echo.
echo [✓] اكتملت العملية بنجاح!
echo اضغط أي مفتاح للإغلاق...
pause > nul

