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
const TMP_CONFIG_FILE_PATH = path.join('/tmp', 'local-db-config.json');
const isServerless = Boolean(
    process.env.VERCEL || 
    process.env.AWS_LAMBDA_FUNCTION_NAME || 
    process.env.LAMBDA_TASK_ROOT || 
    process.env.NEXT_RUNTIME === 'edge'
);
let inMemoryLocalDbConfig: LocalDbConfig | null = null;

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
            if (rawVal) {
                // إذا كان النص المنسوخ من AWS أو SSMS يحتوي على Initial Catalog=master، نستخدم MultiBranchPOS_DB تلقائياً لإنشاء جداول النظام فيها بدلاً من قاعدة النظام master
                result.database = rawVal.toLowerCase() === 'master' ? 'MultiBranchPOS_DB' : rawVal;
            }
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
    if (inMemoryLocalDbConfig) {
        return inMemoryLocalDbConfig;
    }
    try {
        const filePath = isServerless
            ? (fs.existsSync(TMP_CONFIG_FILE_PATH) ? TMP_CONFIG_FILE_PATH : (fs.existsSync(CONFIG_FILE_PATH) ? CONFIG_FILE_PATH : null))
            : (fs.existsSync(CONFIG_FILE_PATH) ? CONFIG_FILE_PATH : (fs.existsSync(TMP_CONFIG_FILE_PATH) ? TMP_CONFIG_FILE_PATH : null));

        if (filePath) {
            const raw = fs.readFileSync(filePath, 'utf8');
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
            inMemoryLocalDbConfig = merged;
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

    const effectiveDb =
        targetDatabase ||
        (!cfg.database || cfg.database.toLowerCase() === 'master' ? 'MultiBranchPOS_DB' : cfg.database);

    return {
        user: cfg.user,
        password: cfg.password,
        server: cleanServer,
        port,
        database: effectiveDb,
        connectionTimeout: isCloudEndpoint ? Math.max(Number(cfg.connectionTimeout) || 15000, 15000) : (Number(cfg.connectionTimeout) || 6000),
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
let schemaMigratedForKey: string | null = null;

/**
 * إغلاق الاتصال الحالي لإجبار النظام على الاتصال بالسيرفر الجديد فوراً
 */
export async function resetDbPool(): Promise<void> {
    connectingPromise = null;
    const poolToClose = localPool;
    localPool = null;
    if (poolToClose) {
        try {
            await Promise.race([
                poolToClose.close().catch(() => {}),
                new Promise(resolve => setTimeout(resolve, 1000)),
            ]);
        } catch {}
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

    inMemoryLocalDbConfig = updated;

    if (isServerless) {
        try {
            fs.writeFileSync(TMP_CONFIG_FILE_PATH, JSON.stringify(updated, null, 2), 'utf8');
        } catch (tmpErr: any) {
            console.warn('[LocalDbConfig] Could not write to /tmp in serverless environment:', tmpErr.message);
        }
    } else {
        try {
            fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(updated, null, 2), 'utf8');
        } catch (fsErr: any) {
            console.warn('[LocalDbConfig] Could not write to CONFIG_FILE_PATH (e.g. read-only filesystem):', fsErr.message);
            try {
                fs.writeFileSync(TMP_CONFIG_FILE_PATH, JSON.stringify(updated, null, 2), 'utf8');
            } catch (tmpErr: any) {
                console.warn('[LocalDbConfig] Could not write to /tmp either:', tmpErr.message);
            }
        }
    }
    schemaMigratedForKey = null;
    const isIndexed = String(updated.server || '').toLowerCase().includes('indexeddb');
    if (!isIndexed) {
        await resetDbPool();
    }
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
    const serverName = String(cfg.server || '').toLowerCase().trim();
    if (serverName === 'indexeddb' || serverName.includes('indexeddb') || serverName === 'browser') {
        return {
            success: true,
            databaseExists: true,
            latencyMs: 1,
            server: 'IndexedDB (Browser)',
            database: 'MultiBranchPOS_IndexedDB',
            serverVersion: 'Browser IndexedDB + Firebase Realtime',
            message: 'تم تفعيل وضع المتصفح الذكي (IndexedDB + Firebase Realtime) بنجاح. لا حاجة لتثبيت SQL Server محلي!'
        };
    }

    const mssqlCfg = buildMssqlConfig(cfg);
    let testPool: sql.ConnectionPool | null = null;

    const connectAttempt = async (c: sql.config) => {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                return await new sql.ConnectionPool(c).connect();
            } catch (err: any) {
                const msg = String(err?.message || '').toLowerCase();
                if ((err?.code === 'EAI_AGAIN' || msg.includes('eai_again')) && attempt < 2) {
                    await new Promise(r => setTimeout(r, 800));
                    continue;
                }
                throw err;
            }
        }
        throw new Error('Connection failed');
    };

    try {
        testPool = await connectAttempt(mssqlCfg);
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
        const lowerErr = errMsg.toLowerCase();
        // AWS RDS SQL Server masks non-existent database errors as 18456 ("Login failed for user") instead of 4060
        if (
            err.number === 4060 ||
            err.number === 18456 ||
            lowerErr.includes('cannot open database') ||
            lowerErr.includes('login failed')
        ) {
            try {
                const masterCfg = buildMssqlConfig(cfg, 'master');
                const masterPool = await connectAttempt(masterCfg);
                const masterRes = await masterPool.request().query('SELECT @@VERSION as version;');
                const latencyMs = Date.now() - startTime;
                await masterPool.close();

                return {
                    success: true,
                    databaseExists: false,
                    latencyMs,
                    server: `${mssqlCfg.server}:${mssqlCfg.port}`,
                    database: mssqlCfg.database,
                    serverVersion: masterRes.recordset[0]?.version?.split('\n')[0] || 'Microsoft SQL Server',
                    message: `تم الاتصال بالسيرفر (${mssqlCfg.server}:${mssqlCfg.port}) بنجاح! قاعدة البيانات [${mssqlCfg.database}] غير موجودة بعد — اضغط "3. إنشاء وتأسيس قاعدة البيانات والجداول" لإنشائها الآن.`
                };
            } catch {}
        }

        let detailedError = `فشل الاتصال بالسيرفر (${mssqlCfg.server}:${mssqlCfg.port}): ${errMsg}`;
        if (
            String(mssqlCfg.server).includes('.rds.amazonaws.com') &&
            (err.code === 'ETIMEOUT' || errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('failed to connect'))
        ) {
            detailedError = `انتهت مهلة الاتصال بسيرفر Amazon AWS RDS (${mssqlCfg.server}). السبب: السيرفر في أمازون مضبوط حالياً على وضع داخلي خاص (Private VPC IP) أو جدار الحماية مغلق. للحل من لوحة تحكم AWS RDS: 1) اضغط Modify على القاعدة واجعل "Public access = Publicly accessible". 2) في Security Group (Inbound Rules) أضف قاعدة للنوع MSSQL (Port 1433) من المصدر Anywhere-IPv4 (0.0.0.0/0).`;
        }

        return {
            success: false,
            databaseExists: false,
            server: `${mssqlCfg.server}:${mssqlCfg.port}`,
            database: cfg.database,
            error: detailedError
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
        const serverName = String(currentCfg.server || '').toLowerCase().trim();
        if (serverName === 'indexeddb' || serverName.includes('indexeddb') || serverName === 'browser') {
            throw new Error('النظام يعمل في وضع المتصفح الذكي (IndexedDB + Firebase) ولا يتطلب الاتصال بمحرك SQL Server.');
        }
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

                const dbTargetKey = `${sqlConfig.server}:${sqlConfig.port}/${sqlConfig.database}`;
                // Apply idempotent schema migrations once per target database per process so reconnects stay fast (< 500ms)
                if (schemaMigratedForKey !== dbTargetKey) {
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
                        schemaMigratedForKey = dbTargetKey;
                        console.log(`[Database Schema] ${initResult.message}`);
                    } catch (tcErr: any) {
                        console.error('[Database Schema] Compatibility migration failed:', tcErr.message);
                        if (localPool) {
                            try { await localPool.close(); } catch {}
                        }
                        localPool = null;
                        throw tcErr;
                    }
                }

                return localPool;
            } catch (connErr: any) {
                let isDbMissing = false;
                const connErrLower = String(connErr?.message || '').toLowerCase();
                if (
                    connErr.number === 4060 ||
                    connErr.number === 18456 ||
                    connErrLower.includes('cannot open database') ||
                    connErrLower.includes('login failed')
                ) {
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
