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

function buildManufacturingLedgerEntries(input: {
    suffix: string; orderNumber: string; batchNumber: string; issueId: string; receiptId: string;
    usedMaterialCost: number; wastedMaterialCost: number; laborCost: number; overheadCost: number;
    wasteTreatment: string; finishedGoodsCost: number; damagedOutputCost: number;
    abnormalScrapQty: number; producedQty: number;
}) {
    const wasteChargedToWip = input.wasteTreatment === 'allocate_to_good' ? input.wastedMaterialCost : 0;
    const materialLines: any[] = [];
    const materialWipCost = input.usedMaterialCost + wasteChargedToWip;
    const rawCredit = input.usedMaterialCost + input.wastedMaterialCost;
    if (materialWipCost > 0) materialLines.push({ accountCode: '1107', accountName: 'إنتاج تحت التشغيل', debit: materialWipCost, credit: 0, memo: 'خامات مستخدمة وهدر محمل على أمر التصنيع' });
    if (input.wasteTreatment !== 'allocate_to_good' && input.wastedMaterialCost > 0) materialLines.push({ accountCode: '5207', accountName: 'خسائر وهالك التصنيع', debit: input.wastedMaterialCost, credit: 0, memo: 'هدر خامات محمل مباشرة على خسائر التصنيع' });
    if (rawCredit > 0) materialLines.push({ accountCode: '1103', accountName: 'مخزون الخامات', debit: 0, credit: rawCredit, memo: 'صرف خامات أمر التصنيع' });

    const costLines: any[] = [];
    if (input.laborCost > 0) {
        costLines.push({ accountCode: '1107', accountName: 'إنتاج تحت التشغيل', debit: input.laborCost, credit: 0, memo: 'تحميل أجور العمل المباشرة على الأمر' });
        costLines.push({ accountCode: '2103', accountName: 'مستحقات عاملين ومصروفات مستحقة', debit: 0, credit: input.laborCost, memo: 'إثبات أجور تصنيع مستحقة' });
    }
    if (input.overheadCost > 0) {
        costLines.push({ accountCode: '1107', accountName: 'إنتاج تحت التشغيل', debit: input.overheadCost, credit: 0, memo: 'تحميل التكاليف الصناعية غير المباشرة على الأمر' });
        costLines.push({ accountCode: '2103', accountName: 'مستحقات عاملين ومصروفات مستحقة', debit: 0, credit: input.overheadCost, memo: 'إثبات تكاليف صناعية مستحقة' });
    }

    const abnormalWasteCost = input.damagedOutputCost;
    const wipTotalCost = materialWipCost + input.laborCost + input.overheadCost;
    const completionLines: any[] = [];
    if (input.finishedGoodsCost > 0) completionLines.push({ accountCode: '1103', accountName: 'مخزون المنتجات التامة', debit: input.finishedGoodsCost, credit: 0, memo: `استلام ${input.producedQty} وحدة سليمة بالتكلفة الفعلية` });
    if (abnormalWasteCost > 0) completionLines.push({ accountCode: '5207', accountName: 'خسائر وهالك التصنيع', debit: abnormalWasteCost, credit: 0, memo: `تحميل الهالك غير الطبيعي (${input.abnormalScrapQty} وحدة) على الخسائر` });
    if (wipTotalCost > 0) completionLines.push({ accountCode: '1107', accountName: 'إنتاج تحت التشغيل', debit: 0, credit: wipTotalCost, memo: 'إقفال تكلفة الأمر وتحويل الإنتاج والتالف إلى التصنيف النهائي' });

    return {
        wipTotalCost,
        entries: [
            { id: `GL-MFG-I-${input.suffix}`, number: `${input.orderNumber}-صرف`, sourceType: 'production_material_issue', sourceId: input.issueId, description: `صرف خامات لأمر ${input.orderNumber}، التشغيلة ${input.batchNumber}`, lines: materialLines },
            { id: `GL-MFG-C-${input.suffix}`, number: `${input.orderNumber}-تكاليف`, sourceType: 'production_cost_accrual', sourceId: `MFG-COST-${input.suffix}`, description: `تحميل أجور وتكاليف صناعية لأمر ${input.orderNumber}، التشغيلة ${input.batchNumber}`, lines: costLines },
            { id: `GL-MFG-R-${input.suffix}`, number: `${input.orderNumber}-إنتاج`, sourceType: 'production_completion', sourceId: input.receiptId, description: `تحويل إنتاج تام وإقفال الهالك لأمر ${input.orderNumber}، التشغيلة ${input.batchNumber}`, lines: completionLines },
        ],
    };
}

async function insertManufacturingLedgerEntries(tx: sql.Transaction, entries: any[], values: { date: Date; warehouseId: string; sourceNumber: string; userId: string | null; userName: string }) {
    const ids: string[] = [];
    for (const entry of entries) {
        if (!entry.lines.length) continue;
        const debit = entry.lines.reduce((sum: number, line: any) => sum + (Number(line.debit) || 0), 0);
        const credit = entry.lines.reduce((sum: number, line: any) => sum + (Number(line.credit) || 0), 0);
        if (entry.lines.length < 2 || Math.abs(debit - credit) > 0.05) throw new Error(`قيد التصنيع (${entry.number}) غير متوازن؛ لم يتم اعتماد مستندات الإنتاج.`);
        await new sql.Request(tx)
            .input('Id', sql.NVarChar(64), entry.id).input('EntryNumber', sql.NVarChar(100), entry.number)
            .input('Date', sql.DateTime2, values.date).input('SourceType', sql.NVarChar(50), entry.sourceType)
            .input('SourceId', sql.NVarChar(64), entry.sourceId).input('SourceNumber', sql.NVarChar(100), values.sourceNumber)
            .input('WarehouseId', sql.NVarChar(64), values.warehouseId).input('Description', sql.NVarChar(sql.MAX), entry.description)
            .input('TotalDebit', sql.Decimal(18, 4), debit).input('TotalCredit', sql.Decimal(18, 4), credit)
            .input('LinesJson', sql.NVarChar(sql.MAX), JSON.stringify(entry.lines)).input('CreatedById', sql.NVarChar(64), values.userId)
            .input('CreatedByName', sql.NVarChar(255), values.userName)
            .query(`INSERT INTO dbo.GeneralLedgerEntries (Id, EntryNumber, Date, SourceType, SourceId, SourceNumber, WarehouseId, Description, Status, TotalDebit, TotalCredit, LinesJson, CreatedById, CreatedByName)
                VALUES (@Id, @EntryNumber, @Date, @SourceType, @SourceId, @SourceNumber, @WarehouseId, @Description, 'posted', @TotalDebit, @TotalCredit, @LinesJson, @CreatedById, @CreatedByName)`);
        ids.push(entry.id);
    }
    if (!ids.length) throw new Error('لا توجد تكاليف قابلة للترحيل في أمر التصنيع.');
    return ids;
}

