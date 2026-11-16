/**
 * @fileOverview مثبت التشغيل التلقائي للخدمة مع فتح الويندوز (Windows Auto-Start Installer)
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const SCRIPT_DIR = __dirname;
const SILENT_VBS = path.join(SCRIPT_DIR, 'start_service_silent.vbs');
const STARTUP_DIR = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const SHORTCUT_PATH = path.join(STARTUP_DIR, 'MetoPOS_ERP_BackgroundService.lnk');

function installAutoStart() {
    console.log('=== تثبيت بدء التشغيل التلقائي لمنظومة المحاسبة مع الويندوز ===');

    if (!fs.existsSync(SILENT_VBS)) {
        console.error('خطأ: لم يتم العثور على ملف التشغيل الصامت:', SILENT_VBS);
        process.exit(1);
    }

    try {
        // استخدم مصدراً واحداً للتشغيل التلقائي حتى لا يبدأ حارسان عند تسجيل الدخول.
        try { fs.unlinkSync(SHORTCUT_PATH); } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }

        const regCommand = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "MetoPOS_ERP" /t REG_SZ /d "wscript.exe \\"${SILENT_VBS}\\"" /f`;
        execSync(regCommand, { stdio: 'inherit' });
        console.log('✓ تم ضبط مصدر واحد للتشغيل التلقائي وحذف اختصار Startup المكرر.');

        console.log('\n===============================================================');
        console.log(' تهانينا! سيعمل البرنامج تلقائياً في الخلفية فور تشغيل الـ PC.');
        console.log(' الرابط الدائم: http://localhost:9002');
        console.log('===============================================================\n');
    } catch (err) {
        console.error('فشل تثبيت التشغيل التلقائي:', err.message);
        process.exit(1);
    }
}

installAutoStart();
