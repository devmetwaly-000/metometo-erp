/**
 * @fileOverview فحص حالة خدمة منظومة المحاسبة
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOGS_DIR = path.resolve(__dirname, '..', '..', 'logs');
const PID_FILE = path.join(LOGS_DIR, 'pos_service.pid');
const LOG_FILE = path.join(LOGS_DIR, 'pos_service.log');

function checkHttp(port = 9002) {
    return new Promise(resolve => {
        const start = Date.now();
        const req = http.get(`http://localhost:${port}`, { timeout: 2000 }, res => {
            resolve({ ok: true, statusCode: res.statusCode, latencyMs: Date.now() - start });
        });
        req.on('error', err => {
            resolve({ ok: false, error: err.message });
        });
    });
}

async function checkStatus() {
    console.log('===============================================================');
    console.log('         حالة خدمة منظومة المحاسبة ونقاط البيع (Meto POS)       ');
    console.log('===============================================================\n');

    const httpResult = await checkHttp(9002);

    if (httpResult.ok) {
        console.log('🟢 [الحالة]: الخدمة تعمل بنشاط (ONLINE)!');
        console.log(`   الرابط المحلي:   http://localhost:9002`);
        console.log(`   زمن الاستجابة:  ${httpResult.latencyMs}ms (HTTP ${httpResult.statusCode})`);
    } else {
        console.log('🔴 [الحالة]: الخدمة متوقفة حالياً (OFFLINE)');
        console.log(`   السبب:          ${httpResult.error}`);
    }

    if (fs.existsSync(PID_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
            console.log(`   معرف العملية:   Child PID: ${data.childPid} | Daemon PID: ${data.daemonPid}`);
            console.log(`   وقت البدء:      ${new Date(data.startedAt).toLocaleString('ar-EG')}`);
        } catch {}
    }

    console.log('\n--- آخر أسطر من سجل التشغيل (Service Log) ---');
    if (fs.existsSync(LOG_FILE)) {
        try {
            const content = fs.readFileSync(LOG_FILE, 'utf8');
            const lines = content.trim().split('\n').slice(-8);
            lines.forEach(l => console.log(' ', l));
        } catch {
            console.log(' لا توجد سجلات.');
        }
    } else {
        console.log(' لم يتم إنشاء ملف السجل بعد.');
    }

    console.log('\n===============================================================');
}

checkStatus();
