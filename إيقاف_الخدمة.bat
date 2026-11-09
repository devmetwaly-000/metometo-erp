@echo off
chcp 65001 > nul
title إيقاف خدمة منظومة المحاسبة
cls
cd /d "%~dp0\AccountingNewteps-main"
node scripts\service\stop_service.js
echo.
timeout /t 3 > nul
exit
