/**
 * Vercel Edge Middleware: application access gate.
 *
 * Accepts either HTTP Basic credentials (username `hubstaff`, password =
 * APP_SECRET_PASSPHRASE) or the `session_pass` cookie set by the OAuth callback.
 * OAuth initiate/callback routes are excluded because Hubstaff's redirect cannot
 * carry the Basic Auth header.
 */

export const config = {
  matcher: [
    '/((?!api/auth/hubstaff|api/auth/callback/hubstaff|assets/|favicon\\.ico|robots\\.txt).*)',
  ],
};

function utf8ToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export default function middleware(request: Request): Response | undefined {
  const passphrase = process.env.APP_SECRET_PASSPHRASE;
  if (!passphrase) {
    // No passphrase configured -> gate is disabled (mirrors local dev behaviour).
    return undefined;
  }

  const authHeader = request.headers.get('authorization') || '';
  const expectedWithUser = `Basic ${utf8ToBase64(`hubstaff:${passphrase}`)}`;
  const expectedNoUser = `Basic ${utf8ToBase64(`:${passphrase}`)}`;

  if (safeEqual(authHeader, expectedWithUser) || safeEqual(authHeader, expectedNoUser)) {
    return undefined;
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)session_pass=([^;]+)/);
  if (match && safeEqual(decodeURIComponent(match[1]), passphrase)) {
    return undefined;
  }

  return new Response('401 Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"',
      'Cache-Control': 'no-store',
    },
  });
}
