@echo off
chcp 65001 > nul
title فحص حالة خدمة منظومة المحاسبة
cls
cd /d "%~dp0\AccountingNewteps-main"
node scripts\service\status_service.js
echo.
pause
