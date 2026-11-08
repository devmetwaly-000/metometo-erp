const sql = require('mssql');

const localConfig = {
    user: 'meto_pos',
    password: 'MetoPosPass123!',
    server: 'localhost',
    database: 'MultiBranchPOS_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

const centralConfig = {
    user: 'meto_pos',
    password: 'MetoPosPass123!',
    server: 'localhost',
    database: 'MultiBranchPOS_Central_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

async function fixParity() {
    const local = new sql.ConnectionPool(localConfig);
    await local.connect();
    const central = new sql.ConnectionPool(centralConfig);
    await central.connect();

    // 1. Fix ExpenseType in Expenses to allow NULL
    try {
        await central.request().query('ALTER TABLE dbo.Expenses ALTER COLUMN ExpenseType NVARCHAR(100) NULL;');
        console.log('Fixed Expenses.ExpenseType to allow NULL');
    } catch(e) { console.warn('Expenses.ExpenseType:', e.message); }

    // 2. Scan all columns across all 69 tables in local DB
    const localCols = await local.request().query(`
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME != 'sysdiagrams'
        ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);

    const centralCols = await central.request().query(`
        SELECT TABLE_NAME, COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME != 'sysdiagrams'
    `);

    const centralSet = new Set(centralCols.recordset.map(r => r.TABLE_NAME + '.' + r.COLUMN_NAME.toLowerCase()));

    let addedCount = 0;
    for (const col of localCols.recordset) {
        const key = col.TABLE_NAME + '.' + col.COLUMN_NAME.toLowerCase();
        if (!centralSet.has(key)) {
            let type = col.DATA_TYPE.toUpperCase();
            if (['NVARCHAR', 'VARCHAR', 'CHAR', 'NCHAR'].includes(type)) {
                type += '(' + (col.CHARACTER_MAXIMUM_LENGTH === -1 ? 'MAX' : col.CHARACTER_MAXIMUM_LENGTH) + ')';
            } else if (['DECIMAL', 'NUMERIC'].includes(type)) {
                type += '(' + col.NUMERIC_PRECISION + ',' + col.NUMERIC_SCALE + ')';
            }

            const alterSql = `ALTER TABLE dbo.[${col.TABLE_NAME}] ADD [${col.COLUMN_NAME}] ${type} NULL;`;
            try {
                await central.request().query(alterSql);
                console.log(`[+] Added ${col.TABLE_NAME}.${col.COLUMN_NAME} to Central DB`);
                addedCount++;
            } catch (err) {
                console.warn(`[!] Failed adding ${col.TABLE_NAME}.${col.COLUMN_NAME}:`, err.message);
            }
        }
    }

    console.log(`Parity check finished: Added ${addedCount} missing columns.`);

    await local.close();
    await central.close();
}

fixParity().catch(console.error);

