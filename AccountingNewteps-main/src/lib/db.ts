import sql from 'mssql';
import fs from 'fs';
import path from 'path';

export interface LocalDbConfig {
    connectionMode: 'fields' | 'connectionString';
    connectionString: string;
    server: string;
    port: number;
    database: string;
    user: string;
    password: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
    connectionTimeout: number;
}

const CONFIG_FILE_PATH = path.join(process.cwd(), 'local-db-config.json');

const DEFAULT_LOCAL_DB_CONFIG: LocalDbConfig = {
    connectionMode: 'fields',
    connectionString: '',
    server: process.env.DB_SERVER || 'localhost',
    port: Number(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'MultiBranchPOS_DB',
    user: process.env.DB_USER || 'meto_pos',
    password: process.env.DB_PASSWORD || 'MetoPosPass123!',
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true,
    connectionTimeout: 6000,
};

/**
 * تحليل نص الاتصال القياسي لـ SQL Server / AWS RDS / Azure SQL
 * مثال: Server=tcp:my-rds.amazonaws.com,1433;Database=MultiBranchPOS_DB;User Id=admin;Password=123;Encrypt=true;TrustServerCertificate=true;
 */
export function parseSqlConnectionString(connStr: string): Partial<LocalDbConfig> {
    if (!connStr || typeof connStr !== 'string') return {};
    const result: Partial<LocalDbConfig> = {
        connectionMode: 'connectionString',
        connectionString: connStr.trim()
    };

    const pairs = connStr.split(';').map(p => p.trim()).filter(Boolean);
    for (const pair of pairs) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) continue;
        const rawKey = pair.slice(0, eqIdx).trim().toLowerCase();
        const rawVal = pair.slice(eqIdx + 1).trim();

        if (['server', 'data source', 'addr', 'address', 'network address'].includes(rawKey)) {
            let cleanHost = rawVal.replace(/^tcp:/i, '').trim();
            if (cleanHost.includes(',')) {
                const [h, p] = cleanHost.split(',');
                cleanHost = h.trim();
                const parsedPort = parseInt(p.trim(), 10);
                if (!isNaN(parsedPort)) result.port = parsedPort;
            } else if (cleanHost.includes(':')) {
                const [h, p] = cleanHost.split(':');
                cleanHost = h.trim();
                const parsedPort = parseInt(p.trim(), 10);
                if (!isNaN(parsedPort)) result.port = parsedPort;
            }
            if (cleanHost) result.server = cleanHost;
        } else if (['database', 'initial catalog'].includes(rawKey)) {
            if (rawVal) result.database = rawVal;
        } else if (['user id', 'uid', 'user', 'username'].includes(rawKey)) {
            if (rawVal) result.user = rawVal;
        } else if (['password', 'pwd'].includes(rawKey)) {
            result.password = rawVal;
        } else if (rawKey === 'port') {
            const parsedPort = parseInt(rawVal, 10);
            if (!isNaN(parsedPort)) result.port = parsedPort;
        } else if (rawKey === 'encrypt') {
            result.encrypt = ['true', 'yes', '1', 'mandatory'].includes(rawVal.toLowerCase());
        } else if (['trustservercertificate', 'trust server certificate'].includes(rawKey)) {
            result.trustServerCertificate = !['false', 'no', '0'].includes(rawVal.toLowerCase());
        }
    }

    return result;
}

/**
 * توليد نص اتصال قياسي من الحقول
 */
export function formatSqlConnectionString(cfg: LocalDbConfig): string {
    const srv = cfg.port && cfg.port !== 1433 ? `${cfg.server},${cfg.port}` : `${cfg.server},${cfg.port || 1433}`;
    return `Server=${srv};Database=${cfg.database};User Id=${cfg.user};Password=${cfg.password};Encrypt=${cfg.encrypt ? 'true' : 'false'};TrustServerCertificate=${cfg.trustServerCertificate !== false ? 'true' : 'false'};`;
}

/**
 * قراءة إعدادات الاتصال بالسيرفر المحلي / السحابي (AWS / IP خارجي)
 */
export function getLocalDbConfig(): LocalDbConfig {
    try {
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
            const parsed = JSON.parse(raw);
            const merged: LocalDbConfig = {
                ...DEFAULT_LOCAL_DB_CONFIG,
                ...parsed,
                port: Number(parsed.port) || DEFAULT_LOCAL_DB_CONFIG.port,
                connectionTimeout: Number(parsed.connectionTimeout) || DEFAULT_LOCAL_DB_CONFIG.connectionTimeout,
            };
            if (!merged.connectionString) {
                merged.connectionString = formatSqlConnectionString(merged);
            }
            return merged;
        }
    } catch (err) {
        console.warn('[LocalDbConfig] Failed to read local-db-config.json:', err);
    }
    return {
        ...DEFAULT_LOCAL_DB_CONFIG,
        connectionString: formatSqlConnectionString(DEFAULT_LOCAL_DB_CONFIG)
    };
}

