const sql = require('mssql');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
async function run() {
    try {
        await sql.connect({ user: process.env.DB_USER, password: process.env.DB_PASSWORD, server: process.env.DB_SERVER || 'localhost', database: process.env.DB_NAME, options: { encrypt: false, trustServerCertificate: true } });
        
        const warehouseId = '-P2S4PYETwslu4f4ym70';
        const itemId = '-Oz33J7W8wAvlYB4_SJ-';
        
        // محاكاة calculateStockForItemInWarehouse بالضبط
        const stockIn = await sql.query(`SELECT Id, Status, WarehouseId, ItemsJson FROM dbo.StockInRecords ORDER BY Date DESC`);
        
        let stock = 0;
        for (const si of stockIn.recordset) {
            const wh = si.WarehouseId;
            const st = (si.Status || '').toLowerCase();
            
            if (st === 'in_transit' || st === 'pending_putaway' || st === 'pending' || st === 'draft') {
                console.log(`SKIP ${si.Id} status=${st}`);
                continue;
            }
            if (wh !== warehouseId) continue;
            
            let items = [];
            try { items = JSON.parse(si.ItemsJson || '[]'); } catch {}
            
            for (const i of items) {
                const iId = i.id || i.itemId || i.ItemId;
                if (iId === itemId) {
                    const qty = Number(i.qty || i.quantity || 0);
                    console.log(`ADD from ${si.Id}: qty=${qty} status=${st}`);
                    stock += qty;
                }
            }
        }
        
        console.log(`\nFinal stock for item ${itemId} in warehouse ${warehouseId}: ${stock}`);

    } catch(e) { console.error(e.message); }
    finally { await sql.close(); }
}
run();
