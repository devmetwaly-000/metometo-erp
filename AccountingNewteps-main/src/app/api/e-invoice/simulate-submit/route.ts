import { NextResponse } from 'next/server';
import { buildEtaDocument, simulateNoTokenSubmission, computeCanonicalHash, generateTlvQrCode } from '@/lib/e-invoice-engine';
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

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { invoice, settings, mode = 'simulate_no_token' } = body;

        if (!invoice) {
            return NextResponse.json({ success: false, message: 'بيانات الفاتورة غير متوفرة' }, { status: 400 });
        }

        // Build official ETA v1.0 document
        const etaDoc = buildEtaDocument(invoice, settings);

        let result: any;

        if (mode === 'simulate_no_token') {
            // No-token software simulation
            result = simulateNoTokenSubmission(etaDoc);

            // If an invoice ID is provided, update invoice in database with ETA UUID and status
            if (invoice.id) {
                try {
                    const pool = await sql.connect(getDbConfig());
                    await pool.request()
                        .input('Id', sql.NVarChar(64), invoice.id)
                        .input('EtaUuid', sql.NVarChar(64), result.uuid)
                        .input('EtaStatus', sql.NVarChar(50), 'Valid')
                        .input('EtaSubmissionId', sql.NVarChar(64), result.submissionId)
                        .query(`
                            IF EXISTS (SELECT 1 FROM dbo.SalesInvoices WHERE Id = @Id)
                            BEGIN
                                UPDATE dbo.SalesInvoices
                                SET EtaUuid = @EtaUuid,
                                    EtaStatus = @EtaStatus,
                                    EtaSubmissionId = @EtaSubmissionId,
                                    UpdatedAt = sysutcdatetime()
                                WHERE Id = @Id;
                            END
                        `);
                } catch (dbErr: any) {
                    console.warn("Could not save ETA UUID to DB directly:", dbErr.message);
                }
            }
        } else {
            // Standard hardware token mode
            const docHash = computeCanonicalHash(etaDoc);
            result = {
                success: true,
                mode: 'hardware_token_required',
                canonicalHash: docHash,
                doc: etaDoc,
                message: 'تم تجهيز مستند الفاتورة بنجاح. بانتظار توقيعه عبر فلاشة التوقيع USB Token (Signer Daemon).'
            };
        }

        return NextResponse.json(result);
    } catch (err: any) {
        return NextResponse.json({
            success: false,
            message: `خطأ أثناء معالجة الفاتورة الإلكترونية: ${err.message}`
        }, { status: 500 });
    }
}

