# Deploying to Vercel

The app is a Vite SPA with serverless OAuth functions (`api/`) and an Edge
middleware access gate (`middleware.ts`). Tokens are stored in HttpOnly cookies,
so no database is required.

## 1. Import the repository

1. Go to <https://vercel.com/new> and import `merons-aspio/pm-exporter`.
2. Framework preset: **Vite** (auto-detected).
3. Build command: `npm run build` · Output directory: `dist` (already set in `vercel.json`).

## 2. Configure environment variables

Add these in **Project → Settings → Environment Variables** (Production and Preview):

| Variable | Value |
| --- | --- |
| `HUBSTAFF_CLIENT_ID` | Your Hubstaff OAuth app client ID |
| `HUBSTAFF_CLIENT_SECRET` | Your Hubstaff OAuth app client secret |
| `HUBSTAFF_REDIRECT_URI` | `https://<your-project>.vercel.app/api/auth/callback/hubstaff` |
| `APP_SECRET_PASSPHRASE` | The password for the Basic Auth gate (username: `hubstaff`) |

`VITE_HUBSTAFF_TOKEN` / `VITE_HUBSTAFF_REFRESH_TOKEN` are **optional** and only
used as a fallback. Normally the OAuth flow supplies tokens.

> Do **not** commit `.env`, `.env.local`, or `.hubstaff_session.json`. They are
> ignored by `.gitignore`.

## 3. Update the Hubstaff OAuth application

In your Hubstaff OAuth app settings, add the production redirect URI:

```
https://<your-project>.vercel.app/api/auth/callback/hubstaff
```

Keep the local one for development:

```
http://localhost:3000/api/auth/callback/hubstaff
```

## 4. Routes

| Route | Purpose |
| --- | --- |
| `/` (all pages) | Protected by Basic Auth (`APP_SECRET_PASSPHRASE`) |
| `/api/auth/hubstaff` | Redirects to Hubstaff authorization |
| `/api/auth/callback/hubstaff` | Exchanges code → tokens, sets HttpOnly cookies |
| `/api/auth/session` | Returns tokens from cookies to the frontend |
| `/api/auth/refresh` | Rotates tokens server-side (client secret stays on server) |

## 5. Local development

```bash
npm run dev
```

The Vite dev server runs the same handlers from `api/_lib.ts`, so behaviour
matches production. Open <http://localhost:3000>, authenticate with the Basic
Auth prompt (username `hubstaff`, password = `APP_SECRET_PASSPHRASE`), then click
**Log in with Hubstaff**.
