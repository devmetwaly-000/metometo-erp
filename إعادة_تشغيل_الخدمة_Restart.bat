@echo off
chcp 65001 >nul
title إعادة تشغيل خدمة منظومة المحاسبة - Meto POS ERP
echo ==============================================================
echo     جاري إعادة تشغيل الخدمة...
echo ==============================================================
cd /d "%~dp0\AccountingNewteps-main"

node "%~dp0\AccountingNewteps-main\scripts\service\stop_service.js"
timeout /t 2 /nobreak >nul

wscript.exe "%~dp0\AccountingNewteps-main\scripts\service\start_service_silent.vbs"
timeout /t 3 /nobreak >nul

echo.
node "%~dp0\AccountingNewteps-main\scripts\service\status_service.js"
echo.
pause