function buildMssqlConfig(cfg: LocalDbConfig, targetDatabase?: string): sql.config {
    let cleanServer = (cfg.server || 'localhost').trim().replace(/^tcp:/i, '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
    let port = Number(cfg.port) || 1433;

    if (cleanServer.includes(',')) {
        const [h, p] = cleanServer.split(',');
        cleanServer = h.trim();
        port = parseInt(p.trim(), 10) || port;
    } else if (cleanServer.includes(':')) {
        const [h, p] = cleanServer.split(':');
        cleanServer = h.trim();
        port = parseInt(p.trim(), 10) || port;
    }

    const isCloudEndpoint =
        cleanServer.includes('.rds.amazonaws.com') ||
        cleanServer.includes('.database.windows.net') ||
        Boolean(cfg.encrypt);

    return {
        user: cfg.user,
        password: cfg.password,
        server: cleanServer,
        port,
        database: targetDatabase || cfg.database || 'MultiBranchPOS_DB',
        connectionTimeout: Number(cfg.connectionTimeout) || 6000,
        requestTimeout: 60000,
        options: {
            encrypt: isCloudEndpoint,
            trustServerCertificate: cfg.trustServerCertificate !== false,
            enableArithAbort: true,
        },
        pool: {
            max: 120,
            min: 2,
            idleTimeoutMillis: 30000,
            acquireTimeoutMillis: 30000,
        },
    };
}

let localPool: sql.ConnectionPool | null = null;
let connectingPromise: Promise<sql.ConnectionPool> | null = null;

/**
 * إغلاق الاتصال الحالي لإجبار النظام على الاتصال بالسيرفر الجديد فوراً
 */
export async function resetDbPool(): Promise<void> {
    connectingPromise = null;
    if (localPool) {
        try {
            await localPool.close();
        } catch {}
        localPool = null;
    }
}

/**
 * حفظ إعدادات اتصال السيرفر المحلي / السحابي وإعادة تهيئة الـ Pool فوراً
 */
export async function saveLocalDbConfig(input: Partial<LocalDbConfig>): Promise<LocalDbConfig> {
    const current = getLocalDbConfig();
    let updated: LocalDbConfig = {
        ...current,
        ...input,
    };

    // إذا قام المستخدم بإدخال نص اتصال كامل، نقوم بتحليله وتحديث الحقول منه تلقائياً
    if (input.connectionString && (input.connectionMode === 'connectionString' || !input.server)) {
        const extracted = parseSqlConnectionString(input.connectionString);
        updated = {
            ...updated,
            ...extracted,
            password: extracted.password !== undefined && extracted.password !== '' ? extracted.password : updated.password,
        };
    } else {
        // إذا قام بتعديل الحقول، نحدث نص الاتصال المطابق لها
        if (!input.password || input.password.trim() === '') {
            updated.password = current.password;
        }
        updated.connectionString = formatSqlConnectionString(updated);
    }

    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(updated, null, 2), 'utf8');
    await resetDbPool();
    return updated;
}

/**
 * اختبار الاتصال بالسيرفر المحدد (سواء محلي أو IP خارجي أو Amazon AWS RDS)
 */
