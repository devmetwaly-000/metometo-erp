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

async function setupDatabase(pool, dbName) {
    console.log(`\n======================================================`);
    console.log(`🚀 Setting up Timestamp & Change-Tracking for [${dbName}]`);
    console.log(`======================================================`);

    // 1. Create SyncWatermarks table
    await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncWatermarks')
        BEGIN
            CREATE TABLE dbo.SyncWatermarks (
                TableName NVARCHAR(128) PRIMARY KEY,
                LastPushWatermark DATETIME2 NULL,
                LastPullWatermark DATETIME2 NULL,
                LastSyncCheckAt DATETIME2 NULL,
                SyncDirection NVARCHAR(20) DEFAULT 'push',
                Notes NVARCHAR(255) NULL
            );
            PRINT 'Created dbo.SyncWatermarks table.';
        END;
    `);

    // 2. Get all base tables
    const tablesRes = await pool.request().query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE' 
          AND TABLE_NAME != 'sysdiagrams'
          AND TABLE_NAME != 'SyncWatermarks'
        ORDER BY TABLE_NAME
    `);
    const tables = tablesRes.recordset.map(r => r.TABLE_NAME);
    console.log(`Found ${tables.length} tables in [${dbName}].`);

    // 3. Ensure columns: UpdatedAt, CreatedAt, SyncStatus, LastSyncedAt, BranchCode, BranchName
    for (const t of tables) {
        const colsRes = await pool.request()
            .input('tbl', sql.NVarChar(128), t)
            .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl`);
        const colSet = new Set(colsRes.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

        // Add UpdatedAt
        if (!colSet.has('updatedat')) {
            try {
                await pool.request().query(`
                    ALTER TABLE dbo.[${t}] ADD UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_${t}_UpdatedAt DEFAULT SYSUTCDATETIME();
                `);
                // Initialize UpdatedAt with existing date or CreatedAt
                const hasDate = colSet.has('date');
                const hasCreatedAt = colSet.has('createdat');
                if (hasDate && hasCreatedAt) {
                    await pool.request().query(`UPDATE dbo.[${t}] SET UpdatedAt = COALESCE(CreatedAt, [Date], SYSUTCDATETIME());`);
                } else if (hasCreatedAt) {
                    await pool.request().query(`UPDATE dbo.[${t}] SET UpdatedAt = COALESCE(CreatedAt, SYSUTCDATETIME());`);
                } else if (hasDate) {
                    await pool.request().query(`UPDATE dbo.[${t}] SET UpdatedAt = COALESCE([Date], SYSUTCDATETIME());`);
                }
                console.log(`[+] Added UpdatedAt to ${t}`);
            } catch (err) {
                console.warn(`[!] UpdatedAt on ${t}:`, err.message);
            }
        }

        // Add CreatedAt
        if (!colSet.has('createdat')) {
            try {
                await pool.request().query(`
                    ALTER TABLE dbo.[${t}] ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_${t}_CreatedAt DEFAULT SYSUTCDATETIME();
                `);
                console.log(`[+] Added CreatedAt to ${t}`);
            } catch (err) {
                console.warn(`[!] CreatedAt on ${t}:`, err.message);
            }
        }

        // Add BranchCode
        if (!colSet.has('branchcode')) {
            try {
                await pool.request().query(`ALTER TABLE dbo.[${t}] ADD BranchCode NVARCHAR(50) NULL;`);
                console.log(`[+] Added BranchCode to ${t}`);
            } catch (err) {
                console.warn(`[!] BranchCode on ${t}:`, err.message);
            }
        }

        // Add BranchName
        if (!colSet.has('branchname')) {
            try {
                await pool.request().query(`ALTER TABLE dbo.[${t}] ADD BranchName NVARCHAR(255) NULL;`);
                console.log(`[+] Added BranchName to ${t}`);
            } catch (err) {
                console.warn(`[!] BranchName on ${t}:`, err.message);
            }
        }

        // Add SyncStatus
        if (!colSet.has('syncstatus')) {
            try {
                await pool.request().query(`ALTER TABLE dbo.[${t}] ADD SyncStatus NVARCHAR(20) NULL CONSTRAINT DF_${t}_SyncStatus DEFAULT 'pending';`);
                console.log(`[+] Added SyncStatus to ${t}`);
            } catch (err) {
                console.warn(`[!] SyncStatus on ${t}:`, err.message);
            }
        }

        // Add LastSyncedAt
        if (!colSet.has('lastsyncedat')) {
            try {
                await pool.request().query(`ALTER TABLE dbo.[${t}] ADD LastSyncedAt DATETIME2 NULL;`);
                console.log(`[+] Added LastSyncedAt to ${t}`);
            } catch (err) {
                console.warn(`[!] LastSyncedAt on ${t}:`, err.message);
            }
        }

        // 4. Install automated Change-Tracking Trigger on UPDATE
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
                    SET target.UpdatedAt = SYSUTCDATETIME(),
                        target.SyncStatus = 'pending'
                    FROM dbo.[${t}] target
                    INNER JOIN inserted i ON target.[${idCol}] = i.[${idCol}];
                END;
            `;
            try {
                await pool.request().query(triggerSql);
            } catch (trgErr) {
                console.warn(`[!] Trigger error on ${t}:`, trgErr.message);
            }
        }
    }
    console.log(`✅ All tables in [${dbName}] are now equipped with UpdatedAt, CreatedAt, SyncStatus, and Change-Tracking triggers!`);
}

async function main() {
    const local = new sql.ConnectionPool(localConfig);
    await local.connect();
    await setupDatabase(local, 'MultiBranchPOS_DB');
    await local.close();

    const central = new sql.ConnectionPool(centralConfig);
    await central.connect();
    await setupDatabase(central, 'MultiBranchPOS_Central_DB');
    await central.close();

    console.log('\n🎉 Finished timestamp & change tracking setup successfully!');
}

main().catch(console.error);

