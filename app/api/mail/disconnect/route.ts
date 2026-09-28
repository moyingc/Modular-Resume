import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { CONNECTION_COOKIE } from '../../../../src/core/mail/http';
import { deleteConnection } from '../../../../src/core/mail/server';
export const runtime = 'nodejs';

export async function POST() {
  if (process.env.MODULAR_RESUME_HR_TEST_BUILD === '1') return NextResponse.json({ error: 'Mail connection is disabled in the HR test build.' }, { status: 404 });
  const requestHeaders = await headers();
  const origin = requestHeaders.get('origin');
  const host = requestHeaders.get('host');
  let sameOrigin = false;
  try { sameOrigin = Boolean(origin && host && new URL(origin).host === host); } catch { sameOrigin = false; }
  if (!sameOrigin) return NextResponse.json({ error: 'Origin validation failed.' }, { status: 403 });

  const jar = await cookies();
  await deleteConnection(jar.get(CONNECTION_COOKIE)?.value);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(CONNECTION_COOKIE);
  return response;
}
