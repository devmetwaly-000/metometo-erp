@echo off
chcp 65001 >nul
title تشغيل خدمة منظومة المحاسبة - Meto POS ERP
echo ==============================================================
echo     جاري تشغيل خدمة منظومة المحاسبة في الخلفية...
echo ==============================================================
cd /d "%~dp0\AccountingNewteps-main"

wscript.exe "%~dp0\AccountingNewteps-main\scripts\service\start_service_silent.vbs"

timeout /t 3 /nobreak >nul
echo.
node "%~dp0\AccountingNewteps-main\scripts\service\status_service.js"
echo.
echo ==============================================================
echo يمكنك فتح النظام الآن عبر الرابط: http://localhost:9002
echo ==============================================================
pause