async function getWarehouseItemBalance(tx: sql.Transaction, warehouseId: string, itemId: string) {
    const result = await new sql.Request(tx)
        .input('WarehouseId', sql.NVarChar(100), warehouseId)
        .input('ItemId', sql.NVarChar(100), itemId)
        .query(`
            WITH LastClosing AS (
                SELECT TOP 1 ClosingDate, BalancesJson FROM dbo.InventoryClosings WHERE WarehouseId = @WarehouseId ORDER BY ClosingDate DESC
            ), Movements AS (
                SELECT s.Date, s.WarehouseId, 1 AS Direction, COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id')) AS ItemId,
                    COALESCE(TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.quantity')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Quantity')),0) AS Qty
                FROM dbo.StockInRecords s CROSS APPLY OPENJSON(CASE WHEN ISJSON(s.ItemsJson)=1 THEN s.ItemsJson ELSE '[]' END) j
                WHERE LOWER(COALESCE(s.Status,'approved')) NOT IN ('draft','pending','in_transit')
                UNION ALL
                SELECT s.Date, COALESCE(s.WarehouseId,s.SourceId), -1, COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id')),
                    COALESCE(TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.quantity')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Quantity')),0)
                FROM dbo.StockOutRecords s CROSS APPLY OPENJSON(CASE WHEN ISJSON(s.ItemsJson)=1 THEN s.ItemsJson ELSE '[]' END) j
                WHERE LOWER(COALESCE(s.Status,'approved')) IN ('approved','completed','fulfilled','dispatched')
                UNION ALL
                SELECT s.Date,s.WarehouseId,-1,COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id')),
                    COALESCE(TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.quantity')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Quantity')),0)
                FROM dbo.SalesInvoices s CROSS APPLY OPENJSON(CASE WHEN ISJSON(s.ItemsJson)=1 THEN s.ItemsJson ELSE '[]' END) j
                WHERE LOWER(COALESCE(s.Status,'approved')) IN ('approved','completed')
                UNION ALL
                SELECT s.Date,s.WarehouseId,1,COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id')),
                    COALESCE(TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.quantity')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Quantity')),0)
                FROM dbo.SalesReturns s CROSS APPLY OPENJSON(CASE WHEN ISJSON(s.ItemsJson)=1 THEN s.ItemsJson ELSE '[]' END) j
                UNION ALL
                SELECT s.Date,s.WarehouseId,-1,COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id')),
                    COALESCE(TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.quantity')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Quantity')),0)
                FROM dbo.PurchaseReturns s CROSS APPLY OPENJSON(CASE WHEN ISJSON(s.ItemsJson)=1 THEN s.ItemsJson ELSE '[]' END) j
                UNION ALL
                SELECT a.Date,a.WarehouseId,0,COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id')),
                    COALESCE(TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.difference')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Difference')),0)
                FROM dbo.StockAdjustmentRecords a CROSS APPLY OPENJSON(CASE WHEN ISJSON(a.ItemsJson)=1 THEN a.ItemsJson ELSE '[]' END) j
                UNION ALL
                SELECT r.Date,r.WarehouseId,-1,COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id')),
                    COALESCE(TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.quantity')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Quantity')),0)
                FROM dbo.StockIssuesToReps r CROSS APPLY OPENJSON(CASE WHEN ISJSON(r.ItemsJson)=1 THEN r.ItemsJson ELSE '[]' END) j
                UNION ALL
                SELECT r.Date,r.WarehouseId,1,COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id')),
                    COALESCE(TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.quantity')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Quantity')),0)
                FROM dbo.StockReturnsFromReps r CROSS APPLY OPENJSON(CASE WHEN ISJSON(r.ItemsJson)=1 THEN r.ItemsJson ELSE '[]' END) j
                UNION ALL
                SELECT t.Date,t.FromWarehouseId,-1,COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id')),
                    COALESCE(TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.quantity')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Quantity')),0)
                FROM dbo.StockTransferRecords t CROSS APPLY OPENJSON(CASE WHEN ISJSON(t.ItemsJson)=1 THEN t.ItemsJson ELSE '[]' END) j
                UNION ALL
                SELECT t.Date,t.ToWarehouseId,1,COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id')),
                    COALESCE(TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Qty')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.quantity')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Quantity')),0)
                FROM dbo.StockTransferRecords t CROSS APPLY OPENJSON(CASE WHEN ISJSON(t.ItemsJson)=1 THEN t.ItemsJson ELSE '[]' END) j
            ), ClosingStock AS (
                SELECT COALESCE(SUM(COALESCE(TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.balance')),TRY_CONVERT(DECIMAL(18,4),JSON_VALUE(j.value,'$.Balance')),0)),0) AS Qty
                FROM LastClosing c CROSS APPLY OPENJSON(CASE WHEN ISJSON(c.BalancesJson)=1 THEN c.BalancesJson ELSE '[]' END) j
                WHERE COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id'))=@ItemId
            )
            SELECT COALESCE((SELECT Qty FROM ClosingStock),0)+COALESCE(SUM(CASE WHEN m.Direction=0 THEN m.Qty ELSE m.Direction*m.Qty END),0) AS AvailableQty
            FROM Movements m LEFT JOIN LastClosing c ON 1=1
            WHERE m.WarehouseId=@WarehouseId AND m.ItemId=@ItemId AND m.Date>COALESCE(c.ClosingDate,CONVERT(DATETIME2,'19000101'));
        `);
    return Number(result.recordset[0]?.AvailableQty) || 0;
}

