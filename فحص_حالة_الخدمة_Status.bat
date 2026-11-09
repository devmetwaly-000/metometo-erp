@echo off
chcp 65001 >nul
title حالة خدمة منظومة المحاسبة - Meto POS ERP
cd /d "%~dp0\AccountingNewteps-main"

node "%~dp0\AccountingNewteps-main\scripts\service\status_service.js"

echo.
pause
