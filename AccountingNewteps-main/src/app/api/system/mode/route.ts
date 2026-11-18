import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getLocalDbConfig } from '@/lib/db';

export const dynamic = 'force-dynamic';

function detectDbHosting(server: string, encrypt?: boolean): {
    type: 'aws' | 'azure' | 'vps' | 'local';
    label: string;
} {
    const s = (server || 'localhost').toLowerCase().trim();
    if (s.includes('.rds.amazonaws.com')) {
        return { type: 'aws', label: 'AWS RDS' };
    }
    if (s.includes('.database.windows.net')) {
        return { type: 'azure', label: 'Azure SQL' };
    }
    const isLocal =
        s === 'localhost' ||
        s === '.' ||
        s === '(local)' ||
        s.startsWith('127.') ||
        s.startsWith('192.168.') ||
        s.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(s) ||
        (!s.includes('.') && !s.includes(':'));

    if (isLocal && !encrypt) {
        return { type: 'local', label: 'Local (محلي)' };
    }
    return { type: 'vps', label: encrypt ? 'Cloud / External' : 'VPS / IP خارجي' };
}

export async function GET() {
    const localCfg = getLocalDbConfig();
    const hosting = detectDbHosting(localCfg.server, localCfg.encrypt);
    try {
        const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
        const hasBuildId = fs.existsSync(buildIdPath);
        const isProd = process.env.NODE_ENV === 'production' && hasBuildId;
        return NextResponse.json({
            success: true,
            mode: isProd ? 'production' : 'development',
            nodeEnv: process.env.NODE_ENV || 'development',
            hasBuildId,
            dbHostingType: hosting.type,
            dbHostingLabel: hosting.label,
            dbServer: `${localCfg.server}:${localCfg.port}`,
            dbName: localCfg.database,
        });
    } catch {
        return NextResponse.json({
            success: true,
            mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
            nodeEnv: process.env.NODE_ENV || 'development',
            hasBuildId: false,
            dbHostingType: hosting.type,
            dbHostingLabel: hosting.label,
            dbServer: `${localCfg.server}:${localCfg.port}`,
            dbName: localCfg.database,
        });
    }
}
