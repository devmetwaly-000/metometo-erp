@echo off
chcp 65001 > nul
title تشغيل خدمة منظومة المحاسبة في الخلفية
cls
echo ===================================================================
echo     تشغيل منظومة المحاسبة في الخلفية (Background Service)
echo ===================================================================
echo.
cd /d "%~dp0\AccountingNewteps-main"

:: فحص خدمة SQL Server
sc query MSSQLSERVER | find "RUNNING" > nul
if %ERRORLEVEL% NEQ 0 (
    echo [تنبيه] جاري تشغيل خدمة SQL Server...
    net start MSSQLSERVER > nul 2>&1
)

echo [1/2] جاري إطلاق الخدمة الصامتة...
wscript "%~dp0\AccountingNewteps-main\scripts\service\start_service_silent.vbs"

echo [2/2] جاري فتح المنظومة في المتصفح...
timeout /t 2 /nobreak > nul
start http://localhost:9002

echo.
echo [✓] الخدمة تعمل الآن بنجاح في الخلفية بدون أي شاشة سوداء.
echo     الرابط: http://localhost:9002
echo.
timeout /t 3 > nul
exit
