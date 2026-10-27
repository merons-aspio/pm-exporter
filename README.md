# Hubstaff PM Exporter

## Overview

A Vite + React + TypeScript application that exports Hubstaff project management data. Features include:

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

## Features

- **Export as it is for the dashboard**: Standup export with title-only or full data options.
- **Configurable done lists** to define what counts as "done" (Pushed, Testing, Completed, etc.).
- **All-assignee standup table** for quick team scanning.
- **Copy summary** button for daily standup text.
- **Days overdue** and due date calculations.
- **Status Mapping** panel with "Set as default" button for easier configuration.
- **Status transition log** for accurate historical status changes.

## Prerequisites

- Node.js (v18+ recommended)
- npm or yarn

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env.local` file with your Hubstaff API token:
   ```
   VITE_HUBSTAFF_TOKEN=your_token_here
   ```
4. Run the development server: `npm run dev`
5. Open http://localhost:5173 in your browser

## Build

```bash
npm run build
```

The build outputs to the `dist` directory.

## Usage

- Navigate to `/tasks` for the task explorer.
- Navigate to `/dashboard` for the dashboard with the standup section.
- Use the **Export** button in the standup header or dashboard header to export data as CSV, JSON, or plain text (titles only).
- Use the **Copy summary** button to copy a Slack-ready standup summary.

## License

MIT