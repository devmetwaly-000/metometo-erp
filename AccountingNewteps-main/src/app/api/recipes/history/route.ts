import { NextRequest, NextResponse } from 'next/server';
import sql from 'mssql';
import { getDbPool } from '@/lib/db';
import { ensureRecipeHistoryTable } from '@/lib/recipe-history';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const pool = await getDbPool();
    await ensureRecipeHistoryTable(pool);

    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get('itemId');
    const asOf = searchParams.get('asOf');

    if (itemId && asOf) {
      const asOfDate = new Date(asOf);
      const res = await pool
        .request()
        .input('ItemId', sql.NVarChar(64), itemId)
        .input('AsOf', sql.DateTime2, asOfDate)
        .query(`
          SELECT TOP 1 *
          FROM dbo.RecipeHistory
          WHERE ItemId = @ItemId
            AND EffectiveFrom <= @AsOf
            AND (EffectiveTo IS NULL OR EffectiveTo > @AsOf)
          ORDER BY VersionNumber DESC;
        `);

      const row = res.recordset[0] || null;
      return NextResponse.json({
        success: true,
        snapshot: row
          ? {
              ...row,
              components: row.ComponentsJson ? JSON.parse(row.ComponentsJson) : [],
              previousComponents: row.PreviousComponentsJson
                ? JSON.parse(row.PreviousComponentsJson)
                : null,
            }
          : null,
      });
    }

    const request = pool.request();
    let query = `
      SELECT TOP 500 *
      FROM dbo.RecipeHistory
    `;
    if (itemId) {
      request.input('ItemId', sql.NVarChar(64), itemId);
      query += ` WHERE ItemId = @ItemId`;
    }
    query += ` ORDER BY CreatedAt DESC, VersionNumber DESC;`;

    const res = await request.query(query);
    const history = (res.recordset || []).map((row: any) => ({
      id: row.Id,
      itemId: row.ItemId,
      itemCode: row.ItemCode,
      itemName: row.ItemName,
      versionNumber: row.VersionNumber,
      effectiveFrom: row.EffectiveFrom,
      effectiveTo: row.EffectiveTo,
      components: row.ComponentsJson ? JSON.parse(row.ComponentsJson) : [],
      totalRecipeCost: Number(row.TotalRecipeCost || 0),
      previousComponents: row.PreviousComponentsJson
        ? JSON.parse(row.PreviousComponentsJson)
        : null,
      changeNotes: row.ChangeNotes,
      changedById: row.ChangedById,
      changedByName: row.ChangedByName,
      createdAt: row.CreatedAt,
    }));

    return NextResponse.json({ success: true, history });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || 'فشل تحميل السجل التاريخي للريسبي' },
      { status: 500 }
    );
  }
}
