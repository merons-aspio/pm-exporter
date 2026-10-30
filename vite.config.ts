import { defineConfig } from 'vite';
import fs from 'node:fs';
import {
  initiateHandler,
  callbackHandler,
  sessionHandler,
  refreshHandler,
} from './api/_lib.ts';

/**
 * Load .env / .env.local into process.env so the API handlers used by the dev
 * server can read the same variables Vercel provides at runtime.
 */
function loadEnvFiles() {
  for (const file of ['.env', '.env.local']) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) continue;
        const [, key, rawValue] = match;
        process.env[key] = rawValue.trim();
      }
    } catch {
      /* file may not exist */
    }
  }
}

loadEnvFiles();

function createBasicAuthMiddleware() {
  const passphrase = process.env.APP_SECRET_PASSPHRASE || '';
  const basicExpected = passphrase
    ? 'Basic ' + Buffer.from(`hubstaff:${passphrase}`).toString('base64')
    : '';
  const basicExpectedNoUser = passphrase
    ? 'Basic ' + Buffer.from(`:${passphrase}`).toString('base64')
    : '';

  return (req: any, res: any, next: any) => {
    const url = req.url || '';
    // OAuth handshake routes must bypass the gate (Hubstaff redirects cannot send Basic auth).
    if (url.startsWith('/api/auth/')) return next();

    const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
    const cookieHeader = req.headers?.cookie || req.headers?.Cookie || '';
    let cookiePass: string | null = null;
    const match = cookieHeader.match(/session_pass=([^;]+)/);
    if (match) cookiePass = decodeURIComponent(match[1]);

    const isBasicValid =
      Boolean(basicExpected) && (authHeader === basicExpected || authHeader === basicExpectedNoUser);
    const isCookieValid = Boolean(passphrase) && cookiePass === passphrase;

    if (isBasicValid || isCookieValid) return next();

    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
    res.end('401 Unauthorized');
  };
}

export default defineConfig({
  server: { port: 3000 },
  plugins: [
    {
      name: 'hubstaff-dev-api',
      configureServer({ middlewares }) {
        middlewares.use(createBasicAuthMiddleware());

        middlewares.use((req: any, res: any, next: any) => {
          const path = (req.url || '').split('?')[0];

          switch (path) {
            case '/api/auth/hubstaff':
              void initiateHandler(req, res);
              return;
            case '/api/auth/callback/hubstaff':
              void callbackHandler(req, res);
              return;
            case '/api/auth/session':
              void sessionHandler(req, res);
              return;
            case '/api/auth/refresh':
              void refreshHandler(req, res);
              return;
            default:
              next();
          }
        });
      },
    },
  ],
});
