/**
 * CLI Tool to initialize or repair the database on first run
 * Usage: node scripts/init-database-cli.js
 */

const sql = require('mssql');

const config = {
    server: process.env.DB_SERVER || 'localhost',
    port: Number(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'MultiBranchPOS_DB',
    user: process.env.DB_USER || 'meto_pos',
    password: process.env.DB_PASSWORD || 'MetoPosPass123!',
    branchCode: process.env.BRANCH_CODE || '900',
    branchName: process.env.BRANCH_NAME || 'الفرع الرأيسي'
};

async function run() {
    console.log('================================================================');
    console.log('  🚀 أداة التأسيس والتهيئة الشاملة لقاعدة البيانات (MultiBranchPOS)');
    console.log('================================================================\n');
    console.log(`📡 الخادم: ${config.server}:${config.port}`);
    console.log(`💾 قاعدة البيانات المستهدفة: ${config.database}`);
    console.log(`👤 المستخدم: ${config.user}`);
    console.log(`🏢 رمز الفرع: ${config.branchCode} - ${config.branchName}\n`);

    // 1. Connect to master to check/create DB
    console.log('⏳ جاري التحقق من وجود قاعدة البيانات على خادم SQL Server...');
    const masterPool = await sql.connect({
        user: config.user,
        password: config.password,
        server: config.server,
        port: config.port,
        database: 'master',
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
    });

    await masterPool.request().query(`
        IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'${config.database}')
        BEGIN
            CREATE DATABASE [${config.database}] COLLATE Arabic_100_CI_AS;
            PRINT 'Created Database';
        END;
    `);
    await masterPool.close();
    console.log(`✅ تم تأكيد وجود قاعدة البيانات [${config.database}].\n`);

    // 2. Call the API route or initialize directly
    console.log('⏳ جاري استدعاء محرك التهيئة الشامل لكافة الجداول والمشغلات والفهارس...');
    try {
        const res = await fetch('http://localhost:9002/api/db/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const data = await res.json();
        if (data.success) {
            console.log(`\n🎉 ${data.message}`);
            console.log(`📊 إجمالي الجداول المفعلة: ${data.tablesCount}`);
            console.log('\n✅ النظام جاهز الآن للتشغيل والعمل بكامل كفاءته وسرعته!');
            process.exit(0);
        } else {
            console.error(`\n❌ فشلت التهيئة:`, data.error || data.message);
            process.exit(1);
        }
    } catch (apiErr) {
        // If web server is not running, we connect and run direct check
        console.log('ℹ️ خادم الويب غير نشط، جاري الفحص المباشر لقاعدة البيانات عبر SQL...');
        const pool = await sql.connect({
            user: config.user,
            password: config.password,
            server: config.server,
            port: config.port,
            database: config.database,
            options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
        });
        const countRes = await pool.request().query(`
            SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME != 'sysdiagrams';
        `);
        console.log(`📊 عدد الجداول الموجودة حالياً: ${countRes.recordset[0]?.cnt}`);
        await pool.close();
        process.exit(0);
    }
}

run().catch(err => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
});

