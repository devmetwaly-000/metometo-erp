import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
        const hasBuildId = fs.existsSync(buildIdPath);
        const isProd = process.env.NODE_ENV === 'production' && hasBuildId;
        return NextResponse.json({
            success: true,
            mode: isProd ? 'production' : 'development',
            nodeEnv: process.env.NODE_ENV || 'development',
            hasBuildId,
        });
    } catch {
        return NextResponse.json({
            success: true,
            mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
            nodeEnv: process.env.NODE_ENV || 'development',
            hasBuildId: false,
        });
    }
}
