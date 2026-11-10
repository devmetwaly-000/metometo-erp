import { NextResponse } from 'next/server';
import sql from 'mssql';
import { logAuditEvent } from '@/lib/audit-logger';

function getDbConfig() {
    return {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER || 'localhost',
        database: process.env.DB_NAME,
        options: { encrypt: false, trustServerCertificate: true }
    };
}

export async function GET() {
    try {
        const pool = await sql.connect(getDbConfig());
        const res = await pool.request().query(`
            SELECT TOP 200 * FROM dbo.ManufacturingOrders ORDER BY CreatedAt DESC
        `);
        return NextResponse.json({ success: true, orders: res.recordset });
    } catch (err: any) {
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action = 'create', order, userId, userName } = body;

        const pool = await sql.connect(getDbConfig());

        if (action === 'create') {
            const id = order.id || `mo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const orderNumber = order.orderNumber || `WO-${Date.now().toString().slice(-6)}`;
            const orderDate = order.orderDate ? new Date(order.orderDate) : new Date();
            const targetQty = Number(order.targetQuantity) || 1;
            const laborCost = Number(order.laborCost) || 0;
            const overheadCost = Number(order.overheadCost) || 0;
            const rawCost = Number(order.rawMaterialCost) || 0;
            const totalCost = rawCost + laborCost + overheadCost;
            const unitCost = targetQty > 0 ? totalCost / targetQty : 0;
            const bomJson = typeof order.bomDetails === 'string' ? order.bomDetails : JSON.stringify(order.bomDetails || []);

            await pool.request()
                .input('Id', sql.NVarChar(100), id)
                .input('OrderNumber', sql.NVarChar(50), orderNumber)
                .input('OrderDate', sql.DateTime2, orderDate)
                .input('FinishedItemId', sql.NVarChar(100), order.finishedItemId)
                .input('FinishedItemName', sql.NVarChar(200), order.finishedItemName || '')
                .input('TargetQuantity', sql.Decimal(18, 4), targetQty)
                .input('ProducedQuantity', sql.Decimal(18, 4), 0)
                .input('Status', sql.NVarChar(50), order.status || 'draft')
                .input('SourceWarehouseId', sql.NVarChar(100), order.sourceWarehouseId || 'main')
                .input('TargetWarehouseId', sql.NVarChar(100), order.targetWarehouseId || 'main')
                .input('RawMaterialCost', sql.Decimal(18, 4), rawCost)
                .input('LaborCost', sql.Decimal(18, 4), laborCost)
                .input('OverheadCost', sql.Decimal(18, 4), overheadCost)
                .input('TotalCost', sql.Decimal(18, 4), totalCost)
                .input('UnitCost', sql.Decimal(18, 4), unitCost)
                .input('BOMDetailsJson', sql.NVarChar(sql.MAX), bomJson)
                .input('Notes', sql.NVarChar(sql.MAX), order.notes || null)
                .input('CreatedBy', sql.NVarChar(100), userName || userId || 'Admin')
                .query(`
                    INSERT INTO dbo.ManufacturingOrders (
                        Id, OrderNumber, OrderDate, FinishedItemId, FinishedItemName,
                        TargetQuantity, ProducedQuantity, Status, SourceWarehouseId, TargetWarehouseId,
                        RawMaterialCost, LaborCost, OverheadCost, TotalCost, UnitCost,
                        BOMDetailsJson, Notes, CreatedBy, CreatedAt, UpdatedAt
                    ) VALUES (
                        @Id, @OrderNumber, @OrderDate, @FinishedItemId, @FinishedItemName,
                        @TargetQuantity, @ProducedQuantity, @Status, @SourceWarehouseId, @TargetWarehouseId,
                        @RawMaterialCost, @LaborCost, @OverheadCost, @TotalCost, @UnitCost,
                        @BOMDetailsJson, @Notes, @CreatedBy, GETDATE(), GETDATE()
                    )
                `);

            await logAuditEvent({
                action: 'INSERT',
                entity: 'ManufacturingOrder',
                entityId: id,
                userId: userId || 'system',
                userName: userName || 'النظام',
                details: `إنشاء أمر تشغيل وتصنيع رقم ${orderNumber} لصنف [${order.finishedItemName}] بكمية مستهدفة ${targetQty}`,
                newState: { orderNumber, finishedItemName: order.finishedItemName, targetQty, totalCost }
            });

            return NextResponse.json({ success: true, id, orderNumber });
        }

        if (action === 'update_status') {
            const { id, status, producedQuantity } = order;
            const updateReq = pool.request()
                .input('Id', sql.NVarChar(100), id)
                .input('Status', sql.NVarChar(50), status);

            let query = `UPDATE dbo.ManufacturingOrders SET Status = @Status, UpdatedAt = GETDATE()`;
            if (producedQuantity !== undefined) {
                updateReq.input('ProducedQuantity', sql.Decimal(18, 4), Number(producedQuantity));
                query += `, ProducedQuantity = @ProducedQuantity`;
            }
            query += ` WHERE Id = @Id`;

            await updateReq.query(query);

            await logAuditEvent({
                action: 'UPDATE',
                entity: 'ManufacturingOrder',
                entityId: id,
                userId: userId || 'system',
                userName: userName || 'النظام',
                details: `تحديث حالة أمر التصنيع إلى ${status}${producedQuantity ? ` بكمية فعلية ${producedQuantity}` : ''}`,
                newState: { status, producedQuantity }
            });

            return NextResponse.json({ success: true, message: 'تم تحديث أمر التصنيع بنجاح' });
        }

        return NextResponse.json({ success: false, message: 'إجراء غير معروف' }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}
