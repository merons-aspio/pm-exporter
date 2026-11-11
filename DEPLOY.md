# Deploying to Vercel

The app is a Vite SPA that serves a frozen, read-only archive from
`public/archive/`. At runtime it makes no Hubstaff or OAuth requests. The Edge
middleware access gate (`middleware.ts`) still protects the site with Basic Auth.

## 1. Import the repository

1. Go to <https://vercel.com/new> and import `merons-aspio/pm-exporter`.
2. Framework preset: **Vite** (auto-detected).
3. Build command: `npm run build` · Output directory: `dist` (already set in `vercel.json`).

The archive JSON is committed under `public/archive/`; Vite copies it into
`dist/archive/` during the build.

## 2. Configure environment variables

The only required runtime variable is the Basic Auth passphrase:

| Variable | Value |
| --- | --- |
| `APP_SECRET_PASSPHRASE` | The password for the Basic Auth gate (username: `hubstaff`) |

`HUBSTAFF_CLIENT_ID` / `HUBSTAFF_CLIENT_SECRET` are only used locally by the
one-time `scripts/export-hubstaff-archive.mjs` exporter. The deployed app does
not need them.

> Do **not** commit `.env`, `.env.local`, or `.hubstaff_session.json`. They are
> ignored by `.gitignore`.

## 3. Routes

| Route | Purpose |
| --- | --- |
| `/` (all pages) | Protected by Basic Auth (`APP_SECRET_PASSPHRASE`) |
| `/#/dashboard` | Frozen Marketplace dashboard |
| `/#/tasks` | Frozen Marketplace task matrix |
| `/#/archive` | Lifetime read-only archive |
| `/archive/*` | Static archive JSON (excluded from the SPA rewrite) |
| `/api/auth/*` | Dormant OAuth handlers; not used by the archive UI |

## 4. Updating the archive

Re-run the exporter locally, then commit the changed files in
`public/archive/` and redeploy:

```bash
npm run archive:core
npm run archive:deep
npm run build
```

The deep pass is resumable and can be re-run safely. Projects the token cannot
read are listed as inaccessible in `public/archive/manifest.json`.

## 5. Local development

```bash
npm run dev
```

The Vite dev server serves `public/archive` directly. Open
<http://localhost:5173>, authenticate with the Basic Auth prompt (username
`hubstaff`, password = `APP_SECRET_PASSPHRASE`). No Hubstaff login is required.
