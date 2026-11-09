/**
 * @fileOverview مشغل خدمة منظومة المحاسبة في الخلفية (Background Service Daemon)
 * يتولى تشغيل ومراقبة خادم Next.js تلقائياً على بورت 9002:
 * 1. فحص تشغيل الخادم ومنع تكرار النسخ (Single Instance Guard).
 * 2. المراقبة المستمرة وإعادة التشغيل التلقائي في حال حدوث أي توقف (Auto-Restart Watchdog).
 * 3. تسجيل سجلات التشغيل في مجلد logs.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const APP_DIR = path.resolve(__dirname, '..', '..');
const LOGS_DIR = path.join(APP_DIR, 'logs');
const PID_FILE = path.join(LOGS_DIR, 'pos_service.pid');
const LOG_FILE = path.join(LOGS_DIR, 'pos_service.log');

if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function writeLog(message) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const line = `[${timestamp}] ${message}\n`;
    try {
        fs.appendFileSync(LOG_FILE, line, 'utf8');
    } catch {}
    console.log(line.trim());
}

// فحص ما إذا كان البورت 9002 يعمل بالفعل
function isPortInUse(port = 9002) {
    return new Promise(resolve => {
        const req = http.get(`http://localhost:${port}/api/health`, { timeout: 1500 }, res => {
            resolve(true);
        });
        req.on('error', () => {
            // فحص إضافي عبر طلب رئيسي
            const testReq = http.get(`http://localhost:${port}`, { timeout: 1500 }, () => resolve(true));
            testReq.on('error', () => resolve(false));
        });
    });
}

let childProcess = null;
let isStopping = false;

function startNextServer() {
    if (isStopping) return;

    writeLog('جاري بدء تشغيل خادم Next.js على البورت 9002...');

    // مسار npm أو npx أو node
    const isWindows = process.platform === 'win32';
    const npmCmd = isWindows ? 'npm.cmd' : 'npm';

    childProcess = spawn(npmCmd, ['run', 'dev'], {
        cwd: APP_DIR,
        shell: true,
        env: {
            ...process.env,
            PORT: '9002'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const currentPid = childProcess.pid;
    fs.writeFileSync(PID_FILE, JSON.stringify({
        daemonPid: process.pid,
        childPid: currentPid,
        startedAt: new Date().toISOString(),
        port: 9002
    }), 'utf8');

    writeLog(`تم إطلاق خادم التطبيق (Child PID: ${currentPid})`);

    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

    childProcess.stdout.on('data', data => {
        logStream.write(data);
    });

    childProcess.stderr.on('data', data => {
        logStream.write(data);
    });

    childProcess.on('exit', (code, signal) => {
        writeLog(`توقف خادم Next.js بكود: ${code} وإشارة: ${signal}`);
        childProcess = null;

        if (!isStopping) {
            writeLog('سيتم إعادة تشغيل الخادم تلقائياً خلال 3 ثوانٍ (Auto-Restart Watchdog)...');
            setTimeout(startNextServer, 3000);
        }
    });

    childProcess.on('error', err => {
        writeLog(`خطأ في العملية: ${err.message}`);
    });
}

function handleShutdown() {
    isStopping = true;
    writeLog('استلام إشارة إيقاف الخدمة...');
    
    if (fs.existsSync(PID_FILE)) {
        try { fs.unlinkSync(PID_FILE); } catch {}
    }

    if (childProcess) {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', childProcess.pid.toString(), '/f', '/t'], { shell: true });
        } else {
            childProcess.kill('SIGTERM');
        }
    }

    setTimeout(() => {
        process.exit(0);
    }, 1000);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

async function main() {
    writeLog('=== بدء تشغيل حارس خدمة المنظومة (Meto POS Service Daemon) ===');

    const inUse = await isPortInUse(9002);
    if (inUse) {
        writeLog('تنبيه: البورت 9002 يعمل بالفعل بنشاط. الخدمة قيد التشغيل مسبقاً.');
        // لا نحتاج لإنشاء نسخة مكررة
        return;
    }

    startNextServer();
}

main().catch(err => {
    writeLog(`خطأ غير متوقع: ${err.message}`);
});
