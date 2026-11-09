import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import sql from 'mssql';

export async function POST() {
    try {
        const pool = await getDbPool();

        // Standard Supplement & Retail Hierarchy
        const SEED_DATA = [
            {
                section: { id: 'sec_supplements', code: '01', name: 'مكملات غذائية (Supplements)' },
                categories: [
                    {
                        cat: { id: 'cat_protein', code: '01-1', name: 'بروتينات ومكتسبات وزن' },
                        groups: [
                            { id: 'grp_whey', code: '01-1-1', name: 'واي بروتين (Whey Protein)' },
                            { id: 'grp_isolate', code: '01-1-2', name: 'ايزوليت بروتين (Isolate)' },
                            { id: 'grp_gainer', code: '01-1-3', name: 'ماس جينر (Mass Gainer)' },
                            { id: 'grp_casein', code: '01-1-4', name: 'كازين بروتين (Casein)' }
                        ]
                    },
                    {
                        cat: { id: 'cat_creatine', code: '01-2', name: 'كرياتين وطاقة وتمرين' },
                        groups: [
                            { id: 'grp_creatine_mono', code: '01-2-1', name: 'كرياتين مونوهايدريت (Monohydrate)' },
                            { id: 'grp_creatine_blend', code: '01-2-2', name: 'كريا باور وتركيبات متطورة' },
                            { id: 'grp_preworkout', code: '01-2-3', name: 'بري وورك اوت وبامب (Pre-Workout)' }
                        ]
                    },
                    {
                        cat: { id: 'cat_amino', code: '01-3', name: 'أحماض أمينية واستشفاء عكلي' },
                        groups: [
                            { id: 'grp_bcaa', code: '01-3-1', name: 'بي سي ايه ايه (BCAA)' },
                            { id: 'grp_eaa', code: '01-3-2', name: 'اي ايه ايه (EAA)' },
                            { id: 'grp_glutamine', code: '01-3-3', name: 'جلوتامين (Glutamine)' }
                        ]
                    },
                    {
                        cat: { id: 'cat_vitamins', code: '01-4', name: 'فيتامينات وصحة عامة' },
                        groups: [
                            { id: 'grp_multivitamin', code: '01-4-1', name: 'ملتي فيتامين يومي' },
                            { id: 'grp_omega', code: '01-4-2', name: 'اوميجا 3 وزيوت سمك' },
                            { id: 'grp_minerals', code: '01-4-3', name: 'زنك وماغنسيوم ومعادن' }
                        ]
                    },
                    {
                        cat: { id: 'cat_fatburners', code: '01-5', name: 'حوارق دهون وتخسيس' },
                        groups: [
                            { id: 'grp_carnitine', code: '01-5-1', name: 'ال-كارنتين (L-Carnitine)' },
                            { id: 'grp_cla', code: '01-5-2', name: 'سي ال ايه وحوارق خالية من المحفزات' }
                        ]
                    }
                ]
            },
            {
                section: { id: 'sec_healthy_food', code: '02', name: 'أغذية وسناكس صحية (Healthy Food)' },
                categories: [
                    {
                        cat: { id: 'cat_protein_bars', code: '02-1', name: 'بروتين بار وشوكولاتة صحية' },
                        groups: [
                            { id: 'grp_bars', code: '02-1-1', name: 'بروتين بار' },
                            { id: 'grp_spreads', code: '02-1-2', name: 'زبدة فول سوداني وسبريد' }
                        ]
                    },
                    {
                        cat: { id: 'cat_healthy_drinks', code: '02-2', name: 'مشروبات رياضية وبدائل' },
                        groups: [
                            { id: 'grp_drinks', code: '02-2-1', name: 'مشروبات طاقة وبروتين جاهز' }
                        ]
                    }
                ]
            },
            {
                section: { id: 'sec_gear', code: '03', name: 'ملابس ومستلزمات رياضية (Gear)' },
                categories: [
                    {
                        cat: { id: 'cat_accessories', code: '03-1', name: 'إكسسوارات وأدوات تمرين' },
                        groups: [
                            { id: 'grp_shakers', code: '03-1-1', name: 'شيكرات وزجاجات مياه' },
                            { id: 'grp_straps', code: '03-1-2', name: 'أحزمة وستربس ومشدات' }
                        ]
                    }
                ]
            }
        ];

        // Standard Brands for ItemSubCategories1
        const SEED_BRANDS = [
            { id: 'brd_titans', code: 'B01', name: 'اليكس تايتنز (Alex Titans)' },
            { id: 'brd_ahmed_ali', code: 'B02', name: 'أحمد علي (Ahmed Ali)' },
            { id: 'brd_unlimited', code: 'B03', name: 'انليمتد (Unlimited)' },
            { id: 'brd_dorian', code: 'B04', name: 'دوريان ياتس (Dorian Yates)' },
            { id: 'brd_muscletech', code: 'B05', name: 'ماسل تك (MuscleTech)' },
            { id: 'brd_on', code: 'B06', name: 'اوبتيموم نيوتريشن (ON)' },
            { id: 'brd_kevin', code: 'B07', name: 'كيفين ليفرون (Kevin Levrone)' },
            { id: 'brd_ronnie', code: 'B08', name: 'روني كولمان (Ronnie Coleman)' }
        ];

        let createdCount = 0;

        for (const sBlock of SEED_DATA) {
            const s = sBlock.section;
            // Check if section exists by name or code
            const existingSec = await pool.request()
                .input('Name', sql.NVarChar(255), s.name)
                .input('Code', sql.NVarChar(50), s.code)
                .query("SELECT Id FROM dbo.ItemSections WHERE Name = @Name OR Code = @Code");

            let sectionId = s.id;
            if (existingSec.recordset.length > 0) {
                sectionId = existingSec.recordset[0].Id;
            } else {
                await pool.request()
                    .input('Id', sql.NVarChar(64), s.id)
                    .input('Code', sql.NVarChar(50), s.code)
                    .input('Name', sql.NVarChar(255), s.name)
                    .query(`
                        INSERT INTO dbo.ItemSections (Id, Code, Name, SyncStatus, CreatedAt, UpdatedAt)
                        VALUES (@Id, @Code, @Name, 'pending', SYSUTCDATETIME(), SYSUTCDATETIME());
                    `);
                createdCount++;
            }

            for (const cBlock of sBlock.categories) {
                const c = cBlock.cat;
                const existingCat = await pool.request()
                    .input('Name', sql.NVarChar(255), c.name)
                    .input('SectionId', sql.NVarChar(64), sectionId)
                    .query("SELECT Id FROM dbo.ItemCategories WHERE Name = @Name AND SectionId = @SectionId");

                let categoryId = c.id;
                if (existingCat.recordset.length > 0) {
                    categoryId = existingCat.recordset[0].Id;
                } else {
                    await pool.request()
                        .input('Id', sql.NVarChar(64), c.id)
                        .input('Name', sql.NVarChar(255), c.name)
                        .input('SectionId', sql.NVarChar(64), sectionId)
                        .query(`
                            INSERT INTO dbo.ItemCategories (Id, Name, SectionId, SyncStatus, CreatedAt, UpdatedAt)
                            VALUES (@Id, @Name, @SectionId, 'pending', SYSUTCDATETIME(), SYSUTCDATETIME());
                        `);
                    createdCount++;
                }

                for (const g of cBlock.groups) {
                    const existingGrp = await pool.request()
                        .input('Name', sql.NVarChar(255), g.name)
                        .query("SELECT Id FROM dbo.ItemGroups WHERE Name = @Name");

                    if (existingGrp.recordset.length === 0) {
                        await pool.request()
                            .input('Id', sql.NVarChar(64), g.id)
                            .input('Code', sql.NVarChar(50), g.code)
                            .input('Name', sql.NVarChar(255), g.name)
                            .query(`
                                INSERT INTO dbo.ItemGroups (Id, Code, Name, SyncStatus, CreatedAt, UpdatedAt)
                                VALUES (@Id, @Code, @Name, 'pending', SYSUTCDATETIME(), SYSUTCDATETIME());
                            `);
                        createdCount++;
                    }
                }
            }
        }

        // Seed Brands
        for (const b of SEED_BRANDS) {
            const existingBrd = await pool.request()
                .input('Name', sql.NVarChar(255), b.name)
                .query("SELECT Id FROM dbo.ItemSubCategories1 WHERE Name = @Name");

            if (existingBrd.recordset.length === 0) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), b.id)
                    .input('Name', sql.NVarChar(255), b.name)
                    .query(`
                        INSERT INTO dbo.ItemSubCategories1 (Id, Name, SyncStatus, CreatedAt, UpdatedAt)
                        VALUES (@Id, @Name, 'pending', SYSUTCDATETIME(), SYSUTCDATETIME());
                    `);
                createdCount++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `تم توليد وتهيئة ${createdCount} عنصر تصنيف قياسي بنجاح.`,
            createdCount
        });
    } catch (error: any) {
        console.error('Failed to seed categories:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