export async function GET() {
    try {
        const pool = await sql.connect(getDbConfig());
        await pool.request().query(`
            IF COL_LENGTH('dbo.ManufacturingOrders', 'BatchNumber') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD BatchNumber NVARCHAR(100) NULL;
            IF COL_LENGTH('dbo.ManufacturingOrders', 'ProfitMarginPercent') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD ProfitMarginPercent DECIMAL(9,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_ProfitMarginPercent DEFAULT (25);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'EstimatedSalePrice') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD EstimatedSalePrice DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_EstimatedSalePrice DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'SalePrice') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD SalePrice DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_SalePrice DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'WasteTreatment') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD WasteTreatment NVARCHAR(30) NULL;
            IF COL_LENGTH('dbo.ManufacturingOrders', 'WastedMaterialCost') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD WastedMaterialCost DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_WastedMaterialCost DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'DamagedOutputCost') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD DamagedOutputCost DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_DamagedOutputCost DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'BaseFinishedGoodsCost') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD BaseFinishedGoodsCost DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_BaseFinishedGoodsCost DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'AllocatedWasteCost') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD AllocatedWasteCost DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_AllocatedWasteCost DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'AllocatedWasteCostPerUnit') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD AllocatedWasteCostPerUnit DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_AllocatedWasteCostPerUnit DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'ItemCostUpdated') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD ItemCostUpdated BIT NOT NULL CONSTRAINT DF_ManufacturingOrders_ItemCostUpdated DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'ItemSalePriceUpdated') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD ItemSalePriceUpdated BIT NOT NULL CONSTRAINT DF_ManufacturingOrders_ItemSalePriceUpdated DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'ExpectedScrapPercent') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD ExpectedScrapPercent DECIMAL(9,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_ExpectedScrapPercent DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'NormalScrapQuantity') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD NormalScrapQuantity DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_NormalScrapQuantity DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'AbnormalScrapQuantity') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD AbnormalScrapQuantity DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_AbnormalScrapQuantity DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'NormalScrapCost') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD NormalScrapCost DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_NormalScrapCost DEFAULT (0);
        `);
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
        await pool.request().query(`
            IF COL_LENGTH('dbo.ManufacturingOrders', 'BatchNumber') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD BatchNumber NVARCHAR(100) NULL;
            IF COL_LENGTH('dbo.ManufacturingOrders', 'ProfitMarginPercent') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD ProfitMarginPercent DECIMAL(9,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_ProfitMarginPercent DEFAULT (25);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'EstimatedSalePrice') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD EstimatedSalePrice DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_EstimatedSalePrice DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'SalePrice') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD SalePrice DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_SalePrice DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'WasteTreatment') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD WasteTreatment NVARCHAR(30) NULL;
            IF COL_LENGTH('dbo.ManufacturingOrders', 'WastedMaterialCost') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD WastedMaterialCost DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_WastedMaterialCost DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'DamagedOutputCost') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD DamagedOutputCost DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_DamagedOutputCost DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'BaseFinishedGoodsCost') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD BaseFinishedGoodsCost DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_BaseFinishedGoodsCost DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'AllocatedWasteCost') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD AllocatedWasteCost DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_AllocatedWasteCost DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'AllocatedWasteCostPerUnit') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD AllocatedWasteCostPerUnit DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_AllocatedWasteCostPerUnit DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'ItemCostUpdated') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD ItemCostUpdated BIT NOT NULL CONSTRAINT DF_ManufacturingOrders_ItemCostUpdated DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'ItemSalePriceUpdated') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD ItemSalePriceUpdated BIT NOT NULL CONSTRAINT DF_ManufacturingOrders_ItemSalePriceUpdated DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'ExpectedScrapPercent') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD ExpectedScrapPercent DECIMAL(9,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_ExpectedScrapPercent DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'NormalScrapQuantity') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD NormalScrapQuantity DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_NormalScrapQuantity DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'AbnormalScrapQuantity') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD AbnormalScrapQuantity DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_AbnormalScrapQuantity DEFAULT (0);
            IF COL_LENGTH('dbo.ManufacturingOrders', 'NormalScrapCost') IS NULL ALTER TABLE dbo.ManufacturingOrders ADD NormalScrapCost DECIMAL(18,4) NOT NULL CONSTRAINT DF_ManufacturingOrders_NormalScrapCost DEFAULT (0);
        `);

        if (action === 'recalculate_accounting') {
            const orderId = String(body.orderId || '');
            if (!orderId) throw new Error('رقم أمر التصنيع مطلوب لإعادة احتساب القيد.');
            const tx = new sql.Transaction(pool);
            await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
            try {
                const orderResult = await new sql.Request(tx).input('Id', sql.NVarChar(100), orderId)
                    .query(`SELECT TOP 1 * FROM dbo.ManufacturingOrders WITH (UPDLOCK,HOLDLOCK) WHERE Id=@Id`);
                const orderRow = orderResult.recordset[0];
                if (!orderRow || String(orderRow.Status).toLowerCase() !== 'completed') throw new Error('إعادة احتساب القيود متاحة للتشغيلات المكتملة فقط.');
                const outputResult = await new sql.Request(tx)
                    .input('ReceiptNumber', sql.NVarChar(100), `${orderRow.OrderNumber}-إنتاج-تام`)
                    .query(`SELECT TOP 1 Id, Date FROM dbo.StockInRecords WITH (UPDLOCK,HOLDLOCK) WHERE ReceiptNumber=@ReceiptNumber AND Reason='manufacturing_output' ORDER BY Date DESC`);
                if (!outputResult.recordset[0]) throw new Error('مستند استلام المنتج التام غير موجود؛ لم تتغير القيود.');
                const issueResult = await new sql.Request(tx)
                    .input('ReceiptNumber', sql.NVarChar(100), `${orderRow.OrderNumber}-صرف`)
                    .query(`SELECT TOP 1 Id FROM dbo.StockOutRecords WITH (UPDLOCK,HOLDLOCK) WHERE ReceiptNumber=@ReceiptNumber AND Reason='manufacturing_issue' ORDER BY Date DESC`);
                if (!issueResult.recordset[0]) throw new Error('مستند صرف خامات التشغيلة غير موجود؛ لم تتغير القيود.');

                const suffix = `recalc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                const ledger = buildManufacturingLedgerEntries({ suffix, orderNumber: String(orderRow.OrderNumber), batchNumber: String(orderRow.BatchNumber || `LOT-${orderRow.OrderNumber}`),
                    issueId: String(issueResult.recordset[0].Id), receiptId: String(outputResult.recordset[0].Id),
                    usedMaterialCost: Math.max(0, Number(orderRow.RawMaterialCost) || 0), wastedMaterialCost: Math.max(0, Number(orderRow.WastedMaterialCost) || 0),
                    laborCost: Math.max(0, Number(orderRow.LaborCost) || 0), overheadCost: Math.max(0, Number(orderRow.OverheadCost) || 0),
                    wasteTreatment: String(orderRow.WasteTreatment || 'expense'), finishedGoodsCost: Math.max(0, Number(orderRow.TotalCost) || 0),
                    damagedOutputCost: Math.max(0, Number(orderRow.DamagedOutputCost) || 0), abnormalScrapQty: Math.max(0, Number(orderRow.AbnormalScrapQuantity) || 0),
                    producedQty: Math.max(0, Number(orderRow.ProducedQuantity) || 0) });
                const previousResult = await new sql.Request(tx).input('OrderId', sql.NVarChar(100), orderId).input('OrderNumber', sql.NVarChar(100), String(orderRow.OrderNumber))
                    .query(`SELECT Id FROM dbo.GeneralLedgerEntries WITH (UPDLOCK,HOLDLOCK) WHERE SourceId=@OrderId OR (SourceNumber=@OrderNumber AND SourceType LIKE 'production%')`);
                await new sql.Request(tx).input('OrderId', sql.NVarChar(100), orderId).input('OrderNumber', sql.NVarChar(100), String(orderRow.OrderNumber))
                    .query(`DELETE FROM dbo.GeneralLedgerEntries WHERE SourceId=@OrderId OR (SourceNumber=@OrderNumber AND SourceType LIKE 'production%')`);
                const ledgerEntryIds = await insertManufacturingLedgerEntries(tx, ledger.entries, {
                    date: outputResult.recordset[0].Date ? new Date(outputResult.recordset[0].Date) : new Date(orderRow.UpdatedAt || orderRow.OrderDate),
                    warehouseId: String(orderRow.TargetWarehouseId), sourceNumber: String(orderRow.OrderNumber), userId: body.userId || null, userName: body.userName || 'النظام'
                });
                await tx.commit();
                await logAuditEvent({ action: 'UPDATE', entity: 'ManufacturingOrder', entityId: orderId, userId: body.userId || 'system', userName: body.userName || 'النظام',
                    details: `إعادة احتساب قيود أمر التصنيع ${orderRow.OrderNumber}، التشغيلة ${orderRow.BatchNumber || ''}.`, previousState: { ledgerEntryIds: previousResult.recordset.map((row: any) => row.Id) }, newState: { ledgerEntryIds, wipTotalCost: ledger.wipTotalCost } }).catch(() => {});
                return NextResponse.json({ success: true, message: 'تمت إعادة احتساب قيود التشغيلة من مستندات المخزون والتكلفة.', documents: { ledgerEntryIds }, costs: { wipTotalCost: ledger.wipTotalCost } });
            } catch (error) {
                await tx.rollback();
                throw error;
            }
        }

        if (action === 'cancel') {
            const orderId = String(body.orderId || '');
            if (!orderId) throw new Error('رقم أمر التصنيع مطلوب للإلغاء.');
            const tx = new sql.Transaction(pool);
            await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
            try {
                const orderResult = await new sql.Request(tx).input('Id', sql.NVarChar(100), orderId)
                    .query(`SELECT TOP 1 * FROM dbo.ManufacturingOrders WITH (UPDLOCK,HOLDLOCK) WHERE Id=@Id`);
                const orderRow = orderResult.recordset[0];
                if (!orderRow) throw new Error('أمر التصنيع غير موجود.');
                if (String(orderRow.Status).toLowerCase() === 'cancelled') throw new Error('التشغيلة ملغاة بالفعل.');
                const now = new Date();
                const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                const cancellationId = `mfg_cancel_${suffix}`;
                let ledgerReversalIds: string[] = [];
                let returnedRawItems: any[] = [];
                let cancelledOutputQty = 0;

                if (String(orderRow.Status).toLowerCase() === 'completed') {
                    const outputResult = await new sql.Request(tx).input('ReceiptNumber', sql.NVarChar(100), `${orderRow.OrderNumber}-إنتاج-تام`)
                        .query(`SELECT TOP 1 * FROM dbo.StockInRecords WITH (UPDLOCK,HOLDLOCK) WHERE ReceiptNumber=@ReceiptNumber AND Reason='manufacturing_output' ORDER BY Date DESC`);
                    const issueResult = await new sql.Request(tx).input('ReceiptNumber', sql.NVarChar(100), `${orderRow.OrderNumber}-صرف`)
                        .query(`SELECT TOP 1 * FROM dbo.StockOutRecords WITH (UPDLOCK,HOLDLOCK) WHERE ReceiptNumber=@ReceiptNumber AND Reason='manufacturing_issue' ORDER BY Date DESC`);
                    const outputDocument = outputResult.recordset[0];
                    const issueDocument = issueResult.recordset[0];
                    if (!outputDocument || !issueDocument) throw new Error('مستندات الإنتاج أو صرف الخامات غير مكتملة؛ أعد مراجعة المستندات قبل الإلغاء.');
                    let outputLines: any[] = [];
                    let issueLines: any[] = [];
                    try { outputLines = JSON.parse(outputDocument.ItemsJson || '[]'); } catch { outputLines = []; }
                    try { issueLines = JSON.parse(issueDocument.ItemsJson || '[]'); } catch { issueLines = []; }
                    const finishedLine = outputLines.find(line => String(line.itemId || line.ItemId || line.id || line.Id) === String(orderRow.FinishedItemId));
                    cancelledOutputQty = Number(finishedLine?.qty ?? finishedLine?.Qty) || Number(orderRow.ProducedQuantity) || 0;
                    if (cancelledOutputQty <= 0) throw new Error('كمية المنتج التام في مستند التشغيلة غير صالحة.');

                    const balance = await getWarehouseItemBalance(tx, String(orderRow.TargetWarehouseId), String(orderRow.FinishedItemId));
                    if (balance + 0.0001 < cancelledOutputQty) throw new Error(`لا يمكن إلغاء التشغيلة: رصيد المنتج التام ${balance} أقل من كمية التشغيلة ${cancelledOutputQty}. أعد المنتجات المباعة أو المنقولة للمخزن أولاً.`);
                    const laterOutflow = await new sql.Request(tx)
                        .input('ItemId', sql.NVarChar(100), String(orderRow.FinishedItemId)).input('WarehouseId', sql.NVarChar(100), String(orderRow.TargetWarehouseId)).input('ReceiptDate', sql.DateTime2, new Date(outputDocument.Date))
                        .query(`
                            WITH Outflows AS (
                                SELECT s.Date,s.WarehouseId,COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id')) AS ItemId
                                FROM dbo.StockOutRecords s CROSS APPLY OPENJSON(CASE WHEN ISJSON(s.ItemsJson)=1 THEN s.ItemsJson ELSE '[]' END) j
                                WHERE LOWER(COALESCE(s.Status,'approved')) IN ('approved','completed','fulfilled','dispatched')
                                UNION ALL
                                SELECT s.Date,s.WarehouseId,COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id'))
                                FROM dbo.SalesInvoices s CROSS APPLY OPENJSON(CASE WHEN ISJSON(s.ItemsJson)=1 THEN s.ItemsJson ELSE '[]' END) j
                                WHERE LOWER(COALESCE(s.Status,'approved')) IN ('approved','completed')
                                UNION ALL
                                SELECT t.Date,t.FromWarehouseId,COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id'))
                                FROM dbo.StockTransferRecords t CROSS APPLY OPENJSON(CASE WHEN ISJSON(t.ItemsJson)=1 THEN t.ItemsJson ELSE '[]' END) j
                                UNION ALL
                                SELECT r.Date,r.WarehouseId,COALESCE(JSON_VALUE(j.value,'$.itemId'),JSON_VALUE(j.value,'$.ItemId'),JSON_VALUE(j.value,'$.id'),JSON_VALUE(j.value,'$.Id'))
                                FROM dbo.StockIssuesToReps r CROSS APPLY OPENJSON(CASE WHEN ISJSON(r.ItemsJson)=1 THEN r.ItemsJson ELSE '[]' END) j
                            )
                            SELECT TOP 1 Date FROM Outflows WHERE WarehouseId=@WarehouseId AND ItemId=@ItemId AND Date>@ReceiptDate ORDER BY Date;
                        `);
                    if (laterOutflow.recordset.length) throw new Error('تعذر التأكد أن كامل التشغيلة ما زال بالمخزن لوجود حركات صرف أو بيع أو تحويل لاحقة. ألغِ/أعد تلك الحركات أولاً ثم أعد محاولة إلغاء التشغيلة.');

                    returnedRawItems = issueLines.map((line: any) => {
                        const used = Number(line.usedQty ?? line.UsedQty);
                        const waste = Number(line.wasteQty ?? line.WasteQty);
                        const returned = Number(line.returnedQty ?? line.ReturnedQty) || 0;
                        const netConsumed = Number.isFinite(used) || Number.isFinite(waste)
                            ? Math.max(0, (Number.isFinite(used) ? used : 0) + (Number.isFinite(waste) ? waste : 0))
                            : Math.max(0, (Number(line.qty ?? line.Qty) || 0) - returned);
                        return { id: line.itemId || line.ItemId || line.id || line.Id, itemId: line.itemId || line.ItemId || line.id || line.Id, name: line.name || line.Name || '', qty: netConsumed,
                            cost: Number(line.cost ?? line.Cost) || 0, batchNumber: line.batchNumber || null, productionBatchNumber: orderRow.BatchNumber, manufacturingOrderId: orderId,
                            reason: 'manufacturing_cancellation_raw_return' };
                    }).filter((line: any) => line.itemId && line.qty > 0);

                    const cancelledOutput = [{ id: orderRow.FinishedItemId, itemId: orderRow.FinishedItemId, name: orderRow.FinishedItemName, qty: cancelledOutputQty,
                        cost: Number(orderRow.UnitCost) || 0, batchNumber: orderRow.BatchNumber, manufacturingOrderId: orderId, reason: 'manufacturing_cancellation' }];
                    await new sql.Request(tx)
                        .input('Id', sql.NVarChar(64), `mfg_cancel_out_${suffix}`).input('ReceiptNumber', sql.NVarChar(100), `${orderRow.OrderNumber}-إلغاء-إخراج`)
                        .input('Date', sql.DateTime2, now).input('WarehouseId', sql.NVarChar(100), orderRow.TargetWarehouseId).input('SourceId', sql.NVarChar(100), orderRow.TargetWarehouseId)
                        .input('Reason', sql.NVarChar(255), 'manufacturing_cancellation').input('Status', sql.NVarChar(50), 'completed')
                        .input('Notes', sql.NVarChar(sql.MAX), `عكس استلام المنتج التام عند إلغاء التشغيلة ${orderRow.BatchNumber || orderRow.OrderNumber}.`)
                        .input('ItemsJson', sql.NVarChar(sql.MAX), JSON.stringify(cancelledOutput)).input('CreatedById', sql.NVarChar(100), body.userId || null).input('CreatedByName', sql.NVarChar(255), body.userName || 'النظام')
                        .query(`INSERT INTO dbo.StockOutRecords (Id,ReceiptNumber,Date,WarehouseId,SourceId,Reason,Status,Notes,ItemsJson,CreatedById,CreatedByName) VALUES (@Id,@ReceiptNumber,@Date,@WarehouseId,@SourceId,@Reason,@Status,@Notes,@ItemsJson,@CreatedById,@CreatedByName)`);
                    if (returnedRawItems.length) {
                        await new sql.Request(tx)
                            .input('Id', sql.NVarChar(64), `mfg_cancel_in_${suffix}`).input('ReceiptNumber', sql.NVarChar(100), `${orderRow.OrderNumber}-إلغاء-خامات`)
                            .input('Date', sql.DateTime2, now).input('WarehouseId', sql.NVarChar(100), orderRow.SourceWarehouseId).input('Reason', sql.NVarChar(255), 'manufacturing_cancellation_raw_return')
                            .input('Status', sql.NVarChar(50), 'completed').input('Notes', sql.NVarChar(sql.MAX), `إعادة صافي خامات أمر التصنيع ${orderRow.OrderNumber} إلى مخزن المصدر بعد إلغاء التشغيلة.`)
                            .input('ItemsJson', sql.NVarChar(sql.MAX), JSON.stringify(returnedRawItems)).input('CreatedById', sql.NVarChar(100), body.userId || null).input('CreatedByName', sql.NVarChar(255), body.userName || 'النظام')
                            .query(`INSERT INTO dbo.StockInRecords (Id,ReceiptNumber,Date,WarehouseId,Reason,Status,Notes,ItemsJson,CreatedById,CreatedByName) VALUES (@Id,@ReceiptNumber,@Date,@WarehouseId,@Reason,@Status,@Notes,@ItemsJson,@CreatedById,@CreatedByName)`);
                    }

                    const oldLedgerResult = await new sql.Request(tx).input('OrderId', sql.NVarChar(100), orderId).input('OrderNumber', sql.NVarChar(100), String(orderRow.OrderNumber))
                        .query(`SELECT Id,EntryNumber,LinesJson,TotalDebit,TotalCredit FROM dbo.GeneralLedgerEntries WITH (UPDLOCK,HOLDLOCK) WHERE SourceId=@OrderId OR (SourceNumber=@OrderNumber AND SourceType LIKE 'production%') ORDER BY Date,CreatedAt`);
                    let reversalSource: any[] = oldLedgerResult.recordset.map((entry: any) => {
                        let lines: any[] = [];
                        try { lines = JSON.parse(entry.LinesJson || '[]'); } catch { lines = []; }
                        const debit = lines.reduce((sum: number, line: any) => sum + (Number(line.debit) || 0), 0);
                        const credit = lines.reduce((sum: number, line: any) => sum + (Number(line.credit) || 0), 0);
                        if (lines.length < 2 || Math.abs(debit - credit) > 0.05) throw new Error(`القيد ${entry.EntryNumber} غير متوازن؛ أعد احتساب قيود التشغيلة أولاً قبل إلغائها.`);
                        return { originalId: entry.Id, number: entry.EntryNumber, lines: lines.map((line: any) => ({ ...line, debit: Number(line.credit) || 0, credit: Number(line.debit) || 0, memo: `عكس: ${line.memo || ''}` })) };
                    });
                    if (!reversalSource.length) {
                        const source = buildManufacturingLedgerEntries({ suffix: `cancel_source_${suffix}`, orderNumber: String(orderRow.OrderNumber), batchNumber: String(orderRow.BatchNumber || ''),
                            issueId: String(issueDocument.Id), receiptId: String(outputDocument.Id), usedMaterialCost: Math.max(0, Number(orderRow.RawMaterialCost) || 0),
                            wastedMaterialCost: Math.max(0, Number(orderRow.WastedMaterialCost) || 0), laborCost: Math.max(0, Number(orderRow.LaborCost) || 0), overheadCost: Math.max(0, Number(orderRow.OverheadCost) || 0),
                            wasteTreatment: String(orderRow.WasteTreatment || 'expense'), finishedGoodsCost: Math.max(0, Number(orderRow.TotalCost) || 0), damagedOutputCost: Math.max(0, Number(orderRow.DamagedOutputCost) || 0),
                            abnormalScrapQty: Math.max(0, Number(orderRow.AbnormalScrapQuantity) || 0), producedQty: cancelledOutputQty });
                        reversalSource = source.entries.filter(entry => entry.lines.length).map(entry => ({ originalId: entry.id, number: entry.number,
                            lines: entry.lines.map((line: any) => ({ ...line, debit: Number(line.credit) || 0, credit: Number(line.debit) || 0, memo: `عكس: ${line.memo || ''}` })) }));
                    }
                    const reversalEntries = reversalSource.map((entry: any, index: number) => ({ id: `GL-MFG-X-${suffix}-${index}`, number: `${orderRow.OrderNumber}-إلغاء-${index + 1}`,
                        sourceType: 'production_cancellation_reversal', sourceId: `${cancellationId}-${index + 1}`,
                        description: `قيد عكسي ${entry.number} لإلغاء تشغيلة ${orderRow.BatchNumber || orderRow.OrderNumber} (مرجع القيد ${entry.originalId})`, lines: entry.lines }));
                    ledgerReversalIds = await insertManufacturingLedgerEntries(tx, reversalEntries, { date: now, warehouseId: String(orderRow.TargetWarehouseId), sourceNumber: String(orderRow.OrderNumber), userId: body.userId || null, userName: body.userName || 'النظام' });

                    const priceLogResult = await new sql.Request(tx).input('ItemId', sql.NVarChar(100), String(orderRow.FinishedItemId))
                        .input('OrderNumber', sql.NVarChar(100), String(orderRow.OrderNumber)).query(`SELECT TOP 1 OldPrice,NewPrice,OldCost,NewCost FROM dbo.PriceChangeLogs WHERE ItemId=@ItemId AND Reason LIKE '%' + @OrderNumber + '%' ORDER BY Timestamp DESC`);
                    const itemResult = await new sql.Request(tx).input('ItemId', sql.NVarChar(100), String(orderRow.FinishedItemId)).query(`SELECT TOP 1 Price,Cost FROM dbo.Items WITH (UPDLOCK,HOLDLOCK) WHERE Id=@ItemId`);
                    const priceLog = priceLogResult.recordset[0];
                    const item = itemResult.recordset[0];
                    if (priceLog && item) {
                        const currentCost = Number(item.Cost) || 0;
                        const currentPrice = Number(item.Price) || 0;
                        const restoreCost = Math.abs(currentCost - Number(priceLog.NewCost)) < 0.0001 ? Number(priceLog.OldCost) : currentCost;
                        const restorePrice = Math.abs(currentPrice - Number(priceLog.NewPrice)) < 0.0001 ? Number(priceLog.OldPrice) : currentPrice;
                        if (restoreCost !== currentCost || restorePrice !== currentPrice) {
                            await new sql.Request(tx).input('ItemId', sql.NVarChar(100), String(orderRow.FinishedItemId)).input('Cost', sql.Decimal(18,4), restoreCost).input('Price', sql.Decimal(18,4), restorePrice)
                                .query(`UPDATE dbo.Items SET Cost=@Cost,Price=@Price,UpdatedAt=GETDATE() WHERE Id=@ItemId`);
                        }
                    }
                }

                await new sql.Request(tx).input('Id', sql.NVarChar(100), orderId).input('Status', sql.NVarChar(50), 'cancelled')
                    .query(`UPDATE dbo.ManufacturingOrders SET Status=@Status,UpdatedAt=GETDATE() WHERE Id=@Id`);
                await tx.commit();
                await logAuditEvent({ action: 'UPDATE', entity: 'ManufacturingOrder', entityId: orderId, userId: body.userId || 'system', userName: body.userName || 'النظام',
                    details: `إلغاء تشغيلة ${orderRow.BatchNumber || orderRow.OrderNumber}: عكس إنتاج ${cancelledOutputQty} وحدة وإعادة ${returnedRawItems.length} بنود خامات للمخزن.`,
                    newState: { status: 'cancelled', cancelledOutputQty, returnedRawItems, ledgerReversalIds, cancellationId } }).catch(() => {});
                return NextResponse.json({ success: true, message: 'تم إلغاء التشغيلة وعكس حركة المنتج والخامات والقيود المحاسبية.', documents: { ledgerReversalIds, cancelledOutputQty, returnedRawItems } });
            } catch (error) {
                await tx.rollback();
                throw error;
            }
        }

        if (action === 'complete') {
            const orderId = String(body.orderId || '');
            const producedQty = Number(body.producedQty);
            const requestedScrapQty = Number(body.scrapQty ?? 0);
            if (!Number.isFinite(requestedScrapQty) || requestedScrapQty < 0) {
                return NextResponse.json({ success: false, message: 'أدخل كمية هالك صحيحة لا تقل عن صفر.' }, { status: 400 });
            }
            const scrapQty = requestedScrapQty;
            const wasteTreatment = body.wasteTreatment === 'allocate_to_good' ? 'allocate_to_good' : 'expense';
            const updateItemCost = body.updateItemCost !== false;
            const updateItemSalePrice = body.updateItemSalePrice !== false;
            const requestedMaterials = Array.isArray(body.materials) ? body.materials : [];
            if (!orderId || !Number.isFinite(producedQty) || producedQty <= 0) {
                return NextResponse.json({ success: false, message: 'أدخل كمية إنتاج صالحة.' }, { status: 400 });
            }
            await pool.request().query(`
                IF COL_LENGTH('dbo.StockInRecords', 'CreatedById') IS NULL ALTER TABLE dbo.StockInRecords ADD CreatedById NVARCHAR(64) NULL;
                IF COL_LENGTH('dbo.StockInRecords', 'CreatedByName') IS NULL ALTER TABLE dbo.StockInRecords ADD CreatedByName NVARCHAR(255) NULL;
            `);

            const tx = new sql.Transaction(pool);
            // Serialize completion checks so overlapping production completions cannot
            // both consume the same ledger balance before either writes its issue.
            await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
            try {
                const orderResult = await new sql.Request(tx)
                    .input('Id', sql.NVarChar(100), orderId)
                    .query(`SELECT TOP 1 * FROM dbo.ManufacturingOrders WITH (UPDLOCK, HOLDLOCK) WHERE Id = @Id`);
                const orderRow = orderResult.recordset[0];
                if (!orderRow) throw new Error('أمر التصنيع غير موجود.');
                if (String(orderRow.Status).toLowerCase() !== 'in_progress') throw new Error('يجب أن يكون الأمر قيد التشغيل قبل اعتماده.');
                const batchNumber = String(orderRow.BatchNumber || `LOT-${orderRow.OrderNumber}`);
                let bom: any[] = [];
                try { bom = typeof orderRow.BOMDetailsJson === 'string' ? JSON.parse(orderRow.BOMDetailsJson) : (orderRow.BOMDetailsJson || []); } catch { bom = []; }
                if (!Array.isArray(bom) || bom.length === 0) throw new Error('لا توجد معادلة خامات محفوظة لهذا الأمر.');

                const reservedByItem = new Map<string, number>();
                const materialRows: any[] = [];
                for (const component of bom) {
                    const itemId = String(component.itemId || '');
                    const plannedQty = Math.max(0, Number(component.requiredTotalQty) || Number(component.unitQty) * Number(orderRow.TargetQuantity) || 0);
                    const input = requestedMaterials.find((material: any) => String(material.itemId) === itemId) || {};
                    const usedQty = Math.max(0, Number(input.usedQty) || 0);
                    const wasteQty = Math.max(0, Number(input.wasteQty) || 0);
                    if (!itemId) throw new Error('يوجد بند خامة بلا رقم صنف في معادلة التصنيع.');
                    const actualUseAndWasteQty = usedQty + wasteQty;
                    const issuedQty = Math.max(plannedQty, actualUseAndWasteQty);
                    const extraIssuedQty = Math.max(0, actualUseAndWasteQty - plannedQty);
                    const returnedQty = Math.max(0, plannedQty - actualUseAndWasteQty);
                    const inventoryResult = await new sql.Request(tx)
                        .input('WarehouseId', sql.NVarChar(100), orderRow.SourceWarehouseId)
                        .input('ItemId', sql.NVarChar(100), itemId)
                        .query(`
                            WITH LastClosing AS (
                                SELECT TOP 1 ClosingDate, BalancesJson
                                FROM dbo.InventoryClosings
                                WHERE WarehouseId = @WarehouseId
                                ORDER BY ClosingDate DESC
                            ), Movements AS (
                                SELECT s.Date, s.WarehouseId, 1 AS Direction, COALESCE(JSON_VALUE(j.value, '$.itemId'), JSON_VALUE(j.value, '$.ItemId'), JSON_VALUE(j.value, '$.id'), JSON_VALUE(j.value, '$.Id')) AS ItemId,
                                    COALESCE(TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.quantity')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Quantity')), 0) AS Qty
                                FROM dbo.StockInRecords s CROSS APPLY OPENJSON(CASE WHEN ISJSON(s.ItemsJson) = 1 THEN s.ItemsJson ELSE '[]' END) j
                                WHERE LOWER(COALESCE(s.Status, 'approved')) NOT IN ('draft','pending','in_transit')
                                UNION ALL
                                SELECT s.Date, COALESCE(s.WarehouseId, s.SourceId), -1, COALESCE(JSON_VALUE(j.value, '$.itemId'), JSON_VALUE(j.value, '$.ItemId'), JSON_VALUE(j.value, '$.id'), JSON_VALUE(j.value, '$.Id')),
                                    COALESCE(TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.quantity')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Quantity')), 0)
                                FROM dbo.StockOutRecords s CROSS APPLY OPENJSON(CASE WHEN ISJSON(s.ItemsJson) = 1 THEN s.ItemsJson ELSE '[]' END) j
                                WHERE LOWER(COALESCE(s.Status, 'approved')) IN ('approved','completed','fulfilled','dispatched')
                                UNION ALL
                                SELECT s.Date, s.WarehouseId, -1, COALESCE(JSON_VALUE(j.value, '$.itemId'), JSON_VALUE(j.value, '$.ItemId'), JSON_VALUE(j.value, '$.id'), JSON_VALUE(j.value, '$.Id')),
                                    COALESCE(TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.quantity')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Quantity')), 0)
                                FROM dbo.SalesInvoices s CROSS APPLY OPENJSON(CASE WHEN ISJSON(s.ItemsJson) = 1 THEN s.ItemsJson ELSE '[]' END) j
                                WHERE LOWER(COALESCE(s.Status, 'approved')) IN ('approved','completed')
                                UNION ALL
                                SELECT s.Date, s.WarehouseId, 1, COALESCE(JSON_VALUE(j.value, '$.itemId'), JSON_VALUE(j.value, '$.ItemId'), JSON_VALUE(j.value, '$.id'), JSON_VALUE(j.value, '$.Id')),
                                    COALESCE(TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.quantity')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Quantity')), 0)
                                FROM dbo.SalesReturns s CROSS APPLY OPENJSON(CASE WHEN ISJSON(s.ItemsJson) = 1 THEN s.ItemsJson ELSE '[]' END) j
                                UNION ALL
                                SELECT s.Date, s.WarehouseId, -1, COALESCE(JSON_VALUE(j.value, '$.itemId'), JSON_VALUE(j.value, '$.ItemId'), JSON_VALUE(j.value, '$.id'), JSON_VALUE(j.value, '$.Id')),
                                    COALESCE(TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.quantity')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Quantity')), 0)
                                FROM dbo.PurchaseReturns s CROSS APPLY OPENJSON(CASE WHEN ISJSON(s.ItemsJson) = 1 THEN s.ItemsJson ELSE '[]' END) j
                                UNION ALL
                                SELECT a.Date, a.WarehouseId, 0, COALESCE(JSON_VALUE(j.value, '$.itemId'), JSON_VALUE(j.value, '$.ItemId'), JSON_VALUE(j.value, '$.id'), JSON_VALUE(j.value, '$.Id')),
                                    COALESCE(TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.difference')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Difference')), 0)
                                FROM dbo.StockAdjustmentRecords a CROSS APPLY OPENJSON(CASE WHEN ISJSON(a.ItemsJson) = 1 THEN a.ItemsJson ELSE '[]' END) j
                                UNION ALL
                                SELECT r.Date, r.WarehouseId, -1, COALESCE(JSON_VALUE(j.value, '$.itemId'), JSON_VALUE(j.value, '$.ItemId'), JSON_VALUE(j.value, '$.id'), JSON_VALUE(j.value, '$.Id')),
                                    COALESCE(TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.quantity')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Quantity')), 0)
                                FROM dbo.StockIssuesToReps r CROSS APPLY OPENJSON(CASE WHEN ISJSON(r.ItemsJson) = 1 THEN r.ItemsJson ELSE '[]' END) j
                                UNION ALL
                                SELECT r.Date, r.WarehouseId, 1, COALESCE(JSON_VALUE(j.value, '$.itemId'), JSON_VALUE(j.value, '$.ItemId'), JSON_VALUE(j.value, '$.id'), JSON_VALUE(j.value, '$.Id')),
                                    COALESCE(TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.quantity')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Quantity')), 0)
                                FROM dbo.StockReturnsFromReps r CROSS APPLY OPENJSON(CASE WHEN ISJSON(r.ItemsJson) = 1 THEN r.ItemsJson ELSE '[]' END) j
                                UNION ALL
                                SELECT t.Date, t.FromWarehouseId, -1, COALESCE(JSON_VALUE(j.value, '$.itemId'), JSON_VALUE(j.value, '$.ItemId'), JSON_VALUE(j.value, '$.id'), JSON_VALUE(j.value, '$.Id')),
                                    COALESCE(TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.quantity')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Quantity')), 0)
                                FROM dbo.StockTransferRecords t CROSS APPLY OPENJSON(CASE WHEN ISJSON(t.ItemsJson) = 1 THEN t.ItemsJson ELSE '[]' END) j
                                UNION ALL
                                SELECT t.Date, t.ToWarehouseId, 1, COALESCE(JSON_VALUE(j.value, '$.itemId'), JSON_VALUE(j.value, '$.ItemId'), JSON_VALUE(j.value, '$.id'), JSON_VALUE(j.value, '$.Id')),
                                    COALESCE(TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Qty')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.quantity')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Quantity')), 0)
                                FROM dbo.StockTransferRecords t CROSS APPLY OPENJSON(CASE WHEN ISJSON(t.ItemsJson) = 1 THEN t.ItemsJson ELSE '[]' END) j
                            ), ClosingStock AS (
                                SELECT COALESCE(SUM(COALESCE(TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.balance')), TRY_CONVERT(DECIMAL(18,4), JSON_VALUE(j.value, '$.Balance')), 0)), 0) AS Qty
                                FROM LastClosing c CROSS APPLY OPENJSON(CASE WHEN ISJSON(c.BalancesJson) = 1 THEN c.BalancesJson ELSE '[]' END) j
                                WHERE COALESCE(JSON_VALUE(j.value, '$.itemId'), JSON_VALUE(j.value, '$.ItemId'), JSON_VALUE(j.value, '$.id'), JSON_VALUE(j.value, '$.Id')) = @ItemId
                            )
                            SELECT COALESCE((SELECT Qty FROM ClosingStock), 0) + COALESCE(SUM(CASE WHEN m.Direction = 0 THEN m.Qty ELSE m.Direction * m.Qty END), 0) AS AvailableQty
                            FROM Movements m LEFT JOIN LastClosing c ON 1 = 1
                            WHERE m.WarehouseId = @WarehouseId AND m.ItemId = @ItemId AND m.Date > COALESCE(c.ClosingDate, CONVERT(DATETIME2, '19000101'));
                        `);
                    const availableQty = Number(inventoryResult.recordset[0]?.AvailableQty) || 0;
                    const alreadyReserved = reservedByItem.get(itemId) || 0;
                    if (availableQty + 0.0001 < alreadyReserved + issuedQty) {
                        throw new Error(`رصيد الخامة ${component.name || itemId} غير كافٍ لتغطية الاستخدام والهدر الفعلي في مخزن المصدر. الرصيد المتاح ${availableQty}، والكمية المطلوبة ${alreadyReserved + issuedQty}. لم يتم حفظ أي حركة.`);
                    }
                    reservedByItem.set(itemId, alreadyReserved + issuedQty);
                    const itemResult = await new sql.Request(tx).input('ItemId', sql.NVarChar(100), itemId).query('SELECT TOP 1 Cost FROM dbo.Items WHERE Id = @ItemId');
                    const costPerUnit = Math.max(0, Number(itemResult.recordset[0]?.Cost) || Number(component.costPerUnit) || 0);
                    materialRows.push({ itemId, name: String(component.name || itemId), plannedQty, issuedQty, extraIssuedQty, usedQty, wasteQty, returnedQty, costPerUnit,
                        usedCost: usedQty * costPerUnit, wasteCost: wasteQty * costPerUnit });
                }
                const usedMaterialCost = materialRows.reduce((sum, row) => sum + row.usedCost, 0);
                const wastedMaterialCost = materialRows.reduce((sum, row) => sum + row.wasteCost, 0);
                const laborCost = Math.max(0, Number(orderRow.LaborCost) || 0);
                const overheadCost = Math.max(0, Number(orderRow.OverheadCost) || 0);
                const totalConsumedCost = usedMaterialCost + laborCost + overheadCost;
                const allOutputQty = producedQty + scrapQty;
                const expectedScrapPercent = Math.min(99.99, Math.max(0, Number(orderRow.ExpectedScrapPercent) || 0));
                const normalScrapAllowanceQty = Number(orderRow.TargetQuantity) * expectedScrapPercent / 100;
                const normalScrapQty = Math.min(scrapQty, normalScrapAllowanceQty);
                const abnormalScrapQty = Math.max(0, scrapQty - normalScrapQty);
                const baseFinishedGoodsCost = allOutputQty > 0 ? totalConsumedCost * producedQty / allOutputQty : 0;
                const normalScrapCost = allOutputQty > 0 ? totalConsumedCost * normalScrapQty / allOutputQty : 0;
                const abnormalScrapCost = allOutputQty > 0 ? totalConsumedCost * abnormalScrapQty / allOutputQty : 0;
                const allocatedWasteCost = normalScrapCost + (wasteTreatment === 'allocate_to_good' ? wastedMaterialCost : 0);
                const allocatedWasteCostPerUnit = producedQty > 0 ? allocatedWasteCost / producedQty : 0;
                const finishedGoodsCost = baseFinishedGoodsCost + allocatedWasteCost;
                const finishedGoodsUnitCost = producedQty > 0 ? finishedGoodsCost / producedQty : 0;
                const storedMargin = Number(orderRow.ProfitMarginPercent);
                const profitMarginPercent = Number.isFinite(storedMargin) ? Math.min(99.99, Math.max(0, storedMargin)) : 25;
                const salePrice = finishedGoodsUnitCost / (1 - profitMarginPercent / 100);
                const damagedOutputCost = abnormalScrapCost;
                const totalWasteCost = damagedOutputCost + (wasteTreatment === 'expense' ? wastedMaterialCost : 0);
                const now = new Date();
                const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                const issueId = `mfg_issue_${suffix}`;
                const returnId = `mfg_return_${suffix}`;
                const receiptId = `mfg_receipt_${suffix}`;
                const baseItems = materialRows.map(row => ({ id: row.itemId, itemId: row.itemId, name: row.name, qty: row.issuedQty, plannedQty: row.plannedQty, extraIssuedQty: row.extraIssuedQty, cost: row.costPerUnit, batchNumber: row.batchNumber || null,
                    productionBatchNumber: batchNumber, manufacturingOrderId: orderId, productionItemId: orderRow.FinishedItemId,
                    wasteTreatment, usedQty: row.usedQty, wasteQty: row.wasteQty, returnedQty: row.returnedQty }));
                const issueNotes = `صرف خامات أمر التصنيع ${orderRow.OrderNumber}، التشغيلة ${batchNumber}؛ الكميات المستخدمة والهدر والمرتجعة موضحة ببنود المستند.`;

                await new sql.Request(tx)
                    .input('Id', sql.NVarChar(64), issueId).input('ReceiptNumber', sql.NVarChar(100), `${orderRow.OrderNumber}-صرف`)
                    .input('Date', sql.DateTime2, now).input('WarehouseId', sql.NVarChar(100), orderRow.SourceWarehouseId)
                    .input('SourceId', sql.NVarChar(100), orderRow.SourceWarehouseId).input('Reason', sql.NVarChar(255), 'manufacturing_issue')
                    .input('Status', sql.NVarChar(50), 'completed').input('Notes', sql.NVarChar(sql.MAX), issueNotes)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), JSON.stringify(baseItems)).input('CreatedById', sql.NVarChar(100), body.userId || null)
                    .input('CreatedByName', sql.NVarChar(255), body.userName || 'النظام')
                    .query(`INSERT INTO dbo.StockOutRecords (Id, ReceiptNumber, Date, WarehouseId, SourceId, Reason, Status, Notes, ItemsJson, CreatedById, CreatedByName)
                        VALUES (@Id, @ReceiptNumber, @Date, @WarehouseId, @SourceId, @Reason, @Status, @Notes, @ItemsJson, @CreatedById, @CreatedByName)`);

                const returnedItems = materialRows.filter(row => row.returnedQty > 0).map(row => ({ id: row.itemId, itemId: row.itemId, name: row.name, qty: row.returnedQty, cost: row.costPerUnit,
                    batchNumber: row.batchNumber || null, productionBatchNumber: batchNumber, manufacturingOrderId: orderId }));
                if (returnedItems.length) {
                    await new sql.Request(tx)
                        .input('Id', sql.NVarChar(64), returnId).input('ReceiptNumber', sql.NVarChar(100), `${orderRow.OrderNumber}-مرتجع-خامات`)
                        .input('Date', sql.DateTime2, now).input('WarehouseId', sql.NVarChar(100), orderRow.SourceWarehouseId)
                        .input('Reason', sql.NVarChar(255), 'manufacturing_material_return').input('Status', sql.NVarChar(50), 'completed')
                        .input('Notes', sql.NVarChar(sql.MAX), `إرجاع متبقي خامات أمر التصنيع ${orderRow.OrderNumber}، المرتبط بتشغيلة المنتج ${batchNumber}، إلى مخزن الخامات.`)
                        .input('ItemsJson', sql.NVarChar(sql.MAX), JSON.stringify(returnedItems)).input('CreatedById', sql.NVarChar(100), body.userId || null)
                        .input('CreatedByName', sql.NVarChar(255), body.userName || 'النظام')
                        .query(`INSERT INTO dbo.StockInRecords (Id, ReceiptNumber, Date, WarehouseId, Reason, Status, Notes, ItemsJson, CreatedById, CreatedByName)
                            VALUES (@Id, @ReceiptNumber, @Date, @WarehouseId, @Reason, @Status, @Notes, @ItemsJson, @CreatedById, @CreatedByName)`);
                }

                const finishedItems = [{ id: orderRow.FinishedItemId, itemId: orderRow.FinishedItemId, name: orderRow.FinishedItemName,
                    qty: producedQty, cost: finishedGoodsUnitCost, salePrice, manufacturingProfitMargin: profitMarginPercent, batchNumber, manufacturingOrderId: orderId,
                    damagedQty: scrapQty, normalScrapQty, abnormalScrapQty, normalScrapCost, abnormalScrapCost: damagedOutputCost, damagedCost: damagedOutputCost, wastedMaterialCost,
                    baseFinishedGoodsCost, allocatedWasteCost, allocatedWasteCostPerUnit, wasteTreatment,
                    itemCostUpdated: updateItemCost, itemSalePriceUpdated: updateItemSalePrice }];
                await new sql.Request(tx)
                    .input('Id', sql.NVarChar(64), receiptId).input('ReceiptNumber', sql.NVarChar(100), `${orderRow.OrderNumber}-إنتاج-تام`)
                    .input('Date', sql.DateTime2, now).input('WarehouseId', sql.NVarChar(100), orderRow.TargetWarehouseId)
                    .input('BatchNumber', sql.NVarChar(100), batchNumber)
                    .input('Reason', sql.NVarChar(255), 'manufacturing_output').input('Status', sql.NVarChar(50), 'completed')
                    .input('Notes', sql.NVarChar(sql.MAX), `استلام إنتاج أمر ${orderRow.OrderNumber}، التشغيلة ${batchNumber}: صالح ${producedQty}، هالك طبيعي ${normalScrapQty} بتكلفة ${normalScrapCost.toFixed(4)}، هالك غير طبيعي ${abnormalScrapQty} بتكلفة ${damagedOutputCost.toFixed(4)}، هدر خامات ${wastedMaterialCost.toFixed(4)}، تكلفة الوحدة ${finishedGoodsUnitCost.toFixed(4)}، السعر المقترح ${salePrice.toFixed(4)}.`)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), JSON.stringify(finishedItems)).input('CreatedById', sql.NVarChar(100), body.userId || null)
                    .input('CreatedByName', sql.NVarChar(255), body.userName || 'النظام')
                    .query(`INSERT INTO dbo.StockInRecords (Id, ReceiptNumber, Date, WarehouseId, BatchNumber, Reason, Status, Notes, ItemsJson, CreatedById, CreatedByName)
                        VALUES (@Id, @ReceiptNumber, @Date, @WarehouseId, @BatchNumber, @Reason, @Status, @Notes, @ItemsJson, @CreatedById, @CreatedByName)`);

                const ledger = buildManufacturingLedgerEntries({ suffix, orderNumber: String(orderRow.OrderNumber), batchNumber, issueId, receiptId,
                    usedMaterialCost, wastedMaterialCost, laborCost, overheadCost, wasteTreatment, finishedGoodsCost, damagedOutputCost, abnormalScrapQty, producedQty });
                const wipTotalCost = ledger.wipTotalCost;
                const postedLedgerIds = await insertManufacturingLedgerEntries(tx, ledger.entries, { date: now, warehouseId: String(orderRow.TargetWarehouseId), sourceNumber: String(orderRow.OrderNumber), userId: body.userId || null, userName: body.userName || 'النظام' });

                await new sql.Request(tx)
                    .input('Id', sql.NVarChar(100), orderId).input('ProducedQuantity', sql.Decimal(18, 4), producedQty)
                    .input('RawMaterialCost', sql.Decimal(18, 4), usedMaterialCost).input('TotalCost', sql.Decimal(18, 4), finishedGoodsCost)
                    .input('BatchNumber', sql.NVarChar(100), batchNumber)
                    .input('ProfitMarginPercent', sql.Decimal(9, 4), profitMarginPercent)
                    .input('SalePrice', sql.Decimal(18, 4), salePrice)
                    .input('UnitCost', sql.Decimal(18, 4), finishedGoodsUnitCost)
                    .input('WasteTreatment', sql.NVarChar(30), wasteTreatment)
                    .input('WastedMaterialCost', sql.Decimal(18, 4), wastedMaterialCost)
                    .input('DamagedOutputCost', sql.Decimal(18, 4), damagedOutputCost)
                    .input('BaseFinishedGoodsCost', sql.Decimal(18, 4), baseFinishedGoodsCost)
                    .input('AllocatedWasteCost', sql.Decimal(18, 4), allocatedWasteCost)
                    .input('AllocatedWasteCostPerUnit', sql.Decimal(18, 4), allocatedWasteCostPerUnit)
                    .input('ItemCostUpdated', sql.Bit, updateItemCost)
                    .input('ItemSalePriceUpdated', sql.Bit, updateItemSalePrice)
                    .input('ExpectedScrapPercent', sql.Decimal(9, 4), expectedScrapPercent)
                    .input('NormalScrapQuantity', sql.Decimal(18, 4), normalScrapQty)
                    .input('AbnormalScrapQuantity', sql.Decimal(18, 4), abnormalScrapQty)
                    .input('NormalScrapCost', sql.Decimal(18, 4), normalScrapCost)
                    .query(`UPDATE dbo.ManufacturingOrders SET Status = 'completed', ProducedQuantity = @ProducedQuantity, BatchNumber = @BatchNumber,
                        RawMaterialCost = @RawMaterialCost, TotalCost = @TotalCost, UnitCost = @UnitCost, ProfitMarginPercent = @ProfitMarginPercent,
                        SalePrice = @SalePrice, WasteTreatment = @WasteTreatment, WastedMaterialCost = @WastedMaterialCost,
                        DamagedOutputCost = @DamagedOutputCost, BaseFinishedGoodsCost = @BaseFinishedGoodsCost,
                        AllocatedWasteCost = @AllocatedWasteCost, AllocatedWasteCostPerUnit = @AllocatedWasteCostPerUnit,
                        ItemCostUpdated = @ItemCostUpdated, ItemSalePriceUpdated = @ItemSalePriceUpdated,
                        ExpectedScrapPercent = @ExpectedScrapPercent, NormalScrapQuantity = @NormalScrapQuantity,
                        AbnormalScrapQuantity = @AbnormalScrapQuantity, NormalScrapCost = @NormalScrapCost, UpdatedAt = GETDATE() WHERE Id = @Id`);
                const itemUpdate = new sql.Request(tx)
                    .input('ItemId', sql.NVarChar(100), orderRow.FinishedItemId).input('UnitCost', sql.Decimal(18, 4), finishedGoodsUnitCost)
                    .input('SalePrice', sql.Decimal(18, 4), salePrice);
                const itemResult = await new sql.Request(tx)
                    .input('ItemId', sql.NVarChar(100), orderRow.FinishedItemId)
                    .query(`SELECT TOP 1 Id, Code, Name, Price, Cost FROM dbo.Items WITH (UPDLOCK, HOLDLOCK) WHERE Id = @ItemId`);
                const itemRow = itemResult.recordset[0];
                if (!itemRow) throw new Error('الصنف المنتج غير موجود؛ لم يتم اعتماد مستند التصنيع.');
                const oldItemPrice = Number(itemRow.Price) || 0;
                const oldItemCost = Number(itemRow.Cost) || 0;
                const newItemPrice = updateItemSalePrice ? salePrice : oldItemPrice;
                const newItemCost = updateItemCost ? finishedGoodsUnitCost : oldItemCost;
                if (updateItemCost && updateItemSalePrice) {
                    await itemUpdate.query(`UPDATE dbo.Items SET Cost = @UnitCost, Price = @SalePrice, UpdatedAt = GETDATE() WHERE Id = @ItemId`);
                } else if (updateItemCost) {
                    await itemUpdate.query(`UPDATE dbo.Items SET Cost = @UnitCost, UpdatedAt = GETDATE() WHERE Id = @ItemId`);
                } else if (updateItemSalePrice) {
                    await itemUpdate.query(`UPDATE dbo.Items SET Price = @SalePrice, UpdatedAt = GETDATE() WHERE Id = @ItemId`);
                }
                const priceChangeLogId = `MFG-PRICE-${suffix}`;
                if (newItemPrice !== oldItemPrice || newItemCost !== oldItemCost) {
                    await new sql.Request(tx)
                        .input('Id', sql.NVarChar(64), priceChangeLogId)
                        .input('ItemId', sql.NVarChar(64), orderRow.FinishedItemId)
                        .input('ItemCode', sql.NVarChar(100), itemRow.Code || null)
                        .input('ItemName', sql.NVarChar(255), itemRow.Name || orderRow.FinishedItemName)
                        .input('OldPrice', sql.Decimal(18, 4), oldItemPrice)
                        .input('NewPrice', sql.Decimal(18, 4), newItemPrice)
                        .input('OldCost', sql.Decimal(18, 4), oldItemCost)
                        .input('NewCost', sql.Decimal(18, 4), newItemCost)
                        .input('Timestamp', sql.DateTime2, now)
                        .input('ChangedById', sql.NVarChar(64), body.userId || null)
                        .input('ChangedByName', sql.NVarChar(255), body.userName || 'النظام')
                        .input('Reason', sql.NVarChar(500), `تحديث من أمر التصنيع ${orderRow.OrderNumber}، التشغيلة ${batchNumber}، بهامش مستهدف ${profitMarginPercent}%`)
                        .query(`INSERT INTO dbo.PriceChangeLogs (Id, ItemId, ItemCode, ItemName, OldPrice, NewPrice, OldCost, NewCost, Timestamp, ChangedById, ChangedByName, Reason)
                            VALUES (@Id, @ItemId, @ItemCode, @ItemName, @OldPrice, @NewPrice, @OldCost, @NewCost, @Timestamp, @ChangedById, @ChangedByName, @Reason)`);
                }

                await tx.commit();
                await logAuditEvent({ action: 'POST', entity: 'ManufacturingOrder', entityId: orderId, userId: body.userId || 'system',
                    userName: body.userName || 'النظام', details: `اعتماد أمر التصنيع ${orderRow.OrderNumber}: التشغيلة ${batchNumber}، ترحيل ${postedLedgerIds.length} قيود محاسبية للصرف والتكاليف والإنتاج، إنتاج صالح ${producedQty}، هدر موزع ${allocatedWasteCost.toFixed(4)} (${allocatedWasteCostPerUnit.toFixed(4)} للوحدة)، تكلفة الوحدة ${finishedGoodsUnitCost.toFixed(4)}، سعر مقترح ${salePrice.toFixed(4)}.`,
                    previousState: { itemPrice: oldItemPrice, itemCost: oldItemCost },
                    newState: { producedQty, scrapQty, expectedScrapPercent, normalScrapQty, normalScrapCost, abnormalScrapQty, abnormalScrapCost, materialRows, usedMaterialCost, wastedMaterialCost, damagedOutputCost, baseFinishedGoodsCost, allocatedWasteCost, allocatedWasteCostPerUnit, finishedGoodsCost, finishedGoodsUnitCost, profitMarginPercent, salePrice, updateItemCost, updateItemSalePrice, newItemPrice, newItemCost, postedLedgerIds, issueId, returnId, receiptId, priceChangeLogId: newItemPrice !== oldItemPrice || newItemCost !== oldItemCost ? priceChangeLogId : null } }).catch(() => {});
                return NextResponse.json({ success: true, message: 'تم اعتماد الإنتاج ومستنداته وترحيل قيود الصرف والتكاليف والإنتاج بنجاح.', costs: { usedMaterialCost, wastedMaterialCost, damagedOutputCost, normalScrapCost, abnormalScrapCost, baseFinishedGoodsCost, allocatedWasteCost, allocatedWasteCostPerUnit, finishedGoodsCost, finishedGoodsUnitCost }, pricing: { profitMarginPercent, salePrice }, tracking: { batchNumber, wasteTreatment, expectedScrapPercent, normalScrapQty, abnormalScrapQty, allocatedWasteCost, allocatedWasteCostPerUnit, wipTotalCost, updateItemCost, updateItemSalePrice }, documents: { issueId, returnId, returnedMaterialsReceiptId: returnedItems.length ? returnId : null, receiptId, ledgerEntryIds: postedLedgerIds, priceChangeLogId: newItemPrice !== oldItemPrice || newItemCost !== oldItemCost ? priceChangeLogId : null } });
            } catch (error: any) {
                await tx.rollback();
                throw error;
            }
        }

        if (action === 'create') {
            const id = order.id || `mo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const orderNumber = order.orderNumber || `WO-${Date.now().toString().slice(-6)}`;
            const batchNumber = order.batchNumber || `LOT-${orderNumber}`;
            const orderDate = order.orderDate ? new Date(order.orderDate) : new Date();
            const targetQty = Number(order.targetQuantity) || 1;
            const laborCost = Number(order.laborCost) || 0;
            const overheadCost = Number(order.overheadCost) || 0;
            const profitMarginPercent = Number(order.profitMarginPercent ?? 25);
            if (!Number.isFinite(profitMarginPercent) || profitMarginPercent < 0 || profitMarginPercent >= 100) {
                return NextResponse.json({ success: false, message: 'هامش ربح التصنيع يجب أن يكون من 0 إلى أقل من 100٪.' }, { status: 400 });
            }
            const expectedScrapPercent = Number(order.expectedScrapPercent ?? 0);
            if (!Number.isFinite(expectedScrapPercent) || expectedScrapPercent < 0 || expectedScrapPercent >= 100) {
                return NextResponse.json({ success: false, message: 'نسبة الهالك الطبيعي يجب أن تكون من 0 إلى أقل من 100٪.' }, { status: 400 });
            }
            const rawCost = Number(order.rawMaterialCost) || 0;
            const totalCost = rawCost + laborCost + overheadCost;
            const baseUnitCost = targetQty > 0 ? totalCost / targetQty : 0;
            const unitCost = baseUnitCost / (1 - expectedScrapPercent / 100);
            const estimatedSalePrice = unitCost / (1 - profitMarginPercent / 100);
            const bomJson = typeof order.bomDetails === 'string' ? order.bomDetails : JSON.stringify(order.bomDetails || []);

            await pool.request()
                .input('Id', sql.NVarChar(100), id)
                .input('OrderNumber', sql.NVarChar(50), orderNumber)
                .input('BatchNumber', sql.NVarChar(100), batchNumber)
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
                .input('ProfitMarginPercent', sql.Decimal(9, 4), profitMarginPercent)
                .input('EstimatedSalePrice', sql.Decimal(18, 4), estimatedSalePrice)
                .input('ExpectedScrapPercent', sql.Decimal(9, 4), expectedScrapPercent)
                .input('BOMDetailsJson', sql.NVarChar(sql.MAX), bomJson)
                .input('Notes', sql.NVarChar(sql.MAX), order.notes || null)
                .input('CreatedBy', sql.NVarChar(100), userName || userId || 'Admin')
                .query(`
                    INSERT INTO dbo.ManufacturingOrders (
                        Id, OrderNumber, OrderDate, FinishedItemId, FinishedItemName,
                        TargetQuantity, ProducedQuantity, Status, SourceWarehouseId, TargetWarehouseId,
                        RawMaterialCost, LaborCost, OverheadCost, TotalCost, UnitCost, ProfitMarginPercent, EstimatedSalePrice,
                        ExpectedScrapPercent, BOMDetailsJson, Notes, CreatedBy, CreatedAt, UpdatedAt, BatchNumber
                    ) VALUES (
                        @Id, @OrderNumber, @OrderDate, @FinishedItemId, @FinishedItemName,
                        @TargetQuantity, @ProducedQuantity, @Status, @SourceWarehouseId, @TargetWarehouseId,
                        @RawMaterialCost, @LaborCost, @OverheadCost, @TotalCost, @UnitCost, @ProfitMarginPercent, @EstimatedSalePrice,
                        @ExpectedScrapPercent, @BOMDetailsJson, @Notes, @CreatedBy, GETDATE(), GETDATE(), @BatchNumber
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

            return NextResponse.json({ success: true, id, orderNumber, batchNumber });
        }

        if (action === 'update_status') {
            const { id, status, producedQuantity } = order;
            if (status === 'completed') {
                return NextResponse.json({ success: false, message: 'اعتماد الإنتاج يجب أن يتم من مستند التسوية حتى تُحفظ حركات المخزون والتكلفة والقيد معًا.' }, { status: 400 });
            }
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
