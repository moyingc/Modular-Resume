import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type MailProvider = 'google';

// Google Desktop OAuth development credentials are loaded from the downloaded
// Google Auth Platform JSON file. The file itself is local-only and is blocked
// from release packages. PKCE remains enabled for every authorization request.
type GoogleDesktopOAuthFile = {
  installed?: {
    client_id?: string;
    client_secret?: string;
    auth_uri?: string;
    token_uri?: string;
    redirect_uris?: string[];
  };
};

const GOOGLE_OAUTH_CONFIG_PATH = process.env.GOOGLE_OAUTH_CONFIG_PATH
  ? path.resolve(process.env.GOOGLE_OAUTH_CONFIG_PATH)
  : path.join(process.cwd(), 'google-oauth-client.json');

function readGoogleDesktopOAuthFile(): GoogleDesktopOAuthFile['installed'] | null {
  try {
    const raw = fsSync.readFileSync(GOOGLE_OAUTH_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as GoogleDesktopOAuthFile;
    if (!parsed.installed?.client_id) return null;
    return parsed.installed;
  } catch {
    return null;
  }
}

function googleDesktopCredentials() {
  const file = readGoogleDesktopOAuthFile();
  const clientId = file?.client_id || process.env.GOOGLE_DESKTOP_CLIENT_ID || '';
  const clientSecret = file?.client_secret || process.env.GOOGLE_DESKTOP_CLIENT_SECRET || '';
  return { clientId, clientSecret, file };
}

export interface StoredMailConnection {
  id: string;
  provider: MailProvider;
  account: string;
  displayName?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
  createdAt: string;
  updatedAt: string;
}

export interface MailAttachmentPayload {
  fileName: string;
  mimeType: string;
  base64: string;
}

export interface MailDraftPayload {
  to: string;
  cc?: string[];
  subject: string;
  body: string;
  attachments?: MailAttachmentPayload[];
}

/**
 * Local-user credential boundary.
 *
 * OAuth tokens must never live inside the source tree / installation payload.
 * Each OS user gets an isolated runtime directory under their own home folder.
 * Tests/development may override the location with MODULAR_RESUME_DATA_DIR.
 */
const STORE_DIR = process.env.MODULAR_RESUME_DATA_DIR
  ? path.resolve(process.env.MODULAR_RESUME_DATA_DIR)
  : path.join(os.homedir(), '.modular-resume', 'runtime');
const STORE_PATH = path.join(STORE_DIR, 'mail-connections.json');
const PENDING_OAUTH_PATH = path.join(STORE_DIR, 'pending-oauth.json');
const ACTIVE_CONNECTION_PATH = path.join(STORE_DIR, 'active-mail-connection.json');

interface PendingOAuth {
  provider: MailProvider;
  state: string;
  codeVerifier?: string;
  createdAt: number;
}

export function mailRuntimeStorePath() {
  return STORE_PATH;
}



export function mailProviderConfigured(_provider: MailProvider) {
  void _provider;
  return Boolean(googleDesktopCredentials().clientId);
}

export function oauthConfig(_provider: MailProvider) {
  void _provider;
  const credentials = googleDesktopCredentials();
  if (!credentials.clientId) {
    throw new Error('Missing Google Desktop OAuth config. Place google-oauth-client.json in the project root.');
  }
  return {
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret || undefined,
    authorizeUrl: credentials.file?.auth_uri || 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: credentials.file?.token_uri || 'https://oauth2.googleapis.com/token',
    redirectUri: 'http://127.0.0.1:3000/api/mail/oauth/google/callback',
    scope: 'openid email https://www.googleapis.com/auth/gmail.compose',
  };
}

async function readStore(): Promise<Record<string, StoredMailConnection>> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    return JSON.parse(raw) as Record<string, StoredMailConnection>;
  } catch {
    return {};
  }
}

async function writeStore(store: Record<string, StoredMailConnection>) {
  await fs.mkdir(STORE_DIR, { recursive: true, mode: 0o700 });
  await fs.chmod(STORE_DIR, 0o700).catch(() => undefined);
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
  await fs.chmod(STORE_PATH, 0o600).catch(() => undefined);
}