export async function testLocalDbConnection(input?: Partial<LocalDbConfig>): Promise<{
    success: boolean;
    databaseExists: boolean;
    serverVersion?: string;
    database?: string;
    server?: string;
    latencyMs?: number;
    message?: string;
    error?: string;
}> {
    const current = getLocalDbConfig();
    let cfg: LocalDbConfig = { ...current, ...(input || {}) };

    if (input?.connectionString && (input.connectionMode === 'connectionString' || !input.server)) {
        const extracted = parseSqlConnectionString(input.connectionString);
        cfg = {
            ...cfg,
            ...extracted,
            password: extracted.password !== undefined && extracted.password !== '' ? extracted.password : current.password,
        };
    } else if (!input?.password || input.password.trim() === '') {
        cfg.password = current.password;
    }

    const startTime = Date.now();
    const mssqlCfg = buildMssqlConfig(cfg);
    let testPool: sql.ConnectionPool | null = null;

    try {
        testPool = await new sql.ConnectionPool(mssqlCfg).connect();
        const res = await testPool.request().query('SELECT @@VERSION as version, DB_NAME() as dbName;');
        const latencyMs = Date.now() - startTime;
        await testPool.close();

        return {
            success: true,
            databaseExists: true,
            latencyMs,
            server: `${mssqlCfg.server}:${mssqlCfg.port}`,
            database: res.recordset[0]?.dbName || cfg.database,
            serverVersion: res.recordset[0]?.version?.split('\n')[0] || 'Microsoft SQL Server',
            message: `تم الاتصال بالسيرفر (${mssqlCfg.server}:${mssqlCfg.port}) وقاعدة البيانات [${cfg.database}] بنجاح (${latencyMs}ms).`
        };
    } catch (err: any) {
        if (testPool) {
            try { await testPool.close(); } catch {}
        }

        const errMsg: string = err.message || '';
        if (err.number === 4060 || errMsg.toLowerCase().includes('cannot open database')) {
            try {
                const masterCfg = buildMssqlConfig(cfg, 'master');
                const masterPool = await new sql.ConnectionPool(masterCfg).connect();
                const masterRes = await masterPool.request().query('SELECT @@VERSION as version;');
                const latencyMs = Date.now() - startTime;
                await masterPool.close();

                return {
                    success: true,
                    databaseExists: false,
                    latencyMs,
                    server: `${mssqlCfg.server}:${mssqlCfg.port}`,
                    database: cfg.database,
                    serverVersion: masterRes.recordset[0]?.version?.split('\n')[0] || 'Microsoft SQL Server',
                    message: `تم الاتصال بالسيرفر (${mssqlCfg.server}:${mssqlCfg.port}) بنجاح! لكن قاعدة البيانات [${cfg.database}] غير موجودة بعد (يمكنك إنشاؤها وتأسيسها الآن بضغطة زر).`
                };
            } catch {}
        }

        return {
            success: false,
            databaseExists: false,
            server: `${mssqlCfg.server}:${mssqlCfg.port}`,
            database: cfg.database,
            error: `فشل الاتصال بالسيرفر (${mssqlCfg.server}:${mssqlCfg.port}): ${errMsg}`
        };
    }
}

export async function getDbPool(): Promise<sql.ConnectionPool> {
    if (localPool && localPool.connected) {
        return localPool;
    }

    if (connectingPromise) {
        return connectingPromise;
    }

    connectingPromise = (async () => {
        const currentCfg = getLocalDbConfig();
        const sqlConfig = buildMssqlConfig(currentCfg);

        try {
            if (localPool) {
                try {
                    await localPool.close();
                } catch {}
                localPool = null;
            }

            try {
                const pool = new sql.ConnectionPool(sqlConfig);
                localPool = await pool.connect();

                // Apply idempotent schema migrations on first DB connection
                try {
                    const tableCheck = await localPool.request().query(`
                        SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME != 'sysdiagrams';
                    `);
                    const tablesCount = Number(tableCheck.recordset[0]?.cnt) || 0;
                    console.log(`[Database Schema] Running compatibility migrations for [${sqlConfig.database}] on [${sqlConfig.server}:${sqlConfig.port}] (${tablesCount} existing tables)...`);
                    const { createAndInitializeDatabase } = await import('./database-init');
                    const initResult = await createAndInitializeDatabase({
                        server: String(sqlConfig.server),
                        port: Number(sqlConfig.port) || 1433,
                        database: String(sqlConfig.database),
                        user: String(sqlConfig.user),
                        password: String(sqlConfig.password),
                        branchCode: '900',
                        branchName: 'الفرع الرأيسي',
                        isCentral: false,
                        skipDemoSeed: tablesCount > 0
                    });
                    if (!initResult.success) {
                        throw new Error(initResult.error || initResult.message || 'فشلت ترقية بنية قاعدة البيانات');
                    }
                    console.log(`[Database Schema] ${initResult.message}`);
                } catch (tcErr: any) {
                    console.error('[Database Schema] Compatibility migration failed:', tcErr.message);
                    if (localPool) {
                        try { await localPool.close(); } catch {}
                    }
                    localPool = null;
                    throw tcErr;
                }

                return localPool;
            } catch (connErr: any) {
                let isDbMissing = false;
                if (connErr.number === 4060 || (connErr.message && connErr.message.includes('Cannot open database'))) {
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
                            try { await masterPool.close(); } catch {}
                        }
                    }
                }

                if (isDbMissing) {
                    const missingDatabaseError: NodeJS.ErrnoException = new Error(
                        `قاعدة البيانات [${sqlConfig.database}] على السيرفر [${sqlConfig.server}] غير موجودة. يلزم تأكيد إنشائها.`
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
