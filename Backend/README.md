# Backend — API Monitoring & Alert System

Express + TypeScript + Prisma (SQLite) API that ingests API observations, detects
anomalies with deterministic rules, explains new alerts with Gemini (deterministic
fallback), and serves the alert CRUD endpoints consumed by the React dashboard.

See the [root README](../README.md) for the full API reference and setup.

## Setup

```bash
npm install
cp .env.example .env        # then set GEMINI_API_KEY (optional)
npx prisma migrate deploy   # create SQLite db from committed migrations
npm run dev                 # http://localhost:4000
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with reload (`tsx watch`) |
| `npm start` | Run from source (`tsx src/server.ts`) |
| `npm run typecheck` | Type-check only (`tsc --noEmit`) — preferred |
| `npm run build` | Compile with `tsc` (see note below) |
| `npm test` | Vitest unit + integration suites |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint on `src`, `tests`, `scripts` |
| `npm run lint:fix` | ESLint with autofix |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check |
| `npx prisma migrate deploy` | Apply migrations |
| `npx prisma migrate dev` | Create a new migration |
| `npx prisma studio` | Browse the database |
| `npm run generate:prompts-doc` | Regenerate `../AI_Prompts.docx` |

## Endpoints

- `GET /health` — liveness probe.
- `POST /monitor` — single observation or `{ observations: [...] }` batch. Rate
  limited by `MONITOR_RATE_LIMIT_MAX`. Returns per-observation results plus a
  summary.
- `GET /alerts` — list with `status`, `severity`, `apiName`, `limit`, `offset`.
- `GET /alerts/:id` — full alert (`{ status, alert }`).
- `PATCH /alerts/:id/resolve` — resolve, idempotent (`{ status, alert }`).

Errors are structured: `{ status: "error", message, details? }` with appropriate
HTTP codes (400 validation, 404 not found, 413 oversized body, 429 rate limited,
500 internal without stack leak).

## Architecture

```
routes → controllers → services → Prisma / rules / AI
                              ↑
                       validators (Zod)
```

- **`src/monitoring/rules.ts`** — pure functions. Assign severity from latency
  thresholds and HTTP status; compute a SHA-256 fingerprint for dedup. The rules
  do not change based on AI output.
- **`src/services/monitor.ts`** — the pipeline: evaluate → fingerprint pre-check →
  AI explain (new alerts only, capped) → persist.
- **`src/services/alerts.ts`** — persistence: `recordAlert` (dedup/occurrence
  counting), `listAlerts`, `getAlertById`, `resolveAlert`, DTO mapping.
- **`src/services/ai.ts`** — Gemini explainer with JSON schema, cascade fallback to
  a deterministic explainer, `mapWithConcurrency` helper.
- **`src/app.ts`** — Express app without `listen`, so Supertest can import it.
  `src/server.ts` only binds the port.

## Configuration

All env vars are validated with Zod at startup (`src/config/index.ts`); invalid
values fail fast with a clear message. See `.env.example` for the full list.

Notable rules:

- `THRESHOLD_CRITICAL_MS` must be greater than `THRESHOLD_WARNING_MS`.
- `CORS_ORIGIN` is comma-separated.
- `EMPTY_RESULT_ALLOWED_APIS` is comma-separated.
- With no `GEMINI_API_KEY`, the fallback explainer is used and AI quota is never
  touched.

## Testing

`npm test` runs 99 Vitest tests:

- Unit: rules, config, validators, AI (stubbed Gemini client — no quota used).
- Integration: Supertest against a **fresh temporary SQLite database** per run
  (created via `prisma migrate deploy`), with Gemini disabled and rate limits
  raised. The real `dev.db` is never touched.

## Notes

- `tsconfig.json` currently has `outDir`/`rootDir` commented out, so
  `npm run build` emits `.js` files next to their `.ts` sources. Prefer
  `npm run typecheck` for verification; the server is run from source via `tsx`,
  so compiled output is not needed to run the app.
- The database starts empty — populate it via `POST /monitor` (there is no seed
  script).
- Gemini is the only wired AI provider. OpenAI config fields are intentionally
  retained but inactive per the assignment.
- `GEMINI_API_KEY` is redacted from logs via Pino redact paths.
- Formatting was applied across `src`/`tests`/`scripts` (line wrapping +
  trailing commas only — no logic changes; verified by diffing Prettier output
  of the original files against the current ones, with all 99 tests passing).
