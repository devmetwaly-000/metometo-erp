@echo off
chcp 65001 >nul
title تثبيت الخدمة كبدء تشغيل تلقائي
echo ==============================================================
echo     تثبيت خدمة المنظومة لتعمل تلقائياً مع فتح الويندوز
echo ==============================================================
cd /d "%~dp0\AccountingNewteps-main"

node "%~dp0\AccountingNewteps-main\scripts\service\install_autostart.js"

echo.
pause
