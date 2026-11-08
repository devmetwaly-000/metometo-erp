const sql = require('mssql');

const config = {
    user: 'meto_pos',
    password: 'MetoPosPass123!',
    server: 'localhost',
    database: 'MultiBranchPOS_Central_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

async function check() {
    const pool = new sql.ConnectionPool(config);
    await pool.connect();

    const cols = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SalesInvoices'");
    console.log('Columns in Central SalesInvoices:', cols.recordset.map(r => r.COLUMN_NAME));

    await pool.close();
}

check().catch(console.error);

