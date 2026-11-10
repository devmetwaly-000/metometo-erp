@echo off
chcp 65001 >nul
echo ===================================================
echo   تفعيل الوصول للبرنامج من الأجهزة الخارجية (الشبكة المحلية)
echo ===================================================
echo.
echo 1. ضبط الشبكة كشبكة خاصة (Private Network)...
powershell -NoProfile -Command "Set-NetConnectionProfile -InterfaceIndex 15 -NetworkCategory Private"

echo.
echo 2. فتح المنفذ 9002 في جدار حماية ويندوز (Windows Firewall)...
netsh advfirewall firewall delete rule name="Next.js Port 9002" >nul 2>&1
netsh advfirewall firewall add rule name="Next.js Port 9002" dir=in action=allow protocol=TCP localport=9002 profile=any

echo.
echo ===================================================
echo   تم التفعيل بنجاح!
echo   عنوان الدخول من الأجهزة الأخرى هو:
echo   http://192.168.137.52:9002
echo ===================================================
echo.
pause

