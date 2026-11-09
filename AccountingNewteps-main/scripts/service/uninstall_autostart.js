/**
 * @fileOverview إلغاء التثبيت التلقائي للخدمة مع فتح الويندوز
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const STARTUP_DIR = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const SHORTCUT_PATH = path.join(STARTUP_DIR, 'MetoPOS_ERP_BackgroundService.lnk');

function uninstallAutoStart() {
    console.log('=== إلغاء التشغيل التلقائي لمنظومة المحاسبة مع الويندوز ===');

    try {
        if (fs.existsSync(SHORTCUT_PATH)) {
            fs.unlinkSync(SHORTCUT_PATH);
            console.log('✓ تم حذف اختصار Startup.');
        }

        try {
            execSync('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "MetoPOS_ERP" /f', { stdio: 'ignore' });
            console.log('✓ تم حذف إدخال الريجستري.');
        } catch {}

        console.log('تم إلغاء التشغيل التلقائي بنجاح.');
    } catch (err) {
        console.error('حدث خطأ أثناء الإلغاء:', err.message);
    }
}

uninstallAutoStart();

