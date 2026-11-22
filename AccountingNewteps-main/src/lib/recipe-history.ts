import sql from 'mssql';

export interface RecipeComponentInput {
  itemId: string;
  quantity: number;
  itemName?: string;
  itemCode?: string;
  unitCostAtSnapshot?: number;
  lineCostAtSnapshot?: number;
}

export interface RecordRecipeSnapshotParams {
  itemId: string;
  itemCode?: string | null;
  itemName: string;
  components: RecipeComponentInput[];
  previousComponents?: RecipeComponentInput[] | null;
  changeNotes?: string | null;
  changedById?: string | null;
  changedByName?: string | null;
}

export async function ensureRecipeHistoryTable(pool: sql.ConnectionPool): Promise<void> {
  await pool.request().query(`
    IF OBJECT_ID('dbo.RecipeHistory', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.RecipeHistory (
        Id NVARCHAR(64) NOT NULL PRIMARY KEY,
        ItemId NVARCHAR(64) NOT NULL,
        ItemCode NVARCHAR(100) NULL,
        ItemName NVARCHAR(255) NOT NULL,
        VersionNumber INT NOT NULL DEFAULT (1),
        EffectiveFrom DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
        EffectiveTo DATETIME2 NULL,
        ComponentsJson NVARCHAR(MAX) NOT NULL,
        TotalRecipeCost DECIMAL(18,4) NOT NULL DEFAULT ((0)),
        PreviousComponentsJson NVARCHAR(MAX) NULL,
        ChangeNotes NVARCHAR(500) NULL,
        ChangedById NVARCHAR(64) NULL,
        ChangedByName NVARCHAR(255) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT (sysutcdatetime())
      );
      CREATE INDEX IX_RecipeHistory_ItemId_Version ON dbo.RecipeHistory (ItemId, VersionNumber DESC);
      CREATE INDEX IX_RecipeHistory_ItemId_Effective ON dbo.RecipeHistory (ItemId, EffectiveFrom, EffectiveTo);
    END
  `);
}

function normalizeComponentsKey(comps: RecipeComponentInput[]): string {
  return JSON.stringify(
    [...(comps || [])]
      .filter((c) => c && c.itemId)
      .map((c) => ({
        itemId: String(c.itemId),
        quantity: Number(c.quantity || 0),
      }))
      .sort((a, b) => a.itemId.localeCompare(b.itemId))
  );
}

export async function recordRecipeSnapshot(
  pool: sql.ConnectionPool,
  params: RecordRecipeSnapshotParams
): Promise<{ recorded: boolean; versionNumber?: number }> {
  const {
    itemId,
    itemCode,
    itemName,
    components,
    previousComponents,
    changeNotes,
    changedById,
    changedByName,
  } = params;

  if (!itemId || !Array.isArray(components)) {
    return { recorded: false };
  }

  await ensureRecipeHistoryTable(pool);

  const existingCountRes = await pool
    .request()
    .input('ItemId', sql.NVarChar(64), itemId)
    .query(`SELECT ISNULL(MAX(VersionNumber), 0) AS MaxVer FROM dbo.RecipeHistory WHERE ItemId = @ItemId`);

  const maxVer = Number(existingCountRes.recordset[0]?.MaxVer || 0);

  // Skip recording if components did not change and a snapshot already exists
  if (
    maxVer > 0 &&
    previousComponents &&
    normalizeComponentsKey(components) === normalizeComponentsKey(previousComponents)
  ) {
    return { recorded: false, versionNumber: maxVer };
  }

  // Enrich each component with current master item name, code, and unit cost
  const enrichedComponents: RecipeComponentInput[] = [];
  let totalRecipeCost = 0;

  for (const comp of components) {
    if (!comp?.itemId) continue;
    const qty = Number(comp.quantity || 0);
    let compName = comp.itemName || '';
    let compCode = comp.itemCode || '';
    let unitCost = Number(comp.unitCostAtSnapshot || 0);

    try {
      const compRes = await pool
        .request()
        .input('CompId', sql.NVarChar(64), String(comp.itemId))
        .query(`SELECT TOP 1 Name, Code, Cost FROM dbo.Items WHERE Id = @CompId`);
      if (compRes.recordset.length > 0) {
        const row = compRes.recordset[0];
        compName = compName || row.Name || '';
        compCode = compCode || row.Code || '';
        if (!unitCost) unitCost = Number(row.Cost || 0);
      }
    } catch {}

    const lineCost = qty * unitCost;
    totalRecipeCost += lineCost;
    enrichedComponents.push({
      itemId: String(comp.itemId),
      quantity: qty,
      itemName: compName,
      itemCode: compCode,
      unitCostAtSnapshot: unitCost,
      lineCostAtSnapshot: lineCost,
    });
  }

  // Close previous open version
  await pool
    .request()
    .input('ItemId', sql.NVarChar(64), itemId)
    .query(`
      UPDATE dbo.RecipeHistory
      SET EffectiveTo = sysutcdatetime()
      WHERE ItemId = @ItemId AND EffectiveTo IS NULL;
    `);

  const nextVersion = maxVer + 1;
  const snapshotId = `rh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const defaultNote =
    nextVersion === 1
      ? 'اعتماد المستند الأساسي للريسبي (الإصدار الأول)'
      : 'تعديل مكونات / كميات الريسبي';

  await pool
    .request()
    .input('Id', sql.NVarChar(64), snapshotId)
    .input('ItemId', sql.NVarChar(64), itemId)
    .input('ItemCode', sql.NVarChar(100), itemCode || null)
    .input('ItemName', sql.NVarChar(255), itemName || 'صنف مصنع')
    .input('VersionNumber', sql.Int, nextVersion)
    .input('ComponentsJson', sql.NVarChar(sql.MAX), JSON.stringify(enrichedComponents))
    .input('TotalRecipeCost', sql.Decimal(18, 4), totalRecipeCost)
    .input(
      'PreviousComponentsJson',
      sql.NVarChar(sql.MAX),
      previousComponents ? JSON.stringify(previousComponents) : null
    )
    .input('ChangeNotes', sql.NVarChar(500), changeNotes || defaultNote)
    .input('ChangedById', sql.NVarChar(64), changedById || null)
    .input('ChangedByName', sql.NVarChar(255), changedByName || 'النظام')
    .query(`
      INSERT INTO dbo.RecipeHistory
        (Id, ItemId, ItemCode, ItemName, VersionNumber, EffectiveFrom, EffectiveTo, ComponentsJson, TotalRecipeCost, PreviousComponentsJson, ChangeNotes, ChangedById, ChangedByName)
      VALUES
        (@Id, @ItemId, @ItemCode, @ItemName, @VersionNumber, sysutcdatetime(), NULL, @ComponentsJson, @TotalRecipeCost, @PreviousComponentsJson, @ChangeNotes, @ChangedById, @ChangedByName);
    `);

  return { recorded: true, versionNumber: nextVersion };
}
