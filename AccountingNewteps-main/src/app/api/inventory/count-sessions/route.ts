import { NextRequest, NextResponse } from 'next/server';
import { getDbPool, getLocalDbConfig } from '@/lib/db';
import sql from 'mssql';

export const dynamic = 'force-dynamic';

function isIndexedDbMode(): boolean {
    const localCfg = getLocalDbConfig();
    const serverName = String(localCfg.server || '').toLowerCase().trim();
    return serverName === 'indexeddb' || serverName.includes('indexeddb') || serverName === 'browser';
}

async function ensureTables(pool: sql.ConnectionPool) {
    await pool.request().query(`
        IF OBJECT_ID('dbo.InventoryCountSessions', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.InventoryCountSessions (
                Id NVARCHAR(64) PRIMARY KEY,
                SessionCode NVARCHAR(100) NOT NULL,
                WarehouseId NVARCHAR(64) NOT NULL,
                WarehouseSectionId NVARCHAR(64) NULL,
                AdjustmentType NVARCHAR(50) NOT NULL,
                SnapshotDate DATETIME2 NOT NULL,
                SnapshotDateStr NVARCHAR(20) NOT NULL,
                CatalogScope NVARCHAR(50) NULL,
                ScopeLabel NVARCHAR(500) NULL,
                FrozenBalancesJson NVARCHAR(MAX) NOT NULL,
                Status NVARCHAR(30) NOT NULL DEFAULT 'open',
                CreatedById NVARCHAR(64) NULL,
                CreatedByName NVARCHAR(255) NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                ConsolidatedAt DATETIME2 NULL,
                ConsolidatedRecordId NVARCHAR(64) NULL,
                Notes NVARCHAR(MAX) NULL
            );
        END

        IF OBJECT_ID('dbo.InventoryCountSheets', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.InventoryCountSheets (
                Id NVARCHAR(64) PRIMARY KEY,
                SessionId NVARCHAR(64) NOT NULL,
                DeviceName NVARCHAR(255) NOT NULL,
                SubmittedById NVARCHAR(64) NULL,
                SubmittedByName NVARCHAR(255) NULL,
                ItemsJson NVARCHAR(MAX) NOT NULL,
                Notes NVARCHAR(MAX) NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );
        END
    `);
}

function parseJsonSafe<T>(val: any, fallback: T): T {
    if (!val) return fallback;
    try {
        return JSON.parse(val);
    } catch {
        return fallback;
    }
}

