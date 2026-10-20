# Frontend — API Monitoring Dashboard

React + TypeScript + Vite dashboard for the Intelligent API Monitoring & Alert
System. See the [root README](../README.md) for the backend and full API reference.

## Setup

```bash
npm install
cp .env.example .env     # VITE_API_BASE_URL=http://localhost:4000
npm run dev              # http://localhost:5173
```

The backend must be running (default `http://localhost:4000`). The header chip
polls `/health` every 30 s and shows online/offline status.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check + production build (`tsc -b && vite build`) |
| `npm run lint` | ESLint |
| `npm run preview` | Preview the production build |

## Environment

`VITE_API_BASE_URL` — backend base URL (default `http://localhost:4000`).
Vite only exposes variables prefixed with `VITE_` to the client.

## Features

- **Dashboard** (`pages/DashboardPage.tsx`) — summary cards (total, active,
  critical active, resolved), Refresh with spinner, last-updated time, and
  state switching between loading / error / empty / list.
- **Alert list** (`components/AlertList.tsx`) — responsive: stacked cards on
  mobile, a table on `md:` and up. Columns: severity, API name + title, status,
  response time, record count, occurrences, timestamp. Rows are clickable.
- **Alert detail** (`pages/AlertDetail.tsx`) — analysis (likely cause, severity
  rationale, anomaly types, occurrences, timestamps), suggested actions,
  per-finding evidence cards, observation fields, and a **Resolve** button that
  calls `PATCH /alerts/:id/resolve`.
- **Severity badges** — CRITICAL (red) / WARNING (amber) with dot + label.
- **States** — `LoadingState`, `EmptyState`, `ErrorState` (with retry).

## Architecture notes

- **No router.** `App` holds `selectedAlertId`; selecting a row renders the
  detail view, and going back remounts the dashboard (which refetches).
- **`api/client.ts`** — a thin `fetch` wrapper with a 15 s timeout via
  `AbortController`, an `ApiError` type carrying status + message + details, and
  `fetchAlerts` / `fetchAlert` / `resolveAlert` / `checkHealth`. Detail and
  resolve unwrap the backend's `{ status: "ok", alert }` envelope.
- **`hooks/useAlerts.ts`** — fetch-on-mount hook. Loading state is *derived*
  from `started`/`error` rather than set inside the effect, which satisfies the
  `react-hooks/set-state-in-effect` rule.
- **`types/alert.ts`** — domain types mirroring the backend `AlertDto`.

## Stack

React 19 · Vite · TypeScript · Tailwind CSS v4 · lucide-react.
