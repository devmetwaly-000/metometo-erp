@echo off
chcp 65001 > nul
title إلغاء التشغيل التلقائي مع فتح الويندوز
cls
cd /d "%~dp0\AccountingNewteps-main"
node scripts\service\uninstall_autostart.js
echo.
pause
