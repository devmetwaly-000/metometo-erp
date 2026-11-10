import sql from 'mssql';
import crypto from 'crypto';

function getDbConfig() {
    return {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER || 'localhost',
        database: process.env.DB_NAME,
        options: { encrypt: false, trustServerCertificate: true }
    };
}

export interface AuditLogInput {
    userId?: string;
    userName?: string;
    action: 'INSERT' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'APPROVE' | 'POST' | 'DEPRECIATE' | 'PUTAWAY';
    entity: string;
    entityId?: string;
    details?: string;
    previousState?: any;
    newState?: any;
    ipAddress?: string;
}

export async function logAuditEvent(input: AuditLogInput) {
    try {
        const pool = await sql.connect(getDbConfig());
        const id = `AUD-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
        const rawContent = `${id}-${input.action}-${input.entity}-${input.entityId}-${input.userId}-${new Date().toISOString()}`;
        const hash = crypto.createHash('sha256').update(rawContent).digest('hex');

        await pool.request()
            .input('Id', sql.NVarChar(64), id)
            .input('UserId', sql.NVarChar(64), input.userId || null)
            .input('UserName', sql.NVarChar(255), input.userName || 'النظام')
            .input('Action', sql.NVarChar(50), input.action)
            .input('Entity', sql.NVarChar(100), input.entity)
            .input('EntityId', sql.NVarChar(64), input.entityId || null)
            .input('Details', sql.NVarChar(sql.MAX), input.details || null)
            .input('PreviousState', sql.NVarChar(sql.MAX), input.previousState ? JSON.stringify(input.previousState) : null)
            .input('NewState', sql.NVarChar(sql.MAX), input.newState ? JSON.stringify(input.newState) : null)
            .input('IpAddress', sql.NVarChar(50), input.ipAddress || '127.0.0.1')
            .input('Hash', sql.NVarChar(128), hash)
            .query(`
                INSERT INTO dbo.AuditTrailLogs (Id, Timestamp, UserId, UserName, Action, Entity, EntityId, Details, PreviousState, NewState, IpAddress, Hash)
                VALUES (@Id, sysutcdatetime(), @UserId, @UserName, @Action, @Entity, @EntityId, @Details, @PreviousState, @NewState, @IpAddress, @Hash);
            `);
    } catch (e: any) {
        console.warn("Audit logging warning:", e.message);
    }
}

