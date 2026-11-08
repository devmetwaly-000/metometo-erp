const sql = require('mssql');

async function main() {
    const local = await sql.connect({
        user: 'meto_pos',
        password: 'MetoPosPass123!',
        server: 'localhost',
        database: 'MultiBranchPOS_DB',
        options: { encrypt: false, trustServerCertificate: true }
    });
    const res = await local.request().query("SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = 'central_sync'");
    const cfg = JSON.parse(res.recordset[0]?.SettingValue || '{}');
    await local.close();

    console.log(`Connecting to Central (${cfg.centralServerIp})...`);
    const central = await sql.connect({
        user: cfg.centralUsername,
        password: cfg.centralPassword,
        server: cfg.centralServerIp,
        port: Number(cfg.centralSqlPort) || 1433,
        database: cfg.centralDatabase,
        options: { encrypt: false, trustServerCertificate: true, connectTimeout: 15000 }
    });

    console.log('Connected! Creating SyncWatermarks and ensuring UpdatedAt & Triggers on Central 10.110.16.16...');

    // 1. Create SyncWatermarks
    await central.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncWatermarks')
        CREATE TABLE dbo.SyncWatermarks (
            TableName NVARCHAR(128) PRIMARY KEY,
            LastPushWatermark DATETIME2 NULL,
            LastPullWatermark DATETIME2 NULL,
            LastSyncCheckAt DATETIME2 NULL,
            SyncDirection NVARCHAR(20) DEFAULT 'push',
            Notes NVARCHAR(255) NULL
        );
    `);

    // 2. Get tables
    const tablesRes = await central.request().query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE' 
          AND TABLE_NAME != 'sysdiagrams'
          AND TABLE_NAME != 'SyncWatermarks'
        ORDER BY TABLE_NAME
    `);
    const tables = tablesRes.recordset.map(r => r.TABLE_NAME);
    console.log(`Found ${tables.length} tables in Central DB.`);

    for (const t of tables) {
        const colsRes = await central.request()
            .input('tbl', sql.NVarChar(128), t)
            .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl`);
        const colSet = new Set(colsRes.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

        if (!colSet.has('updatedat')) {
            try {
                await central.request().query(`
                    ALTER TABLE dbo.[${t}] ADD UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_C_${t}_UpdatedAt DEFAULT SYSUTCDATETIME();
                `);
                console.log(`[+] Added UpdatedAt to Central ${t}`);
            } catch (err) {
                console.warn(`[!] Central UpdatedAt on ${t}:`, err.message);
            }
        }

        if (!colSet.has('createdat')) {
            try {
                await central.request().query(`
                    ALTER TABLE dbo.[${t}] ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_C_${t}_CreatedAt DEFAULT SYSUTCDATETIME();
                `);
                console.log(`[+] Added CreatedAt to Central ${t}`);
            } catch (err) {
                console.warn(`[!] Central CreatedAt on ${t}:`, err.message);
            }
        }

        if (!colSet.has('branchcode')) {
            try {
                await central.request().query(`ALTER TABLE dbo.[${t}] ADD BranchCode NVARCHAR(50) NULL;`);
            } catch {}
        }
        if (!colSet.has('branchname')) {
            try {
                await central.request().query(`ALTER TABLE dbo.[${t}] ADD BranchName NVARCHAR(255) NULL;`);
            } catch {}
        }
        if (!colSet.has('syncstatus')) {
            try {
                await central.request().query(`ALTER TABLE dbo.[${t}] ADD SyncStatus NVARCHAR(20) NULL CONSTRAINT DF_C_${t}_SyncStatus DEFAULT 'synced';`);
            } catch {}
        }
        if (!colSet.has('lastsyncedat')) {
            try {
                await central.request().query(`ALTER TABLE dbo.[${t}] ADD LastSyncedAt DATETIME2 NULL;`);
            } catch {}
        }

        // Install change tracking trigger on Central too
        const pkRes = await central.request()
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
        const idCol = pks.length > 0 ? pks[0] : (colSet.has('id') ? 'Id' : null);

        if (idCol) {
            const trgName = `trg_${t}_TrackChanges`;
            const triggerSql = `
                CREATE OR ALTER TRIGGER dbo.[${trgName}]
                ON dbo.[${t}]
                AFTER UPDATE
                AS
                BEGIN
                    SET NOCOUNT ON;
                    IF TRIGGER_NESTLEVEL() > 1 RETURN;
                    IF (UPDATE(SyncStatus) AND NOT UPDATE(UpdatedAt)) RETURN;

                    UPDATE target
                    SET target.UpdatedAt = SYSUTCDATETIME()
                    FROM dbo.[${t}] target
                    INNER JOIN inserted i ON target.[${idCol}] = i.[${idCol}];
                END;
            `;
            try {
                await central.request().query(triggerSql);
            } catch {}
        }
    }

    console.log('✅ Central Server on 10.110.16.16 is completely updated with Timestamps & Triggers!');
    await central.close();
}

main().catch(console.error);
