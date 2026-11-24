import { NextResponse } from 'next/server';
import { getDbPool, getLocalDbConfig } from '@/lib/db';
import { RegisteredScale } from './broadcast/route';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const localConfig = getLocalDbConfig();
        const serverName = String(localConfig.server || '').toLowerCase().trim();

        if (serverName === 'indexeddb' || serverName.includes('indexeddb') || serverName === 'browser') {
            return NextResponse.json({
                success: true,
                isIndexedDb: true,
                scales: []
            });
        }

        const pool = await getDbPool();
        const tableCheck = await pool.request().query(`
            SELECT 1 FROM sys.tables WHERE name = 'BarcodeScales';
        `);

        if (tableCheck.recordset.length === 0) {
            return NextResponse.json({ success: true, scales: [] });
        }

        const result = await pool.request().query(`
            SELECT 
                [Id] as id,
                [Name] as name,
                [Ip] as ip,
                [Port] as port,
                [Model] as model,
                [DepartmentId] as departmentId,
                [DepartmentName] as departmentName,
                [WarehouseId] as warehouseId,
                [Enabled] as enabled,
                [LastSync] as lastSync,
                [LastStatus] as lastStatus,
                [LatencyMs] as latencyMs
            FROM dbo.BarcodeScales
            ORDER BY [CreatedAt] ASC;
        `);

        return NextResponse.json({
            success: true,
            scales: result.recordset || []
        });
    } catch (error: any) {
        console.warn('[BarcodeScales API] GET error:', error.message);
        return NextResponse.json({ success: false, scales: [], error: error.message }, { status: 200 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { scales = [] } = body;

        const localConfig = getLocalDbConfig();
        const serverName = String(localConfig.server || '').toLowerCase().trim();

        if (serverName === 'indexeddb' || serverName.includes('indexeddb') || serverName === 'browser') {
            return NextResponse.json({ success: true, saved: scales.length });
        }

        const pool = await getDbPool();

        // Ensure table exists
        await pool.request().query(`
            IF OBJECT_ID('dbo.BarcodeScales', 'U') IS NULL
            BEGIN
              CREATE TABLE dbo.[BarcodeScales] (
                [Id] NVARCHAR(64) NOT NULL PRIMARY KEY,
                [Name] NVARCHAR(255) NOT NULL,
                [Ip] NVARCHAR(100) NOT NULL,
                [Port] INT NOT NULL DEFAULT (3001),
                [Model] NVARCHAR(100) NOT NULL DEFAULT ('mettler_toledo'),
                [DepartmentId] NVARCHAR(64) NULL,
                [DepartmentName] NVARCHAR(255) NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [Enabled] BIT NOT NULL DEFAULT (1),
                [LastSync] NVARCHAR(100) NULL,
                [LastStatus] NVARCHAR(50) NULL,
                [LatencyMs] INT NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime())
              );
              CREATE INDEX IX_BarcodeScales_Ip ON dbo.BarcodeScales (Ip);
            END;
        `);

        // Replace all scales with current list
        await pool.request().query(`DELETE FROM dbo.BarcodeScales;`);

        for (const scale of scales as RegisteredScale[]) {
            const reqQuery = pool.request();
            reqQuery.input('id', scale.id || `scale-${Date.now()}`);
            reqQuery.input('name', scale.name || 'ميزان');
            reqQuery.input('ip', scale.ip || '192.168.1.150');
            reqQuery.input('port', Number(scale.port) || 3001);
            reqQuery.input('model', scale.model || 'mettler_toledo');
            reqQuery.input('departmentId', scale.departmentId || null);
            reqQuery.input('departmentName', scale.departmentName || 'الكل');
            reqQuery.input('enabled', scale.enabled !== false ? 1 : 0);
            reqQuery.input('lastSync', scale.lastSync || null);
            reqQuery.input('lastStatus', scale.lastStatus || null);
            reqQuery.input('latencyMs', scale.latencyMs || null);

            await reqQuery.query(`
                INSERT INTO dbo.BarcodeScales (
                    [Id], [Name], [Ip], [Port], [Model], [DepartmentId], [DepartmentName],
                    [Enabled], [LastSync], [LastStatus], [LatencyMs], [UpdatedAt]
                ) VALUES (
                    @id, @name, @ip, @port, @model, @departmentId, @departmentName,
                    @enabled, @lastSync, @lastStatus, @latencyMs, sysutcdatetime()
                );
            `);
        }

        return NextResponse.json({
            success: true,
            message: `تم حفظ ${scales.length} ميزان في قاعدة البيانات بنجاح`,
            count: scales.length
        });
    } catch (error: any) {
        console.error('[BarcodeScales API] POST error:', error);
        return NextResponse.json({
            success: false,
            message: `تعذر حفظ الموازين: ${error.message}`
        }, { status: 500 });
    }
}

export async function DELETE() {
    try {
        const pool = await getDbPool();
        await pool.request().query(`
            IF OBJECT_ID('dbo.BarcodeScales', 'U') IS NOT NULL
            BEGIN
                DELETE FROM dbo.BarcodeScales;
            END;
        `);
        return NextResponse.json({ success: true, message: 'تم مسح كافة الموازين من قاعدة البيانات' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
