import { NextResponse } from 'next/server';
import {
  authorizationUrl,
  consumePendingOAuth,
  createPkce,
  createState,
  exchangeCode,
  oauthConfig,
  resolveAccount,
  saveConnection,
  savePendingOAuth,
  type MailProvider,
} from './server';

export const CONNECTION_COOKIE = 'mr_mail_connection';

export async function startOAuth(provider: MailProvider) {
  try {
    oauthConfig(provider);
    const state = createState();
    const pkce = createPkce();
    await savePendingOAuth({ provider, state, codeVerifier: pkce.codeVerifier, createdAt: Date.now() });
    return NextResponse.redirect(authorizationUrl(provider, state, pkce.codeChallenge));
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : 'OAuth configuration error.');
    return NextResponse.redirect(new URL(`/?settings=mail&mailError=${message}`, process.env.APP_BASE_URL || 'http://localhost:3000'));
  }
}

export async function finishOAuth(provider: MailProvider, request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const base = process.env.APP_BASE_URL || 'http://localhost:3000';

  if (!code || !state) {
    return NextResponse.redirect(new URL('/?settings=mail&mailError=OAuth%20callback%20is%20missing%20code%20or%20state', base));
  }

  const pending = await consumePendingOAuth(provider, state);
  if (!pending?.codeVerifier) {
    return NextResponse.redirect(new URL('/?settings=mail&mailError=OAuth%20state%20or%20PKCE%20validation%20failed', base));
  }
  const codeVerifier = pending.codeVerifier;

  try {
    const token = await exchangeCode(provider, code, codeVerifier);
    const accessToken = String(token.access_token);
    const account = await resolveAccount(provider, accessToken);
    const saved = await saveConnection({
      provider,
      account: account.account,
      displayName: account.displayName,
      accessToken,
      refreshToken: typeof token.refresh_token === 'string' ? token.refresh_token : undefined,
      expiresAt: Date.now() + Number(token.expires_in ?? 3600) * 1000,
      scope: typeof token.scope === 'string' ? token.scope : oauthConfig(provider).scope,
    });
    const response = NextResponse.redirect(new URL('/?settings=mail&mail=connected', base));
    response.cookies.set(CONNECTION_COOKIE, saved.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
    return response;
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : 'OAuth callback failed.');
    return NextResponse.redirect(new URL(`/?settings=mail&mailError=${message}`, base));
  }
}
