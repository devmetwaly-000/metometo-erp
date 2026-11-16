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
const net = require('net');
const { startWarmup } = require('./server_warmup');

const APP_DIR = path.resolve(__dirname, '..', '..');
const LOGS_DIR = path.join(APP_DIR, 'logs');
const PID_FILE = path.join(LOGS_DIR, 'pos_service.pid');
const DAEMON_LOCK_FILE = path.join(LOGS_DIR, 'pos_service_daemon.lock');
const LOG_FILE = path.join(LOGS_DIR, 'pos_service.log');

if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function writeLog(message) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const line = `[${timestamp}] ${message}\n`;
    try {
        fs.appendFileSync(LOG_FILE, line, 'utf8');
    } catch { }
    console.log(line.trim());
}

// فحص حجز المنفذ مباشرة؛ لا نعتمد على سرعة رد HTTP أثناء ضغط الخادم.
function isPortInUse(port = 9002) {
    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(value);
        };
        const socket = net.createConnection({ host: '127.0.0.1', port });
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
        socket.setTimeout(1500, () => finish(false));
    });
}

let childProcess = null;
let isStopping = false;
let startCheckInProgress = false;
let occupiedPortMonitor = null;

function acquireDaemonLock() {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const lockFd = fs.openSync(DAEMON_LOCK_FILE, 'wx');
            fs.writeFileSync(lockFd, JSON.stringify({ daemonPid: process.pid, startedAt: new Date().toISOString() }));
            fs.closeSync(lockFd);
            return true;
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;
            let lock;
            try {
                lock = JSON.parse(fs.readFileSync(DAEMON_LOCK_FILE, 'utf8'));
            } catch {
                // قد تكون النسخة المالكة أنشأت الملف ولم تكتب محتواه بعد؛ لا تحذف قفلها.
                try {
                    if (Date.now() - fs.statSync(DAEMON_LOCK_FILE).mtimeMs < 5000) return false;
                    fs.unlinkSync(DAEMON_LOCK_FILE);
                    continue;
                } catch { return false; }
            }

            if (lock.daemonPid && lock.daemonPid !== process.pid) {
                try {
                    process.kill(lock.daemonPid, 0);
                    writeLog(`حارس الخدمة يعمل بالفعل (Daemon PID: ${lock.daemonPid})؛ سيتم إنهاء النسخة المكررة.`);
                    return false;
                } catch (pidError) {
                    if (pidError.code === 'EPERM') return false;
                }
            }

            try { fs.unlinkSync(DAEMON_LOCK_FILE); } catch { return false; }
        }
    }
    return false;
}

function releaseDaemonLock() {
    try {
        const lock = JSON.parse(fs.readFileSync(DAEMON_LOCK_FILE, 'utf8'));
        if (lock.daemonPid === process.pid) fs.unlinkSync(DAEMON_LOCK_FILE);
    } catch { }
}

function writePidFile(childPid = null) {
    fs.writeFileSync(PID_FILE, JSON.stringify({
        daemonPid: process.pid,
        childPid,
        startedAt: new Date().toISOString(),
        port: 9002
    }), 'utf8');
}

function monitorOccupiedPort() {
    if (occupiedPortMonitor) return;
    writeLog('المنفذ 9002 مشغول؛ سيبقى حارس واحد ويراقب تحريره دون تشغيل نسخة إضافية.');
    occupiedPortMonitor = setInterval(async () => {
        if (isStopping) {
            clearInterval(occupiedPortMonitor);
            occupiedPortMonitor = null;
            return;
        }
        if (!(await isPortInUse(9002))) {
            clearInterval(occupiedPortMonitor);
            occupiedPortMonitor = null;
            startNextServer();
        }
    }, 5000);
}

function stageStandaloneAssets(buildDir, standaloneDir) {
    const buildIdPath = path.join(buildDir, 'BUILD_ID');
    const markerPath = path.join(standaloneDir, '.static-assets-build-id');
    const buildId = fs.readFileSync(buildIdPath, 'utf8').trim();
    let stagedBuildId = '';
    try { stagedBuildId = fs.readFileSync(markerPath, 'utf8').trim(); } catch { }
    if (stagedBuildId === buildId
        && fs.existsSync(path.join(standaloneDir, '.next', 'static'))
        && fs.existsSync(path.join(standaloneDir, 'public'))) return;

    // Next.js standalone output omits these directories by design. Without them,
    // HTML loads but browser chunks return 404 and the app remains on its loader.
    fs.mkdirSync(path.join(standaloneDir, '.next'), { recursive: true });
    fs.cpSync(path.join(buildDir, 'static'), path.join(standaloneDir, '.next', 'static'), { recursive: true, force: true });
    fs.cpSync(path.join(APP_DIR, 'public'), path.join(standaloneDir, 'public'), { recursive: true, force: true });
    fs.writeFileSync(markerPath, buildId, 'utf8');
    writeLog(`تم تجهيز ملفات JavaScript والأصول الثابتة للإصدار ${buildId}.`);
}