export async function GET(req: NextRequest) {
    if (isIndexedDbMode()) {
        return NextResponse.json({ success: true, isIndexedDb: true, sessions: [] });
    }

    try {
        const pool = await getDbPool();
        await ensureTables(pool);

        const statusFilter = req.nextUrl.searchParams.get('status');
        const sessionsQuery = statusFilter
            ? pool.request().input('Status', sql.NVarChar(30), statusFilter).query(`
                SELECT * FROM dbo.InventoryCountSessions
                WHERE Status = @Status
                ORDER BY CreatedAt DESC
            `)
            : pool.request().query(`
                SELECT * FROM dbo.InventoryCountSessions
                ORDER BY CreatedAt DESC
            `);

        const [sessionsRes, sheetsRes] = await Promise.all([
            sessionsQuery,
            pool.request().query(`SELECT * FROM dbo.InventoryCountSheets ORDER BY CreatedAt ASC`)
        ]);

        const sheetsBySession = new Map<string, any[]>();
        for (const row of sheetsRes.recordset) {
            const sessionId = row.SessionId || row.sessionId;
            const sheet = {
                id: row.Id || row.id,
                sessionId,
                deviceName: row.DeviceName || row.deviceName || 'جهاز جرد',
                submittedById: row.SubmittedById || row.submittedById || '',
                submittedByName: row.SubmittedByName || row.submittedByName || '',
                items: parseJsonSafe<any[]>(row.ItemsJson || row.itemsJson, []),
                notes: row.Notes || row.notes || '',
                createdAt: row.CreatedAt || row.createdAt
            };
            if (!sheetsBySession.has(sessionId)) sheetsBySession.set(sessionId, []);
            sheetsBySession.get(sessionId)!.push(sheet);
        }

        const sessions = sessionsRes.recordset.map((row: any) => {
            const id = row.Id || row.id;
            return {
                id,
                sessionCode: row.SessionCode || row.sessionCode,
                warehouseId: row.WarehouseId || row.warehouseId,
                warehouseSectionId: row.WarehouseSectionId || row.warehouseSectionId || undefined,
                adjustmentType: row.AdjustmentType || row.adjustmentType || 'periodic_count',
                snapshotDate: row.SnapshotDate || row.snapshotDate,
                snapshotDateStr: row.SnapshotDateStr || row.snapshotDateStr,
                catalogScope: row.CatalogScope || row.catalogScope || 'all',
                scopeLabel: row.ScopeLabel || row.scopeLabel || '',
                frozenBalances: parseJsonSafe<Record<string, number>>(row.FrozenBalancesJson || row.frozenBalancesJson, {}),
                status: row.Status || row.status || 'open',
                createdById: row.CreatedById || row.createdById || '',
                createdByName: row.CreatedByName || row.createdByName || '',
                createdAt: row.CreatedAt || row.createdAt,
                consolidatedAt: row.ConsolidatedAt || row.consolidatedAt || null,
                consolidatedRecordId: row.ConsolidatedRecordId || row.consolidatedRecordId || null,
                notes: row.Notes || row.notes || '',
                sheets: sheetsBySession.get(id) || []
            };
        });

        return NextResponse.json({ success: true, sessions });
    } catch (error: any) {
        console.error('Error loading inventory count sessions:', error);
        return NextResponse.json({ success: false, error: error.message || 'Server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    if (isIndexedDbMode()) {
        return NextResponse.json({ success: true, isIndexedDb: true });
    }

    try {
        const body = await req.json();
        const { action } = body;
        const pool = await getDbPool();
        await ensureTables(pool);

        if (action === 'create_session') {
            const id = body.id || `ics_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const snapshotDateStr = String(body.snapshotDateStr || '').slice(0, 10);
            const snapshotDate = body.snapshotDate ? new Date(body.snapshotDate) : new Date(`${snapshotDateStr}T23:59:59.999`);
            const sessionCode = body.sessionCode || `جرد-${snapshotDateStr}-${Math.floor(100 + Math.random() * 900)}`;

            await pool.request()
                .input('Id', sql.NVarChar(64), id)
                .input('SessionCode', sql.NVarChar(100), sessionCode)
                .input('WarehouseId', sql.NVarChar(64), String(body.warehouseId))
                .input('WarehouseSectionId', sql.NVarChar(64), body.warehouseSectionId && body.warehouseSectionId !== 'all' ? String(body.warehouseSectionId) : null)
                .input('AdjustmentType', sql.NVarChar(50), String(body.adjustmentType || 'periodic_count'))
                .input('SnapshotDate', sql.DateTime2, snapshotDate)
                .input('SnapshotDateStr', sql.NVarChar(20), snapshotDateStr)
                .input('CatalogScope', sql.NVarChar(50), String(body.catalogScope || 'all'))
                .input('ScopeLabel', sql.NVarChar(500), body.scopeLabel ? String(body.scopeLabel) : null)
                .input('FrozenBalancesJson', sql.NVarChar(sql.MAX), JSON.stringify(body.frozenBalances || {}))
                .input('CreatedById', sql.NVarChar(64), body.createdById ? String(body.createdById) : null)
                .input('CreatedByName', sql.NVarChar(255), body.createdByName ? String(body.createdByName) : null)
                .input('Notes', sql.NVarChar(sql.MAX), body.notes ? String(body.notes) : null)
                .query(`
                    INSERT INTO dbo.InventoryCountSessions (
                        Id, SessionCode, WarehouseId, WarehouseSectionId, AdjustmentType,
                        SnapshotDate, SnapshotDateStr, CatalogScope, ScopeLabel, FrozenBalancesJson,
                        Status, CreatedById, CreatedByName, Notes
                    ) VALUES (
                        @Id, @SessionCode, @WarehouseId, @WarehouseSectionId, @AdjustmentType,
                        @SnapshotDate, @SnapshotDateStr, @CatalogScope, @ScopeLabel, @FrozenBalancesJson,
                        'open', @CreatedById, @CreatedByName, @Notes
                    );
                `);

            return NextResponse.json({ success: true, id, sessionCode });
        }

        if (action === 'submit_sheet') {
            const id = body.id || `icsh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const sessionId = String(body.sessionId || '');
            if (!sessionId) {
                return NextResponse.json({ success: false, error: 'sessionId is required' }, { status: 400 });
            }

            const checkRes = await pool.request()
                .input('SessionId', sql.NVarChar(64), sessionId)
                .query(`SELECT Status FROM dbo.InventoryCountSessions WHERE Id = @SessionId`);

            if (checkRes.recordset.length === 0 || checkRes.recordset[0].Status !== 'open') {
                return NextResponse.json({ success: false, error: 'جلسة الجرد غير موجودة أو تم إغلاقها بالفعل.' }, { status: 400 });
            }

            await pool.request()
                .input('Id', sql.NVarChar(64), id)
                .input('SessionId', sql.NVarChar(64), sessionId)
                .input('DeviceName', sql.NVarChar(255), String(body.deviceName || 'جهاز جرد'))
                .input('SubmittedById', sql.NVarChar(64), body.submittedById ? String(body.submittedById) : null)
                .input('SubmittedByName', sql.NVarChar(255), body.submittedByName ? String(body.submittedByName) : null)
                .input('ItemsJson', sql.NVarChar(sql.MAX), JSON.stringify(body.items || []))
                .input('Notes', sql.NVarChar(sql.MAX), body.notes ? String(body.notes) : null)
                .query(`
                    INSERT INTO dbo.InventoryCountSheets (
                        Id, SessionId, DeviceName, SubmittedById, SubmittedByName, ItemsJson, Notes
                    ) VALUES (
                        @Id, @SessionId, @DeviceName, @SubmittedById, @SubmittedByName, @ItemsJson, @Notes
                    );
                `);

            return NextResponse.json({ success: true, id });
        }

        if (action === 'remove_sheet') {
            const sheetId = String(body.sheetId || '');
            const sessionId = String(body.sessionId || '');
            await pool.request()
                .input('Id', sql.NVarChar(64), sheetId)
                .input('SessionId', sql.NVarChar(64), sessionId)
                .query(`
                    DELETE s FROM dbo.InventoryCountSheets s
                    INNER JOIN dbo.InventoryCountSessions sess ON sess.Id = s.SessionId
                    WHERE s.Id = @Id AND s.SessionId = @SessionId AND sess.Status = 'open';
                `);
            return NextResponse.json({ success: true });
        }

        if (action === 'consolidate_session') {
            const sessionId = String(body.sessionId || '');
            const recordId = body.recordId ? String(body.recordId) : null;
            await pool.request()
                .input('Id', sql.NVarChar(64), sessionId)
                .input('RecordId', sql.NVarChar(64), recordId)
                .query(`
                    UPDATE dbo.InventoryCountSessions
                    SET Status = 'consolidated',
                        ConsolidatedAt = SYSUTCDATETIME(),
                        ConsolidatedRecordId = @RecordId
                    WHERE Id = @Id;
                `);
            return NextResponse.json({ success: true });
        }

        if (action === 'cancel_session') {
            const sessionId = String(body.sessionId || '');
            await pool.request()
                .input('Id', sql.NVarChar(64), sessionId)
                .query(`
                    UPDATE dbo.InventoryCountSessions
                    SET Status = 'cancelled'
                    WHERE Id = @Id AND Status = 'open';
                `);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
    } catch (error: any) {
        console.error('Error in inventory count sessions POST:', error);
        return NextResponse.json({ success: false, error: error.message || 'Server error' }, { status: 500 });
    }
}
