@echo off
chcp 65001 > nul
title تشغيل منظومة المحاسبة ونقاط البيع (Meto POS)
cls
echo ===================================================================
echo     منظومة المحاسبة وإدارة الفروع ونقاط البيع (MultiBranch ERP)
echo     محرك قاعدة البيانات: Microsoft SQL Server (MultiBranchPOS_DB)
echo ===================================================================
echo.

cd /d "%~dp0"
if exist "AccountingNewteps-main" cd "AccountingNewteps-main"

:: 1. التحقق من تشغيل خدمة SQL Server
sc query MSSQLSERVER | find "RUNNING" > nul
if %ERRORLEVEL% NEQ 0 (
    echo [تنبيه] جاري تشغيل خدمة SQL Server...
    net start MSSQLSERVER > nul 2>&1
)

:: 2. تشغيل خدمة المنظومة بالخلفية
echo جاري إطلاق خدمة المنظومة بالخلفية...
wscript "%~dp0\AccountingNewteps-main\scripts\service\start_service_silent.vbs"

:: 3. فتح المتصفح تلقائياً
echo جاري فتح المتصفح على http://localhost:9002 ...
timeout /t 2 /nobreak > nul
start http://localhost:9002

echo.
echo ===================================================================
echo   [✓] المنظومة تعمل الآن في الخلفية كخدمة دائمة!
echo   بيانات الدخول لحساب المدير العام:
echo   - اسم المستخدم: Admin
echo   - كلمة المرور: 200300400
echo ===================================================================
echo.
timeout /t 3 > nul
exit
