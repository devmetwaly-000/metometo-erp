import sql from 'mssql';

const sqlConfig: sql.config = {
    user: process.env.DB_USER || 'meto_pos',
    password: process.env.DB_PASSWORD || 'MetoPosPass123!',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'MultiBranchPOS_DB',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
    },
    pool: {
        max: 20,
        min: 2,
        idleTimeoutMillis: 30000,
    },
};

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export async function getDbPool(): Promise<sql.ConnectionPool> {
    if (!poolPromise) {
        poolPromise = sql.connect(sqlConfig).catch(err => {
            poolPromise = null;
            console.error('SQL Server Connection Error:', err);
            throw err;
        });
    }
    return poolPromise;
}

export { sql };

