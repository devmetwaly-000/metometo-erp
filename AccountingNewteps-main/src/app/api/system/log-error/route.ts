import { NextRequest, NextResponse } from 'next/server';
import { logSystemError } from '@/lib/error-logger';
import { getDbPool, sql } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
        const userAgent = req.headers.get('user-agent') || 'Unknown';

        const errorId = await logSystemError({
            source: body.source || 'Client:Global',
            action: body.action || null,
            endpoint: body.endpoint || null,
            errorMessage: body.errorMessage || body.message || 'Client caught error',
            errorStack: body.errorStack || body.stack || null,
            errorCode: body.errorCode || null,
            statusCode: body.statusCode || 500,
            requestPayload: body.requestPayload || body.payload || null,
            userId: body.userId || null,
            userName: body.userName || null,
            branchCode: body.branchCode || null,
            warehouseId: body.warehouseId || null,
            ipAddress: ip,
            userAgent: userAgent
        });

        return NextResponse.json({ success: true, errorId });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const limit = Math.min(Number(searchParams.get('limit') || 100), 500);
        const resolved = searchParams.get('resolved');
        const search = searchParams.get('search');

        const pool = await getDbPool();

        // Ensure table exists safely before querying
        await pool.request().query(`
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
        `);

        let query = `
            SELECT TOP (@Limit)
                Id,
                Timestamp,
                Source,
                Action,
                Endpoint,
                ErrorMessage,
                ErrorStack,
                ErrorCode,
                StatusCode,
                RequestPayload,
                UserId,
                UserName,
                BranchCode,
                WarehouseId,
                IpAddress,
                UserAgent,
                IsResolved,
                ResolutionNotes,
                CreatedAt
            FROM dbo.SystemErrorLogs
            WHERE 1=1
        `;

        const request = pool.request().input('Limit', sql.Int, limit);

        if (resolved !== null && resolved !== undefined && resolved !== '') {
            query += ` AND IsResolved = @Resolved`;
            request.input('Resolved', sql.Bit, resolved === 'true' || resolved === '1' ? 1 : 0);
        }

        if (search) {
            query += ` AND (ErrorMessage LIKE @Search OR Source LIKE @Search OR Action LIKE @Search OR UserName LIKE @Search)`;
            request.input('Search', sql.NVarChar, `%${search}%`);
        }

        query += ` ORDER BY Timestamp DESC`;

        const result = await request.query(query);

        return NextResponse.json({
            success: true,
            count: result.recordset.length,
            errors: result.recordset
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
