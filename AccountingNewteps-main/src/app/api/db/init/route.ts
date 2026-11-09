import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { createAndInitializeDatabase } from '@/lib/database-init';

export const dynamic = 'force-dynamic';

export async function GET() {
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
        const currentDb = dbNameRes.recordset[0]?.currentDb || '';

        return NextResponse.json({
            success: true,
            database: currentDb,
            tablesCount,
            usersCount,
            status: tablesCount >= 69 ? 'healthy' : 'needs_initialization',
            message: `قاعدة البيانات [${currentDb}] متصلة وتضم ${tablesCount} جدولاً و ${usersCount} مستخدماً.`
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            status: 'connection_failed'
        }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const {
            server = process.env.DB_SERVER || 'localhost',
            port = Number(process.env.DB_PORT) || 1433,
            database = process.env.DB_NAME || 'MultiBranchPOS_DB',
            user = process.env.DB_USER || 'meto_pos',
            password = process.env.DB_PASSWORD || 'MetoPosPass123!',
            branchCode = '900',
            branchName = 'الفرع الرأيسي',
            isCentral = false
        } = body;

        const initResult = await createAndInitializeDatabase({
            server,
            port,
            database,
            user,
            password,
            branchCode,
            branchName,
            isCentral
        });

        return NextResponse.json(initResult, { status: initResult.success ? 200 : 500 });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            message: 'فشلت عملية إنشاء وتهيئة قاعدة البيانات.'
        }, { status: 500 });
    }
}

