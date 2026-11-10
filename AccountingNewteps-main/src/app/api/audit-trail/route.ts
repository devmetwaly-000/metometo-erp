import { NextResponse } from 'next/server';
import sql from 'mssql';

function getDbConfig() {
    return {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER || 'localhost',
        database: process.env.DB_NAME,
        options: { encrypt: false, trustServerCertificate: true }
    };
}

export async function GET(req: Request) {
    try {
        const pool = await sql.connect(getDbConfig());
        const result = await pool.request().query(`
            SELECT TOP 200 * FROM dbo.AuditTrailLogs ORDER BY Timestamp DESC
        `);
        return NextResponse.json({ success: true, logs: result.recordset });
    } catch (err: any) {
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}

