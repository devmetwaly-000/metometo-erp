/**
 * @fileOverview إيقاف خدمة منظومة المحاسبة في الخلفية
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.resolve(__dirname, '..', '..', 'logs');
const PID_FILE = path.join(LOGS_DIR, 'pos_service.pid');
const DAEMON_LOCK_FILE = path.join(LOGS_DIR, 'pos_service_daemon.lock');

function stopService() {
    console.log('=== إيقاف خدمة منظومة المحاسبة (Stopping Background Service) ===');

    const killPid = pid => {
        if (!pid || !Number.isInteger(Number(pid))) return;
        try {
            execSync(`taskkill /pid ${Number(pid)} /f /t`, { stdio: 'ignore' });
            console.log(`✓ تم إنهاء العملية ${pid}.`);
        } catch (error) {
            // A stale PID is expected after an abrupt shutdown; report other failures.
            if (!String(error.message || '').toLowerCase().includes('not found')) {
                console.warn(`تعذر إنهاء العملية ${pid}: ${error.message}`);
            }
        }
    };

    // 1. إيقاف الـ PID المسجل إن وجد
    if (fs.existsSync(PID_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
            killPid(data.childPid);
            killPid(data.daemonPid);
            try {
                const lock = JSON.parse(fs.readFileSync(DAEMON_LOCK_FILE, 'utf8'));
                if (lock.daemonPid === data.daemonPid) fs.unlinkSync(DAEMON_LOCK_FILE);
            } catch {}
        } catch {}
        try { fs.unlinkSync(PID_FILE); } catch {}
    }

    // إزالة الحارس المسجل حتى لو كان ملف PID مفقوداً أو قديماً.
    try {
        const lock = JSON.parse(fs.readFileSync(DAEMON_LOCK_FILE, 'utf8'));
        killPid(lock.daemonPid);
        try {
            const currentLock = JSON.parse(fs.readFileSync(DAEMON_LOCK_FILE, 'utf8'));
            if (currentLock.daemonPid === lock.daemonPid) fs.unlinkSync(DAEMON_LOCK_FILE);
        } catch {}
    } catch {}

    // 2. إنهاء العملية التي تستمع محلياً على 9002 فقط.
    try {
        const netstatOutput = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
        const lines = netstatOutput.trim().split('\n');
        const pids = new Set();
        
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 5) continue;
            const localAddress = parts[1];
            const state = parts[3];
            const pid = parts[4];
            if (localAddress && /:9002$/.test(localAddress) && state === 'LISTENING' && /^\d+$/.test(pid) && pid !== '0') {
                pids.add(pid);
            }
        }

        for (const pid of pids) {
            try {
                execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' });
                console.log(`✓ تم إنهاء العملية على البورت 9002 (PID: ${pid})`);
            } catch {}
        }
    } catch {}

    console.log('✓ انتهى طلب الإيقاف.');
}

stopService();

