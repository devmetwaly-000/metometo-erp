import sql from 'mssql';

const sqlConfig: sql.config = {
    user: process.env.DB_USER || 'meto_pos',
    password: process.env.DB_PASSWORD || 'MetoPosPass123!',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'MultiBranchPOS_DB',
    connectionTimeout: 30000,
    requestTimeout: 60000,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
    },
    pool: {
        max: 120,
        min: 10,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 30000,
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

                // Apply the idempotent schema migrations on every process's first DB connection.
                // Existing databases used to skip initialization entirely, leaving new columns
                // absent until a screen failed with SQL error 207.
                try {
                    const tableCheck = await localPool.request().query(`
                        SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME != 'sysdiagrams';
                    `);
                    const tablesCount = Number(tableCheck.recordset[0]?.cnt) || 0;
                    console.log(`[Database Schema] Running compatibility migrations for [${sqlConfig.database}] (${tablesCount} existing tables)...`);
                    const { createAndInitializeDatabase } = await import('./database-init');
                    const initResult = await createAndInitializeDatabase({
                        server: String(sqlConfig.server),
                        port: Number(sqlConfig.port) || 1433,
                        database: String(sqlConfig.database),
                        user: String(sqlConfig.user),
                        password: String(sqlConfig.password),
                        branchCode: '900',
                        branchName: 'الفرع الرأيسي',
                        isCentral: false
                    });
                    if (!initResult.success) {
                        throw new Error(initResult.error || initResult.message || 'فشلت ترقية بنية قاعدة البيانات');
                    }
                    console.log(`[Database Schema] ${initResult.message}`);
                } catch (tcErr: any) {
                    console.error('[Database Schema] Compatibility migration failed:', tcErr.message);
                    if (localPool) {
                        try { await localPool.close(); } catch { /* Ignore cleanup failure */ }
                    }
                    localPool = null;
                    throw tcErr;
                }

                return localPool;
            } catch (connErr: any) {
                // If database does not exist (error 4060 or message includes Cannot open database)
                let isDbMissing = false;
                if (connErr.number === 4060 || (connErr.message && connErr.message.includes('Cannot open database'))) {
                    // Error 4060 also means a permission/open-state problem. Confirm that the
                    // configured database is actually absent before asking the user to create it.
                    let masterPool: sql.ConnectionPool | null = null;
                    try {
                        masterPool = await new sql.ConnectionPool({
                            ...sqlConfig,
                            database: 'master'
                        }).connect();
                        const dbCheck = await masterPool.request()
                            .input('DatabaseName', sql.NVarChar(128), String(sqlConfig.database))
                            .query('SELECT 1 AS existsFlag FROM sys.databases WHERE name = @DatabaseName');
                        isDbMissing = dbCheck.recordset.length === 0;
                    } catch (masterErr: any) {
                        console.warn('[Database Setup] Could not verify database existence in master:', masterErr.message);
                    } finally {
                        if (masterPool) {
                            try { await masterPool.close(); } catch { /* Ignore cleanup failure */ }
                        }
                    }
                }

                if (isDbMissing) {
                    const missingDatabaseError: NodeJS.ErrnoException = new Error(
                        `قاعدة البيانات المحلية [${sqlConfig.database}] غير موجودة. يلزم تأكيد إنشائها من شاشة بدء التشغيل.`
                    );
                    missingDatabaseError.code = 'LOCAL_DATABASE_MISSING';
                    throw missingDatabaseError;
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
