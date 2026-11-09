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

            try {
                const pool = new sql.ConnectionPool(sqlConfig);
                localPool = await pool.connect();

                // If connected to an empty database (0 tables), automatically run initialization
                try {
                    const tableCheck = await localPool.request().query(`
                        SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME != 'sysdiagrams';
                    `);
                    if (tableCheck.recordset[0]?.cnt === 0) {
                        console.log(`[Database Auto-Setup] Database [${sqlConfig.database}] is empty (0 tables). Initializing schema and seed data...`);
                        const { createAndInitializeDatabase } = await import('./database-init');
                        await createAndInitializeDatabase({
                            server: String(sqlConfig.server),
                            port: Number(sqlConfig.port) || 1433,
                            database: String(sqlConfig.database),
                            user: String(sqlConfig.user),
                            password: String(sqlConfig.password),
                            branchCode: '900',
                            branchName: 'الفرع الرأيسي',
                            isCentral: false
                        });
                    }
                } catch (tcErr: any) {
                    console.warn('[Database Auto-Setup] Table check error:', tcErr.message);
                }

                return localPool;
            } catch (connErr: any) {
                // If database does not exist (error 4060 or message includes Cannot open database)
                const isDbMissing = connErr.number === 4060 || 
                                    (connErr.message && connErr.message.includes('Cannot open database'));
                
                if (isDbMissing) {
                    console.log(`[Database Auto-Setup] Database [${sqlConfig.database}] does not exist. Initializing automatically on first run...`);
                    const { createAndInitializeDatabase } = await import('./database-init');
                    const initRes = await createAndInitializeDatabase({
                        server: String(sqlConfig.server),
                        port: Number(sqlConfig.port) || 1433,
                        database: String(sqlConfig.database),
                        user: String(sqlConfig.user),
                        password: String(sqlConfig.password),
                        branchCode: '900',
                        branchName: 'الفرع الرأيسي',
                        isCentral: false
                    });

                    if (initRes.success) {
                        console.log(`[Database Auto-Setup] ${initRes.message}`);
                        const pool = new sql.ConnectionPool(sqlConfig);
                        localPool = await pool.connect();
                        return localPool;
                    } else {
                        console.error('[Database Auto-Setup Failed]', initRes.error);
                        throw new Error(`فشل إنشاء وتهيئة قاعدة البيانات تلقائياً: ${initRes.error}`);
                    }
                }
                throw connErr;
            }
        } finally {
            connectingPromise = null;
        }
    })();

    return connectingPromise;
}

export { sql };
