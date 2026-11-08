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

let localPool: sql.ConnectionPool | null = null;
let connectingPromise: Promise<sql.ConnectionPool> | null = null;

export async function getDbPool(): Promise<sql.ConnectionPool> {
    if (localPool && localPool.connected) {
        return localPool;
    }

    if (connectingPromise) {
        return connectingPromise;
    }

    connectingPromise = (async () => {
        try {
            if (localPool) {
                try {
                    await localPool.close();
                } catch {
                    // Ignore close error on dead pool
                }
                localPool = null;
            }

            const pool = new sql.ConnectionPool(sqlConfig);
            localPool = await pool.connect();
            return localPool;
        } finally {
            connectingPromise = null;
        }
    })();

    return connectingPromise;
}

export { sql };
