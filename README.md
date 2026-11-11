# Hubstaff PM Exporter

## Overview

A Vite + React + TypeScript application that reads a frozen, read-only Hubstaff
archive. It no longer syncs with Hubstaff at runtime. Features include:

- **Lifetime Archive**: every task the export token could read, including deleted tasks, across all accessible projects, with project/removed filters, full task detail, and CSV/JSON/TXT export.
- **Tasks Explorer**: Filterable, sortable, paginated task list with horizontal scroll.
- **Dashboard**: 
  - KPI cards with deltas
  - Daily board status (bucket counts)
  - Today vs Yesterday comparison
  - Activity by assignee
  - Assignee × Status matrix
  - Current sprint panel
  - Needs Attention section (blocked + overdue)
  - Board list breakdown
  - Daily trend chart
  - **Daily Standup** section with:
    - Pushed/Completed/Testing breakdown (configurable)
    - Overdue in progress tasks
    - To Do tasks due today
    - Blocked tasks
    - All-assignee standup table
    - Copyable summary for Slack
    - Export options (CSV/JSON/TXT) for filtered or all rows
- **Status Mapping**: Configurable mapping between Hubstaff board lists and dashboard buckets. Saved as default for persistence.
- **Export**: Standup CSV/JSON/TXT and full dashboard export options.
- **Status transition tracking**: Logs actual list changes (not just edits) for accurate "moved on date" metrics.
- **Status mapping config** saved as default for easy reuse.
- **Static read-only archive**: all data is loaded from `public/archive`, so the deployed app makes no Hubstaff or auth requests.

## Features

- **Export as it is for the dashboard**: Standup export with title-only or full data options.
- **Configurable done lists** to define what counts as "done" (Pushed, Testing, Completed, etc.).
- **All-assignee standup table** for quick team scanning.
- **Copy summary** button for daily standup text.
- **Days overdue** and due date calculations.
- **Status Mapping** panel with "Set as default" button for easier configuration.
- **Status transition log** for accurate historical status changes.
- **Local history download/import** on the archive page so snapshots, list moves, mappings, and overrides survive clearing browser storage.

## Prerequisites

- Node.js (v18+ recommended)
- npm or yarn

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`
4. Open http://localhost:5173 in your browser

No Hubstaff token is required to view the app. `public/archive` already
contains the captured data. Tokens in `.env.local` are only needed to re-run the
one-time exporter.

## Re-running the archive export

The exporter reads OAuth credentials from `.env.local` and writes static JSON to
`public/archive/`. It never writes credentials into the archive.

```bash
npm run archive:core   # projects, lists, labels, members, all tasks (incl. removed)
npm run archive:deep   # comments, checklists, attachments, time entries
npm run archive:all    # both, core first
npm run archive:verify # check manifest totals, deep files and credential leaks
```

The deep pass is resumable: re-running skips tasks already captured. Use
`node scripts/export-hubstaff-archive.mjs --deep --project <id>` to target one
project (npm drops flags passed through `npm run`). Add `--retry-errors` to
revisit tasks whose deep capture previously failed.

The exporter throttles to ~85 requests/minute by default. Override it with
`ARCHIVE_REQUEST_INTERVAL_MS` (milliseconds between request starts) if Hubstaff
returns `429 rate_limit`; the script also honours `Retry-After` automatically.

> The Hubstaff API exposes attachment metadata only, not file contents.
> Projects the export token cannot access are recorded in `manifest.json` as
> inaccessible instead of blocking the export.

The committed archive was captured with the available token: 36 organization
projects were inventoried, 6 were readable (3,681 tasks, including 512 deleted
tasks), and 30 returned `403 not_authorized`. The inaccessible projects are
listed on the archive page and in the manifest. Re-run the exporter with an
admin/OAuth token that can read them if those projects must be captured.

## Build

```bash
npm run build
```

The build outputs to the `dist` directory. `public/archive` is copied into the
build automatically.

## Usage

- `#/dashboard` — frozen Marketplace 2.0.0 dashboard and standup view.
- `#/tasks` — frozen Marketplace 2.0.0 task matrix.
- `#/archive` — lifetime read-only archive across all accessible projects, including deleted tasks.
- Use the **Export** button in the task matrix or archive page to download CSV, JSON, or plain text.
- Use **History** / **Import history** on the archive page to back up or restore browser-local snapshots and transitions.

## License

MIT