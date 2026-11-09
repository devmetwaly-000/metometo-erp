@echo off
chcp 65001 >nul
title إلغاء بدء التشغيل التلقائي
echo ==============================================================
echo     إلغاء التشغيل التلقائي لمنظومة المحاسبة
echo ==============================================================
cd /d "%~dp0\AccountingNewteps-main"

node "%~dp0\AccountingNewteps-main\scripts\service\uninstall_autostart.js"

echo.
pause
