import { NextResponse } from 'next/server';
import sql from 'mssql';
import { getDbPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    let body: any = {};
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'طلب غير صالح.' }, { status: 400 });
    }

    const { password } = body;
    const trimmed = String(password || '').trim();

    if (!trimmed) {
        return NextResponse.json({ success: false, error: 'يرجى إدخال كلمة المرور.' }, { status: 400 });
    }

    // Default master admin passwords
    const defaultMasterPasswords = ['admin', 'admin123', '123456', '200300400'];
    if (defaultMasterPasswords.includes(trimmed)) {
        return NextResponse.json({ success: true, verified: true });
    }

    try {
        const pool = await getDbPool();
        const check = await pool.request()
            .input('P', sql.NVarChar(128), trimmed)
            .query(`
                SELECT 1 FROM dbo.AppSettings WHERE SettingKey IN ('role_switch_password', 'sync_password', 'admin_password') AND SettingValue = @P
                UNION
                SELECT 1 FROM dbo.Users WHERE (LoginName = 'admin' OR Role = N'مسؤول' OR Role LIKE N'%مسؤول%' OR Role = N'Admin') AND Password = @P;
            `);

        if (check.recordset && check.recordset.length > 0) {
            return NextResponse.json({ success: true, verified: true });
        }

        return NextResponse.json({ success: false, error: 'كلمة المرور غير صحيحة.' }, { status: 401 });
    } catch (err: any) {
        if (defaultMasterPasswords.includes(trimmed)) {
            return NextResponse.json({ success: true, verified: true });
        }
        return NextResponse.json({ success: false, error: 'تعذر التحقق من كلمة المرور: ' + err.message }, { status: 500 });
    }
}
