import { NextResponse } from 'next/server';
import { finishOAuth } from '../../../../../../src/core/mail/http';
export const runtime = 'nodejs';
export function GET(request: Request) { if (process.env.MODULAR_RESUME_HR_TEST_BUILD === '1') return NextResponse.json({ error: 'Gmail OAuth is disabled in the HR test build.' }, { status: 404 }); return finishOAuth('google', request); }
