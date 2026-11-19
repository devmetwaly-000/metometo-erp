import { NextResponse } from 'next/server';
import sql from 'mssql';
import { getDbPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SESSION_TTL_SECONDS = 60;

// Fallback in-memory lock when SQL Server is temporarily unreachable
const memorySessions = new Map<string, { token: string; deviceInfo: string; updatedAt: number }>();

async function ensureSessionsTable(pool: sql.ConnectionPool) {
    await pool.request().query(`
        IF OBJECT_ID('dbo.ActiveUserSessions', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.ActiveUserSessions (
                UserId NVARCHAR(64) NOT NULL PRIMARY KEY,
                SessionToken NVARCHAR(128) NOT NULL,
                DeviceInfo NVARCHAR(255) NULL,
                LastHeartbeat DATETIME2 NOT NULL DEFAULT GETUTCDATE()
            );
        END
    `);
}

export async function POST(req: Request) {
    let body: any = {};
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const { action, userId, sessionToken, deviceInfo } = body;
    if (!userId || !sessionToken) {
        return NextResponse.json({ success: false, error: 'Missing userId or sessionToken' }, { status: 400 });
    }

    try {
        const pool = await getDbPool();
        await ensureSessionsTable(pool);

        if (action === 'acquire') {
            const existing = await pool.request()
                .input('UserId', sql.NVarChar(64), String(userId))
                .query(`
                    SELECT SessionToken, DeviceInfo, DATEDIFF(SECOND, LastHeartbeat, GETUTCDATE()) AS AgeSeconds
                    FROM dbo.ActiveUserSessions
                    WHERE UserId = @UserId;
                `);

            const row = existing.recordset[0];
            if (row && row.SessionToken !== sessionToken && Number(row.AgeSeconds) < SESSION_TTL_SECONDS) {
                return NextResponse.json(
                    {
                        success: false,
                        activeElsewhere: true,
                        deviceInfo: row.DeviceInfo || 'جهاز آخر',
                        error: `هذا الحساب مفتوح حالياً على جهاز آخر (${row.DeviceInfo || 'جهاز آخر'}). يرجى إغلاق الجلسة الأخرى أولاً.`,
                    },
                    { status: 409 }
                );
            }

            await pool.request()
                .input('UserId', sql.NVarChar(64), String(userId))
                .input('SessionToken', sql.NVarChar(128), String(sessionToken))
                .input('DeviceInfo', sql.NVarChar(255), String(deviceInfo || 'متصفح الويب').slice(0, 255))
                .query(`
                    MERGE dbo.ActiveUserSessions AS target
                    USING (SELECT @UserId AS UserId) AS source
                    ON target.UserId = source.UserId
                    WHEN MATCHED THEN
                        UPDATE SET SessionToken = @SessionToken, DeviceInfo = @DeviceInfo, LastHeartbeat = GETUTCDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (UserId, SessionToken, DeviceInfo, LastHeartbeat)
                        VALUES (@UserId, @SessionToken, @DeviceInfo, GETUTCDATE());
                `);

            return NextResponse.json({ success: true });
        }

        if (action === 'heartbeat') {
            const existing = await pool.request()
                .input('UserId', sql.NVarChar(64), String(userId))
                .query(`
                    SELECT SessionToken, DeviceInfo, DATEDIFF(SECOND, LastHeartbeat, GETUTCDATE()) AS AgeSeconds
                    FROM dbo.ActiveUserSessions
                    WHERE UserId = @UserId;
                `);

            const row = existing.recordset[0];
            if (row && row.SessionToken !== sessionToken && Number(row.AgeSeconds) < SESSION_TTL_SECONDS) {
                return NextResponse.json(
                    {
                        success: false,
                        conflict: true,
                        deviceInfo: row.DeviceInfo || 'جهاز آخر',
                    },
                    { status: 409 }
                );
            }

            await pool.request()
                .input('UserId', sql.NVarChar(64), String(userId))
                .input('SessionToken', sql.NVarChar(128), String(sessionToken))
                .input('DeviceInfo', sql.NVarChar(255), String(deviceInfo || 'متصفح الويب').slice(0, 255))
                .query(`
                    MERGE dbo.ActiveUserSessions AS target
                    USING (SELECT @UserId AS UserId) AS source
                    ON target.UserId = source.UserId
                    WHEN MATCHED THEN
                        UPDATE SET SessionToken = @SessionToken, LastHeartbeat = GETUTCDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (UserId, SessionToken, DeviceInfo, LastHeartbeat)
                        VALUES (@UserId, @SessionToken, @DeviceInfo, GETUTCDATE());
                `);

            return NextResponse.json({ success: true });
        }

        if (action === 'release') {
            await pool.request()
                .input('UserId', sql.NVarChar(64), String(userId))
                .input('SessionToken', sql.NVarChar(128), String(sessionToken))
                .query(`
                    DELETE FROM dbo.ActiveUserSessions
                    WHERE UserId = @UserId AND SessionToken = @SessionToken;
                `);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    } catch {
        // Fallback in-memory session tracking if SQL Server is unavailable
        const now = Date.now();
        const existing = memorySessions.get(String(userId));

        if (action === 'acquire' || action === 'heartbeat') {
            if (existing && existing.token !== sessionToken && now - existing.updatedAt < SESSION_TTL_SECONDS * 1000) {
                return NextResponse.json(
                    {
                        success: false,
                        activeElsewhere: action === 'acquire',
                        conflict: action === 'heartbeat',
                        deviceInfo: existing.deviceInfo,
                        error: `هذا الحساب مفتوح حالياً على جهاز آخر (${existing.deviceInfo}).`,
                    },
                    { status: 409 }
                );
            }
            memorySessions.set(String(userId), {
                token: String(sessionToken),
                deviceInfo: String(deviceInfo || 'متصفح الويب'),
                updatedAt: now,
            });
            return NextResponse.json({ success: true, offlineFallback: true });
        }

        if (action === 'release') {
            if (existing?.token === sessionToken) {
                memorySessions.delete(String(userId));
            }
            return NextResponse.json({ success: true, offlineFallback: true });
        }

        return NextResponse.json({ success: true });
    }
}
