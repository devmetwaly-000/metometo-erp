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
        // 1. إنشاء اختصار في مجلد Startup عبر PowerShell
        const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('${SHORTCUT_PATH}')
$Shortcut.TargetPath = 'wscript.exe'
$Shortcut.Arguments = '"${SILENT_VBS}"'
$Shortcut.WorkingDirectory = '${SCRIPT_DIR}'
$Shortcut.Description = 'MultiBranch POS ERP Background Service'
$Shortcut.Save()
`;
        const tempPsFile = path.join(SCRIPT_DIR, 'temp_create_shortcut.ps1');
        fs.writeFileSync(tempPsFile, psScript, 'utf8');

        execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPsFile}"`, { stdio: 'inherit' });
        try { fs.unlinkSync(tempPsFile); } catch {}

        console.log('✓ تم إنشاء اختصار التشغيل التلقائي في مجلد Startup بنجاح:');
        console.log('  ', SHORTCUT_PATH);

        // 2. إضافة إدخال في سجل النظام Registry (HKCU Run) لمزيد من الموثوقية
        const regCommand = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "MetoPOS_ERP" /t REG_SZ /d "wscript.exe \\"${SILENT_VBS}\\"" /f`;
        execSync(regCommand, { stdio: 'inherit' });
        console.log('✓ تم تسجيل الخدمة في مفتاح التشغيل التلقائي بالريجستري (Registry Run).');

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
