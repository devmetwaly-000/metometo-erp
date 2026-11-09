@echo off
chcp 65001 >nul
title إيقاف خدمة منظومة المحاسبة - Meto POS ERP
echo ==============================================================
echo     جاري إيقاف خدمة منظومة المحاسبة وتحرير المنفذ 9002...
echo ==============================================================
cd /d "%~dp0\AccountingNewteps-main"

node "%~dp0\AccountingNewteps-main\scripts\service\stop_service.js"

echo.
pause
