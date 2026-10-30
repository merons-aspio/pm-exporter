import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const AUTH_BASE = 'https://account.hubstaff.com';

export type ApiReq = IncomingMessage & { url?: string };
export type ApiRes = ServerResponse;

const ACCESS_COOKIE = 'hs_access';
const REFRESH_COOKIE = 'hs_refresh';
const PASS_COOKIE = 'session_pass';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function env(key: string, fallback = ''): string {
  return process.env[key] || fallback;
}

function isSecure(): boolean {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
}

function parseCookies(req: ApiReq): Record<string, string> {
  const header = req.headers?.cookie || '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function buildCookie(name: string, value: string, maxAge = COOKIE_MAX_AGE): string {
  const secure = isSecure() ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function buildRedirectUri(req: ApiReq): string {
  const configured = env('HUBSTAFF_REDIRECT_URI');
  if (configured) return configured;
  const host = req.headers?.host || 'localhost:3000';
  const proto = isSecure() ? 'https' : 'http';
  return `${proto}://${host}/api/auth/callback/hubstaff`;
}

function basicCredentials(): string {
  return Buffer.from(`${env('HUBSTAFF_CLIENT_ID')}:${env('HUBSTAFF_CLIENT_SECRET')}`).toString('base64');
}

function redirect(res: ApiRes, location: string, cookies: string[] = [], status = 302) {
  res.statusCode = status;
  res.setHeader('Location', location);
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end();
}

function sendJson(res: ApiRes, status: number, body: unknown, cookies: string[] = []) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end(JSON.stringify(body));
}

async function tokenRequest(body: URLSearchParams): Promise<{ access_token: string; refresh_token?: string }> {
  const response = await fetch(`${AUTH_BASE}/access_tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicCredentials()}`,
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Hubstaff token request failed ${response.status}: ${text}`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Hubstaff token response was not valid JSON');
  }

  if (!data.access_token) {
    throw new Error('Hubstaff token response did not include an access token');
  }

  return data;
}

function tokenCookies(accessToken: string, refreshToken: string): string[] {
  const cookies = [buildCookie(ACCESS_COOKIE, accessToken)];
  if (refreshToken) cookies.push(buildCookie(REFRESH_COOKIE, refreshToken));
  return cookies;
}

/** GET /api/auth/hubstaff — redirect the browser to Hubstaff's authorization page. */
export async function initiateHandler(req: ApiReq, res: ApiRes): Promise<void> {
  const clientId = env('HUBSTAFF_CLIENT_ID');
  if (!clientId) {
    res.statusCode = 500;
    res.end('Missing HUBSTAFF_CLIENT_ID configuration');
    return;
  }

  const redirectUri = buildRedirectUri(req);
  const scope = 'openid profile email hubstaff:read hubstaff:write tasks:read tasks:write';
  const nonce = randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope,
    nonce,
  });

  redirect(res, `${AUTH_BASE}/authorizations/new?${params.toString()}`);
}

/** GET /api/auth/callback/hubstaff — exchange the authorization code for tokens and store them. */
export async function callbackHandler(req: ApiReq, res: ApiRes): Promise<void> {
  try {
    const host = req.headers?.host || 'localhost:3000';
    const url = new URL(req.url || '/', `http://${host}`);

    const error = url.searchParams.get('error');
    if (error) {
      res.statusCode = 400;
      res.end(`OAuth error: ${error}`);
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) {
      res.statusCode = 400;
      res.end('Missing authorization code');
      return;
    }

    const data = await tokenRequest(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: buildRedirectUri(req),
      })
    );

    const cookies = tokenCookies(data.access_token, data.refresh_token || '');
    const passphrase = env('APP_SECRET_PASSPHRASE');
    if (passphrase) cookies.push(buildCookie(PASS_COOKIE, passphrase));

    redirect(res, '/#/tasks', cookies);
  } catch (error: any) {
    console.error('OAuth callback error:', error?.message || error);
    res.statusCode = 500;
    res.end('OAuth callback failed');
  }
}

/** GET /api/auth/session — return the tokens held in the HttpOnly session cookies. */
export async function sessionHandler(req: ApiReq, res: ApiRes): Promise<void> {
  const cookies = parseCookies(req);
  const accessToken = cookies[ACCESS_COOKIE] || env('VITE_HUBSTAFF_TOKEN');
  const refreshToken = cookies[REFRESH_COOKIE] || env('VITE_HUBSTAFF_REFRESH_TOKEN');

  sendJson(res, 200, {
    access_token: accessToken || '',
    refresh_token: refreshToken || '',
  });
}

/** POST /api/auth/refresh — rotate tokens server-side so the client secret never reaches the browser. */
export async function refreshHandler(req: ApiReq, res: ApiRes): Promise<void> {
  try {
    const cookies = parseCookies(req);
    const refreshToken = cookies[REFRESH_COOKIE] || env('VITE_HUBSTAFF_REFRESH_TOKEN');

    if (!refreshToken) {
      sendJson(res, 401, { error: 'missing_refresh_token' });
      return;
    }

    const data = await tokenRequest(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })
    );

    const rotatedRefresh = data.refresh_token || refreshToken;
    sendJson(
      res,
      200,
      { access_token: data.access_token, refresh_token: rotatedRefresh },
      tokenCookies(data.access_token, rotatedRefresh)
    );
  } catch (error: any) {
    console.error('OAuth refresh error:', error?.message || error);
    sendJson(res, 401, { error: 'refresh_failed' });
  }
}