async function readPendingOAuth(): Promise<Record<string, PendingOAuth>> {
  try {
    const raw = await fs.readFile(PENDING_OAUTH_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, PendingOAuth>;
    const cutoff = Date.now() - 10 * 60 * 1000;
    return Object.fromEntries(Object.entries(parsed).filter(([, item]) => item.createdAt >= cutoff));
  } catch {
    return {};
  }
}

async function writePendingOAuth(store: Record<string, PendingOAuth>) {
  await fs.mkdir(STORE_DIR, { recursive: true, mode: 0o700 });
  await fs.chmod(STORE_DIR, 0o700).catch(() => undefined);
  await fs.writeFile(PENDING_OAUTH_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
  await fs.chmod(PENDING_OAUTH_PATH, 0o600).catch(() => undefined);
}

export async function savePendingOAuth(item: PendingOAuth) {
  const store = await readPendingOAuth();
  store[item.state] = item;
  await writePendingOAuth(store);
}

export async function consumePendingOAuth(provider: MailProvider, state: string) {
  const store = await readPendingOAuth();
  const item = store[state];
  if (!item || item.provider !== provider) return null;
  delete store[state];
  await writePendingOAuth(store);
  return item;
}

export function createPkce() {
  const codeVerifier = crypto.randomBytes(64).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

async function writeActiveConnectionId(id: string | null) {
  await fs.mkdir(STORE_DIR, { recursive: true, mode: 0o700 });
  await fs.chmod(STORE_DIR, 0o700).catch(() => undefined);
  if (!id) {
    await fs.unlink(ACTIVE_CONNECTION_PATH).catch(() => undefined);
    return;
  }
  await fs.writeFile(ACTIVE_CONNECTION_PATH, JSON.stringify({ id }, null, 2), { mode: 0o600 });
  await fs.chmod(ACTIVE_CONNECTION_PATH, 0o600).catch(() => undefined);
}

async function readActiveConnectionId() {
  try {
    const raw = await fs.readFile(ACTIVE_CONNECTION_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed.id || null;
  } catch {
    return null;
  }
}

export async function saveConnection(connection: Omit<StoredMailConnection, 'id' | 'createdAt' | 'updatedAt'>) {
  const store = await readStore();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const saved: StoredMailConnection = { ...connection, id, createdAt: now, updatedAt: now };
  store[id] = saved;
  await writeStore(store);
  await writeActiveConnectionId(saved.id);
  return saved;
}

export async function getConnection(id?: string | null) {
  const store = await readStore();
  const resolvedId = id || await readActiveConnectionId();
  if (!resolvedId) return null;
  return store[resolvedId] ?? null;
}

export async function updateConnection(connection: StoredMailConnection) {
  const store = await readStore();
  store[connection.id] = { ...connection, updatedAt: new Date().toISOString() };
  await writeStore(store);
  return store[connection.id];
}

export async function deleteConnection(id?: string | null) {
  const activeId = await readActiveConnectionId();
  const resolvedId = id || activeId;
  if (!resolvedId) return;
  const store = await readStore();
  if (store[resolvedId]) {
    delete store[resolvedId];
    await writeStore(store);
  }
  if (activeId === resolvedId) await writeActiveConnectionId(null);
}

export function createState() {
  return crypto.randomBytes(24).toString('base64url');
}

export function authorizationUrl(provider: MailProvider, state: string, codeChallenge?: string) {
  const config = oauthConfig(provider);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scope,
    state,
  });
  if (!codeChallenge) throw new Error('Missing PKCE code challenge for Google Desktop OAuth.');
  params.set('code_challenge', codeChallenge);
  params.set('code_challenge_method', 'S256');
  params.set('access_type', 'offline');
  params.set('prompt', 'consent');
  return `${config.authorizeUrl}?${params.toString()}`;
}

async function tokenRequest(provider: MailProvider, body: URLSearchParams) {
  const config = oauthConfig(provider);
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const json = await response.json() as Record<string, unknown>;
  if (!response.ok || typeof json.access_token !== 'string') {
    throw new Error(`OAuth token exchange failed: ${String(json.error_description ?? json.error ?? response.status)}`);
  }
  return json;
}

export async function exchangeCode(provider: MailProvider, code: string, codeVerifier?: string) {
  const config = oauthConfig(provider);
  const body = new URLSearchParams({
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });
  if (!codeVerifier) throw new Error('Missing PKCE code verifier for Google Desktop OAuth.');
  body.set('code_verifier', codeVerifier);
  if (config.clientSecret) body.set('client_secret', config.clientSecret);
  return tokenRequest(provider, body);
}

async function refreshAccessToken(connection: StoredMailConnection) {
  if (!connection.refreshToken) throw new Error('Mail connection expired and no refresh token is available. Reconnect the account.');
  const config = oauthConfig(connection.provider);
  const body = new URLSearchParams({
    client_id: config.clientId,
    refresh_token: connection.refreshToken,
    grant_type: 'refresh_token',
  });
  if (config.clientSecret) body.set('client_secret', config.clientSecret);
  const token = await tokenRequest(connection.provider, body);
  const accessToken = String(token.access_token);
  const expiresIn = Number(token.expires_in ?? 3600);
  return updateConnection({
    ...connection,
    accessToken,
    refreshToken: typeof token.refresh_token === 'string' ? token.refresh_token : connection.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: typeof token.scope === 'string' ? token.scope : connection.scope,
  });
}

export async function ensureAccessToken(connection: StoredMailConnection) {
  if (connection.expiresAt > Date.now() + 60_000) return connection;
  return refreshAccessToken(connection);
}

export async function resolveAccount(_provider: MailProvider, accessToken: string) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const json = await response.json() as { email?: string; name?: string };
  if (!response.ok || !json.email) throw new Error('Could not read the connected Google account.');
  return { account: json.email, displayName: json.name };
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join('\r\n') ?? value;
}

function stripHeaderControls(value: string) {
  return value.replace(/[\r\n\0]/g, ' ').trim();
}

function rfc822(payload: MailDraftPayload, from: string) {
  const safeFrom = stripHeaderControls(from);
  const safeTo = stripHeaderControls(payload.to);
  const safeCc = (payload.cc ?? []).map(stripHeaderControls);
  const safeSubject = stripHeaderControls(payload.subject);

  const attachments = payload.attachments ?? [];
  if (!attachments.length) {
    return [
      `From: ${safeFrom}`,
      `To: ${safeTo}`,
      ...(safeCc.length ? [`Cc: ${safeCc.join(', ')}`] : []),
      `Subject: ${safeSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      payload.body,
    ].join('\r\n');
  }

  const boundary = `mr-${crypto.randomBytes(12).toString('hex')}`;
  const parts = [
    `From: ${safeFrom}`,
    `To: ${safeTo}`,
    ...(safeCc.length ? [`Cc: ${safeCc.join(', ')}`] : []),
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    payload.body,
  ];
  for (const attachment of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}; name="${stripHeaderControls(attachment.fileName).replace(/"/g, '')}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${stripHeaderControls(attachment.fileName).replace(/"/g, '')}"`,
      '',
      wrapBase64(attachment.base64),
    );
  }
  parts.push(`--${boundary}--`, '');
  return parts.join('\r\n');
}

export async function createMailDraft(connection: StoredMailConnection, payload: MailDraftPayload) {
  const active = await ensureAccessToken(connection);
  const raw = Buffer.from(rfc822(payload, active.account), 'utf8').toString('base64url');
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { authorization: `Bearer ${active.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message: { raw } }),
  });
  const json = await response.json() as { id?: string; message?: { id?: string }; error?: { message?: string } };
  if (!response.ok || !json.id) throw new Error(json.error?.message || `Gmail draft creation failed (${response.status}).`);
  return {
    draftId: json.id,
    webUrl: 'https://mail.google.com/mail/u/0/#drafts',
  };
}
