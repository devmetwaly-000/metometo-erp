const sql = require('mssql');
const fs = require('fs');

const config = {
    user: process.env.DB_USER || 'meto_pos',
    password: process.env.DB_PASSWORD || 'MetoPosPass123!',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'MultiBranchPOS_DB',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function main() {
    const pool = await sql.connect(config);
    const tablesRes = await pool.request().query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME != 'sysdiagrams'
        ORDER BY TABLE_NAME
    `);
    const tables = tablesRes.recordset.map(r => r.TABLE_NAME);
    console.log('Total tables found in local DB:', tables.length);

    // For each table, get columns, PKs, types
    const tableSchemas = [];
    for (const t of tables) {
        const colsRes = await pool.request()
            .input('tbl', sql.NVarChar(128), t)
            .query(`
                SELECT 
                    c.COLUMN_NAME, 
                    c.DATA_TYPE, 
                    c.CHARACTER_MAXIMUM_LENGTH, 
                    c.NUMERIC_PRECISION, 
                    c.NUMERIC_SCALE, 
                    c.IS_NULLABLE, 
                    c.COLUMN_DEFAULT,
                    COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') as IsIdentity
                FROM INFORMATION_SCHEMA.COLUMNS c
                WHERE c.TABLE_NAME = @tbl
                ORDER BY c.ORDINAL_POSITION
            `);

        const pkRes = await pool.request()
            .input('tbl', sql.NVarChar(128), t)
            .query(`
                SELECT kcu.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu 
                  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME 
                 AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' 
                  AND tc.TABLE_NAME = @tbl
            `);
        const pks = pkRes.recordset.map(r => r.COLUMN_NAME);

        tableSchemas.push({
            table: t,
            columns: colsRes.recordset,
            pks: pks
        });
    }

    await pool.close();

    fs.writeFileSync('scripts/tables_schema.json', JSON.stringify(tableSchemas, null, 2), 'utf8');
    console.log('Successfully wrote scripts/tables_schema.json with', tableSchemas.length, 'tables.');
}

main().catch(console.error);

