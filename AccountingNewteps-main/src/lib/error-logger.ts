import { getDbPool, sql } from '@/lib/db';

export interface SystemErrorInput {
    source: string;              // e.g. 'API:db/action', 'API:db/sync', 'API:sync/central', 'Client:dbAction', 'Client:POS'
    action?: string;            // e.g. 'posSessions/update', 'salesInvoices/add', 'fetch'
    endpoint?: string;          // e.g. '/api/db/action'
    errorMessage: string;       // Error description or exception message
    errorStack?: string;        // Full stack trace if available
    errorCode?: string | number;// e.g. 207, 'ECONNREFUSED', 500
    statusCode?: number;        // HTTP status code (default: 500)
    requestPayload?: any;       // Request body/data (will be sanitized)
    userId?: string;            // Current user ID
    userName?: string;          // Current user name
    branchCode?: string;        // Current branch code
    warehouseId?: string;       // Current warehouse/branch ID
    ipAddress?: string;         // IP address of request
    userAgent?: string;         // Browser / Client agent
    isResolved?: boolean;       // Status flag
    resolutionNotes?: string;   // Notes if resolved
}

/**
 * Recursively sanitize sensitive keys (passwords, secrets, tokens) before logging to database.
 */
function sanitizePayload(data: any, depth = 0): any {
    if (depth > 5) return '[Truncated: Max Depth]';
    if (!data) return data;
    if (typeof data !== 'object') return data;

    if (Array.isArray(data)) {
        return data.slice(0, 50).map(item => sanitizePayload(item, depth + 1));
    }

    const sanitized: Record<string, any> = {};
    const sensitiveKeys = ['password', 'secret', 'token', 'authorization', 'creditcard', 'cvv', 'pin', 'clientsecret'];

    for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(s => lowerKey.includes(s))) {
            sanitized[key] = '***REDACTED***';
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizePayload(value, depth + 1);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

/**
 * Log an error into dbo.SystemErrorLogs table in SQL Server.
 * Always fails gracefully and never throws to prevent masking or blocking application operations.
 */
export async function logSystemError(input: SystemErrorInput): Promise<string | null> {
    try {
        const pool = await getDbPool();
        const id = `ERR-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        // Ensure table exists safely (idempotent DDL)
        const tableEnsureSql = `
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SystemErrorLogs')
            BEGIN
                CREATE TABLE dbo.[SystemErrorLogs] (
                    [Id] NVARCHAR(64) NOT NULL,
                    [Timestamp] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                    [Source] NVARCHAR(100) NOT NULL,
                    [Action] NVARCHAR(100) NULL,
                    [Endpoint] NVARCHAR(255) NULL,
                    [ErrorMessage] NVARCHAR(MAX) NOT NULL,
                    [ErrorStack] NVARCHAR(MAX) NULL,
                    [ErrorCode] NVARCHAR(50) NULL,
                    [StatusCode] INT NULL DEFAULT ((500)),
                    [RequestPayload] NVARCHAR(MAX) NULL,
                    [UserId] NVARCHAR(64) NULL,
                    [UserName] NVARCHAR(255) NULL,
                    [BranchCode] NVARCHAR(50) NULL,
                    [WarehouseId] NVARCHAR(64) NULL,
                    [IpAddress] NVARCHAR(50) NULL,
                    [UserAgent] NVARCHAR(500) NULL,
                    [IsResolved] BIT NOT NULL DEFAULT ((0)),
                    [ResolutionNotes] NVARCHAR(MAX) NULL,
                    [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                    [RowVersion] ROWVERSION,
                    CONSTRAINT [PK_SystemErrorLogs] PRIMARY KEY CLUSTERED ([Id])
                );
            END
        `;
        await pool.request().query(tableEnsureSql);

        // Prepare sanitized payload string
        let payloadString: string | null = null;
        if (input.requestPayload) {
            try {
                const cleaned = sanitizePayload(input.requestPayload);
                payloadString = typeof cleaned === 'string' ? cleaned : JSON.stringify(cleaned);
                if (payloadString.length > 50000) {
                    payloadString = payloadString.substring(0, 50000) + '... [Truncated Payload]';
                }
            } catch {
                payloadString = '[Serialization Error]';
            }
        }

        const msg = String(input.errorMessage || 'Unknown Error');
        const stack = input.errorStack ? String(input.errorStack).substring(0, 10000) : null;
        const code = input.errorCode !== undefined ? String(input.errorCode).substring(0, 50) : null;

        await pool.request()
            .input('Id', sql.NVarChar(64), id)
            .input('Source', sql.NVarChar(100), input.source.substring(0, 100))
            .input('Action', sql.NVarChar(100), input.action ? input.action.substring(0, 100) : null)
            .input('Endpoint', sql.NVarChar(255), input.endpoint ? input.endpoint.substring(0, 255) : null)
            .input('ErrorMessage', sql.NVarChar(sql.MAX), msg)
            .input('ErrorStack', sql.NVarChar(sql.MAX), stack)
            .input('ErrorCode', sql.NVarChar(50), code)
            .input('StatusCode', sql.Int, input.statusCode || 500)
            .input('RequestPayload', sql.NVarChar(sql.MAX), payloadString)
            .input('UserId', sql.NVarChar(64), input.userId || null)
            .input('UserName', sql.NVarChar(255), input.userName || null)
            .input('BranchCode', sql.NVarChar(50), input.branchCode || null)
            .input('WarehouseId', sql.NVarChar(64), input.warehouseId || null)
            .input('IpAddress', sql.NVarChar(50), input.ipAddress ? input.ipAddress.substring(0, 50) : null)
            .input('UserAgent', sql.NVarChar(500), input.userAgent ? input.userAgent.substring(0, 500) : null)
            .input('IsResolved', sql.Bit, input.isResolved ? 1 : 0)
            .input('ResolutionNotes', sql.NVarChar(sql.MAX), input.resolutionNotes || null)
            .query(`
                INSERT INTO dbo.SystemErrorLogs 
                (Id, Timestamp, Source, Action, Endpoint, ErrorMessage, ErrorStack, ErrorCode, StatusCode, RequestPayload, UserId, UserName, BranchCode, WarehouseId, IpAddress, UserAgent, IsResolved, ResolutionNotes, CreatedAt)
                VALUES 
                (@Id, sysutcdatetime(), @Source, @Action, @Endpoint, @ErrorMessage, @ErrorStack, @ErrorCode, @StatusCode, @RequestPayload, @UserId, @UserName, @BranchCode, @WarehouseId, @IpAddress, @UserAgent, @IsResolved, @ResolutionNotes, sysutcdatetime());
            `);

        return id;
    } catch (err: any) {
        // Fallback console log: logging must never crash caller
        console.error('[ErrorLogger SQL Failure]:', err.message);
        return null;
    }
}
