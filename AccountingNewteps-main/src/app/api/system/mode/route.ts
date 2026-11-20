import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getLocalDbConfig } from '@/lib/db';
import { getCentralConfig } from '@/lib/central-sync';

export const dynamic = 'force-dynamic';

function detectDbHosting(server: string, encrypt?: boolean): {
    type: 'aws' | 'azure' | 'vps' | 'local';
    label: string;
    details: string;
} {
    const s = (server || 'localhost').toLowerCase().trim();
    if (s.includes('.rds.amazonaws.com')) {
        return { type: 'aws', label: 'AWS RDS (سحابي)', details: server };
    }
    if (s.includes('.database.windows.net')) {
        return { type: 'azure', label: 'Azure SQL (سحابي)', details: server };
    }
    const hostOnly = s.split(':')[0].split(',')[0].replace(/^tcp:/i, '').trim();
    const isLocal =
        hostOnly === 'localhost' ||
        hostOnly === '.' ||
        hostOnly === '(local)' ||
        hostOnly.startsWith('127.') ||
        (!hostOnly.includes('.') && !hostOnly.includes(':'));

    if (isLocal && !encrypt) {
        return { type: 'local', label: 'محلي (Localhost)', details: server };
    }
    return { type: 'vps', label: encrypt ? 'Cloud / خارجي' : 'سيرفر IP / شبكة', details: server };
}

export async function GET() {
    const localCfg = getLocalDbConfig();
    const branchHosting = detectDbHosting(localCfg.server, localCfg.encrypt);

    let centralHosting: { type: 'aws' | 'azure' | 'vps' | 'local'; label: string; server: string; database: string } = {
        type: 'local',
        label: 'محلي (Localhost)',
        server: 'localhost:1433',
        database: 'MultiBranchPOS_Central_DB'
    };

    try {
        const centralCfg = await getCentralConfig();
        const detected = detectDbHosting(centralCfg.centralServerIp, centralCfg.centralEncrypt);
        centralHosting = {
            type: detected.type,
            label: detected.label,
            server: `${centralCfg.centralServerIp}:${centralCfg.centralSqlPort}`,
            database: centralCfg.centralDatabase || 'MultiBranchPOS_Central_DB'
        };
    } catch {}

    const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
    const hasBuildId = fs.existsSync(buildIdPath);
    const isProd = process.env.NODE_ENV === 'production' && hasBuildId;

    return NextResponse.json({
        success: true,
        mode: isProd ? 'production' : 'development',
        nodeEnv: process.env.NODE_ENV || 'development',
        hasBuildId,
        // Branch (local pool) hosting
        branchHosting: {
            type: branchHosting.type,
            label: branchHosting.label,
            server: `${localCfg.server}:${localCfg.port}`,
            database: localCfg.database || 'MultiBranchPOS_DB',
        },
        // Central HQ hosting
        centralHosting,
        // Backward-compatibility fields
        dbHostingType: branchHosting.type,
        dbHostingLabel: branchHosting.label,
        dbServer: `${localCfg.server}:${localCfg.port}`,
        dbName: localCfg.database || 'MultiBranchPOS_DB',
    });
}
