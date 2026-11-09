/**
 * @fileOverview إيقاف خدمة منظومة المحاسبة في الخلفية
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.resolve(__dirname, '..', '..', 'logs');
const PID_FILE = path.join(LOGS_DIR, 'pos_service.pid');

function stopService() {
    console.log('=== إيقاف خدمة منظومة المحاسبة (Stopping Background Service) ===');

    let pidStopped = false;

    // 1. إيقاف الـ PID المسجل إن وجد
    if (fs.existsSync(PID_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
            if (data.childPid) {
                execSync(`taskkill /pid ${data.childPid} /f /t`, { stdio: 'ignore' });
            }
            if (data.daemonPid) {
                execSync(`taskkill /pid ${data.daemonPid} /f /t`, { stdio: 'ignore' });
            }
            fs.unlinkSync(PID_FILE);
            pidStopped = true;
            console.log('✓ تم إنهاء العمليات المسجلة بالخدمة.');
        } catch {}
    }

    // 2. فحص البورت 9002 وإنهاء أي عملية تستخدمه لضمان تحرير المنفذ
    try {
        const netstatOutput = execSync('netstat -ano | findstr :9002', { encoding: 'utf8' });
        const lines = netstatOutput.trim().split('\n');
        const pids = new Set();
        
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(pid) && pid !== '0') {
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

    console.log('✓ الخدمة متوقفة الآن.');
}

stopService();

