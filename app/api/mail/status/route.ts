import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { CONNECTION_COOKIE } from '../../../../src/core/mail/http';
import { getConnection, mailProviderConfigured } from '../../../../src/core/mail/server';
export const runtime = 'nodejs';
export async function GET() {
  if (process.env.MODULAR_RESUME_HR_TEST_BUILD === '1') return NextResponse.json({ connected: false, providers: { google: false }, testBuild: true });
  const jar = await cookies();
  const connection = await getConnection(jar.get(CONNECTION_COOKIE)?.value);
  const providers = { google: mailProviderConfigured('google') };
  if (!connection) return NextResponse.json({ connected: false, providers });
  return NextResponse.json({
    connected: true,
    providers,
    provider: connection.provider,
    account: connection.account,
    displayName: connection.displayName ?? '',
  });
}
