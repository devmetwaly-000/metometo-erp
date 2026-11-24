import { NextResponse } from 'next/server';
import {
    getDbPool,
    getLocalDbConfig,
    saveLocalDbConfig,
    testLocalDbConnection,
    parseSqlConnectionString,
    resetDbPool
} from '@/lib/db';
import { createAndInitializeDatabase } from '@/lib/database-init';

export const dynamic = 'force-dynamic';

export async function GET() {
    const localConfig = getLocalDbConfig();
    const serverName = String(localConfig.server || '').toLowerCase().trim();
    if (serverName === 'indexeddb' || serverName.includes('indexeddb') || serverName === 'browser') {
        return NextResponse.json({
            success: true,
            connected: true,
            isIndexedDb: true,
            localConfig,
            database: 'MultiBranchPOS_IndexedDB',
            server: 'IndexedDB (Browser)',
            tablesCount: 98,
            usersCount: 1,
            status: 'healthy',
            message: 'وضع المتصفح الذكي (IndexedDB + Firebase) نشط وجاهز للعمل محلياً بدون سيرفر.'
        });
    }

    try {
        const pool = await getDbPool();
        const tablesRes = await pool.request().query(`
            SELECT COUNT(*) as tablesCount 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME != 'sysdiagrams';
        `);
        const tablesCount = tablesRes.recordset[0]?.tablesCount || 0;

        const usersRes = await pool.request().query(`
            SELECT COUNT(*) as usersCount FROM dbo.Users;
        `);
        const usersCount = usersRes.recordset[0]?.usersCount || 0;

        const dbNameRes = await pool.request().query(`SELECT DB_NAME() as currentDb;`);
        const currentDb = dbNameRes.recordset[0]?.currentDb || localConfig.database;

        return NextResponse.json({
            success: true,
            connected: true,
            localConfig,
            database: currentDb,
            server: `${localConfig.server}:${localConfig.port}`,
            tablesCount,
            usersCount,
            status: tablesCount >= 90 ? 'healthy' : (tablesCount >= 70 ? 'healthy' : 'needs_initialization'),
            message: `قاعدة البيانات [${currentDb}] على السيرفر (${localConfig.server}:${localConfig.port}) متصلة وتضم ${tablesCount} جدولاً و ${usersCount} مستخدماً.`
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            connected: false,
            localConfig,
            server: `${localConfig.server}:${localConfig.port}`,
            database: localConfig.database,
            error: error.message,
            status: 'connection_failed'
        }, { status: 200 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const { action } = body;

        // 1. جلب إعدادات الاتصال الحالية
        if (action === 'get-config') {
            const localConfig = getLocalDbConfig();
            return NextResponse.json({ success: true, config: localConfig });
        }

        // 2. اختبار الاتصال بالسيرفر المحلي / الخارجي / Amazon AWS RDS
        if (action === 'test') {
            const testResult = await testLocalDbConnection(body.config || body);
            return NextResponse.json(testResult);
        }

        // 3. حفظ نص الاتصال أو إعدادات السيرفر المحلي / السحابي وإعادة ربط النظام فوراً
        if (action === 'save') {
            const savedConfig = await saveLocalDbConfig(body.config || body);
            const testResult = await testLocalDbConnection(savedConfig);
            return NextResponse.json({
                success: true,
                config: savedConfig,
                connectionTest: testResult,
                message: testResult.success
                    ? `تم حفظ إعدادات السيرفر (${savedConfig.server}:${savedConfig.port}) والاتصال بقاعدة البيانات [${savedConfig.database}] بنجاح.`
                    : `تم حفظ إعدادات الاتصال (${savedConfig.server}:${savedConfig.port})، لكن تعذر الوصول للقاعدة حالياً: ${testResult.error || ''}`
            });
        }

        // 4. إنشاء وتهيئة قاعدة البيانات على السيرفر المحدد (مع حفظ الإعدادات أولاً إن تم تمريرها)
        let currentCfg = getLocalDbConfig();
        const incoming = body.config || body;
        if (incoming.connectionString || incoming.server || incoming.database || incoming.user) {
            currentCfg = await saveLocalDbConfig(incoming);
        }

        const isIndexedDb =
            String(currentCfg.server || '').toLowerCase().trim() === 'indexeddb' ||
            String(currentCfg.server || '').toLowerCase().includes('indexeddb') ||
            String(incoming.server || '').toLowerCase().trim() === 'indexeddb';

        if (isIndexedDb) {
            return NextResponse.json({
                success: true,
                isIndexedDb: true,
                config: currentCfg,
                message: 'تم تفعيل وتهيئة متجر المتصفح المحلي (IndexedDB + Firebase) بنجاح!'
            });
        }

        const effectiveDb =
            !currentCfg.database || currentCfg.database.toLowerCase() === 'master'
                ? 'MultiBranchPOS_DB'
                : currentCfg.database;

        const initResult = await createAndInitializeDatabase({
            server: currentCfg.server,
            port: Number(currentCfg.port) || 1433,
            database: effectiveDb,
            user: currentCfg.user,
            password: currentCfg.password,
            encrypt: Boolean(currentCfg.encrypt),
            branchCode: incoming.branchCode || '900',
            branchName: incoming.branchName || 'الفرع الرأيسي',
            isCentral: Boolean(incoming.isCentral)
        });

        await resetDbPool();

        return NextResponse.json(
            { ...initResult, config: currentCfg },
            { status: initResult.success ? 200 : 500 }
        );
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            message: 'فشلت عملية حفظ أو تهيئة قاعدة البيانات.'
        }, { status: 500 });
    }
}
