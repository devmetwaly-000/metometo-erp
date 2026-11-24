import { NextResponse } from 'next/server';
import { getDbPool, resetDbPool, getLocalDbConfig } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    const localCfg = getLocalDbConfig();
    const serverName = String(localCfg.server || '').toLowerCase().trim();
    if (serverName === 'indexeddb' || serverName.includes('indexeddb') || serverName === 'browser') {
        return NextResponse.json({ ok: true, isIndexedDb: true, engine: 'IndexedDB + Firebase' });
    }

    try {
        const pool = await getDbPool();
        await pool.request().query('SELECT 1 AS ok');
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        // Reset the cached pool so a dropped/restarted SQL Server gets a fresh connection on next check
        await resetDbPool().catch(() => {});

        if (error?.code === 'LOCAL_DATABASE_MISSING') {
            return NextResponse.json(
                {
                    ok: false,
                    code: 'LOCAL_DATABASE_MISSING',
                    database: error?.database || 'MultiBranchPOS_DB',
                    error: error?.message || 'Database missing',
                },
                { status: 503 }
            );
        }

        return NextResponse.json(
            {
                ok: false,
                error: error?.message || 'تعذر الاتصال بسيرفر قاعدة البيانات',
            },
            { status: 503 }
        );
    }
}