async function startNextServer() {
    if (isStopping || startCheckInProgress) return;
    startCheckInProgress = true;
    try {
        if (await isPortInUse(9002)) {
            writePidFile(null);
            monitorOccupiedPort();
            return;
        }
        if (occupiedPortMonitor) {
            clearInterval(occupiedPortMonitor);
            occupiedPortMonitor = null;
        }

        writeLog('جاري بدء تشغيل خادم Next.js على البورت 9002...');

        // مسار الإنتاج: .next
        const buildDir = path.join(APP_DIR, '.next');
        const hasProductionBuild = fs.existsSync(buildDir) && fs.existsSync(path.join(buildDir, 'BUILD_ID'));
        const standaloneServer = path.join(buildDir, 'standalone', 'server.js');
        const useStandalone = hasProductionBuild && fs.existsSync(standaloneServer);
        if (useStandalone) stageStandaloneAssets(buildDir, path.dirname(standaloneServer));
        const runArg = hasProductionBuild ? 'start' : 'dev';
        const nextCli = path.join(APP_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
        const serverArgs = useStandalone
            ? [standaloneServer]
            : [nextCli, runArg, '-p', '9002'];

        writeLog(`جاري إطلاق خادم التطبيق بنمط ${useStandalone ? 'الإنتاج المستقل (Standalone)' : hasProductionBuild ? 'الإنتاج (Production)' : 'التطوير (Development)'}...`);

        childProcess = spawn(process.execPath, serverArgs, {
            cwd: useStandalone ? path.dirname(standaloneServer) : APP_DIR,
            shell: false,
            env: {
                ...process.env,
                PORT: '9002',
                HOSTNAME: '0.0.0.0',
                NODE_ENV: hasProductionBuild ? 'production' : 'development'
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        const currentPid = childProcess.pid;
        writePidFile(currentPid);

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
            writePidFile(null);

            if (!isStopping) {
                writeLog('سيتم إعادة تشغيل الخادم تلقائياً خلال 3 ثوانٍ (Auto-Restart Watchdog)...');
                setTimeout(startNextServer, 3000);
            }
        });

        childProcess.on('error', err => {
            writeLog(`خطأ في العملية: ${err.message}`);
        });

        // جدولة تسخين كافة الشاشات فور إتاحة البورت
        scheduleServerWarmup(9002, hasProductionBuild);
    } finally {
        startCheckInProgress = false;
    }
}

function scheduleServerWarmup(port = 9002, isProduction = process.env.NODE_ENV === 'production') {
    // In development, each warmup request triggers an on-demand webpack compile.
    // Warming every route therefore overloads the machine and delays real navigation.
    if (!isProduction) {
        writeLog('تم تخطي تسخين الشاشات في وضع التطوير لتجنب تجميع عشرات الصفحات وإبطاء الاستخدام.');
        return;
    }

    let attempts = 0;
    const interval = setInterval(async () => {
        attempts++;
        if (isStopping) {
            clearInterval(interval);
            return;
        }
        const ready = await isPortInUse(port);
        if (ready) {
            clearInterval(interval);
            writeLog('الخادم متصل وجاهز. جاري تجميع وتسخين كافة شاشات الفرونت إند في الخلفية...');
            try {
                await startWarmup(port);
                writeLog('✓ اكتمل تسخين وتجهيز كافة شاشات النظام مسبقاً بنجاح.');
            } catch (e) {
                writeLog(`تنبيه أثناء تسخين الشاشات: ${e.message}`);
            }
        } else if (attempts > 60) {
            clearInterval(interval);
        }
    }, 2500);
}

function handleShutdown() {
    isStopping = true;
    writeLog('استلام إشارة إيقاف الخدمة...');

    try {
        const data = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
        if (data.daemonPid === process.pid) fs.unlinkSync(PID_FILE);
    } catch { }
    releaseDaemonLock();

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

    if (!acquireDaemonLock()) return;

    await startNextServer();
}

main().catch(err => {
    writeLog(`خطأ غير متوقع: ${err.message}`);
    releaseDaemonLock();
});

