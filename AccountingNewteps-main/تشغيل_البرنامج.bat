@echo off
chcp 65001 > nul
title منظومة المحاسبة ونقاط البيع (SQL Server Edition)
cls
echo ===================================================================
echo     منظومة المحاسبة وإدارة الفروع ونقاط البيع (MultiBranch ERP)
echo     محرك قاعدة البيانات: Microsoft SQL Server (MultiBranchPOS_DB)
echo ===================================================================
echo.

echo [1/3] فحص حالة خادم Microsoft SQL Server...
sc query MSSQLSERVER | find "RUNNING" > nul
if %ERRORLEVEL% NEQ 0 (
    echo [تنبيه] جاري تشغيل خدمة SQL Server...
    net start MSSQLSERVER
) else (
    echo [✓] خادم SQL Server يعمل بنشاط.
)
echo.

cd /d "%~dp0"

echo [2/3] تجهيز واجهة المستخدم وفتح المتصفح...
start "" timeout /t 3 /nobreak > nul & start http://localhost:9002

echo [3/3] جاري تشغيل خادم المنظومة على http://localhost:9002 ...
echo.
echo ===================================================================
echo   بيانات الدخول لحساب المدير العام:
echo   - اسم المستخدم: Admin
echo   - كلمة المرور: 200300400
echo ===================================================================
echo.
npm run dev
pause

