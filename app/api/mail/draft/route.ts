import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { CONNECTION_COOKIE } from '../../../../src/core/mail/http';
import { createMailDraft, getConnection, type MailDraftPayload } from '../../../../src/core/mail/server';
export const runtime = 'nodejs';

const MAX_JSON_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENT_BASE64_BYTES = 14 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BASE64_BYTES = 18 * 1024 * 1024;
const HEADER_VALUE_MAX = 998;
const SIMPLE_EMAIL = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;

function sameOrigin(origin: string | null, host: string | null) {
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function safeHeaderValue(value: string) {
  return value.length <= HEADER_VALUE_MAX && !/[\r\n\0]/.test(value);
}

export async function POST(request: Request) {
  if (process.env.MODULAR_RESUME_HR_TEST_BUILD === '1') return NextResponse.json({ error: 'Gmail Draft is disabled in the HR test build.' }, { status: 404 });
  const requestHeaders = await headers();
  const origin = requestHeaders.get('origin');
  const host = requestHeaders.get('host');
  if (!sameOrigin(origin, host)) {
    return NextResponse.json({ error: 'Origin validation failed.' }, { status: 403 });
  }

  const declaredLength = Number(requestHeaders.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    return NextResponse.json({ error: 'Request payload is too large.' }, { status: 413 });
  }

  const jar = await cookies();
  const connection = await getConnection(jar.get(CONNECTION_COOKIE)?.value);
  if (!connection) return NextResponse.json({ error: 'No mail account is connected.' }, { status: 401 });

  let payload: MailDraftPayload;
  try {
    payload = await request.json() as MailDraftPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const to = payload.to?.trim() ?? '';
  const subject = payload.subject?.trim() ?? '';
  const body = payload.body ?? '';
  if (!to || !subject || !body.trim()) {
    return NextResponse.json({ error: 'Recipient, subject, and body are required.' }, { status: 400 });
  }
  if (!SIMPLE_EMAIL.test(to) || !safeHeaderValue(to) || !safeHeaderValue(subject)) {
    return NextResponse.json({ error: 'Invalid recipient or subject.' }, { status: 400 });
  }
  const cc = payload.cc ?? [];
  if (cc.length > 20 || cc.some((item) => !SIMPLE_EMAIL.test(item.trim()) || !safeHeaderValue(item))) {
    return NextResponse.json({ error: 'Invalid CC recipient.' }, { status: 400 });
  }

  let totalAttachmentBytes = 0;
  for (const item of payload.attachments ?? []) {
    if (!item.fileName || !item.mimeType || !item.base64 || !safeHeaderValue(item.fileName) || !safeHeaderValue(item.mimeType)) {
      return NextResponse.json({ error: 'Invalid attachment payload.' }, { status: 400 });
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9.+-]*\/[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(item.mimeType)) {
      return NextResponse.json({ error: 'Invalid attachment MIME type.' }, { status: 400 });
    }
    const size = Buffer.byteLength(item.base64, 'utf8');
    if (size > MAX_ATTACHMENT_BASE64_BYTES) {
      return NextResponse.json({ error: 'Attachment is too large.' }, { status: 413 });
    }
    totalAttachmentBytes += size;
    if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BASE64_BYTES) {
      return NextResponse.json({ error: 'Total attachment size is too large.' }, { status: 413 });
    }
  }

  try {
    const result = await createMailDraft(connection, { ...payload, to, subject, cc: cc.map((item) => item.trim()) });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Mail draft creation failed.' }, { status: 500 });
  }
}
