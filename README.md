# Intelligent API Monitoring & Alert System

A full-stack assignment project that ingests API observations, detects anomalies with
**deterministic rules**, enriches new alerts with **Gemini AI explanations** (with a
deterministic fallback so an alert is never lost), persists alerts, and presents them in a
responsive React dashboard where you can inspect evidence and resolve alerts.

- **Backend:** Node.js · Express · TypeScript · Prisma · SQLite · Zod · Pino
- **Frontend:** React · Vite · TypeScript · Tailwind CSS v4 · lucide-react
- **AI:** Google Gemini (`@google/genai`) — Gemini is the only wired provider

---

## Repository layout

```
.
├── Backend/          Express + Prisma API
│   ├── src/
│   │   ├── app.ts            Express app (no listen) — used by tests
│   │   ├── server.ts         Entry point (listens)
│   │   ├── config/           Validated env config (Zod)
│   │   ├── db/prisma.ts      Prisma client singleton
│   │   ├── middleware/       rate limit, CORS, logging, error handler
│   │   ├── monitoring/       deterministic rules + types
│   │   ├── services/         monitor pipeline, alerts persistence, Gemini AI
│   │   ├── controllers/      request handlers
│   │   ├── routes/           /monitor and /alerts routers
│   │   └── validators/       Zod request schemas
│   ├── prisma/               schema + SQLite migrations
│   ├── scripts/              generate-ai-prompts-doc.ts
│   └── tests/                unit + Supertest integration (99 tests)
├── Frontend/         React dashboard
│   └── src/
│       ├── api/client.ts     fetch wrapper + API calls
│       ├── types/alert.ts    domain types mirroring the backend DTO
│       ├── hooks/useAlerts.ts
│       ├── components/       list, badges, states, backend status
│       └── pages/            DashboardPage, AlertDetail
├── AI_Prompts.docx   Generated doc describing the AI prompts (see below)
└── CHECKLIST.md      Development checklist (local, gitignored)
```

---

## Quick start

### Prerequisites

- Node.js 20+ (project developed on Node 24)
- npm

### 1. Backend

```bash
cd Backend
npm install
cp .env.example .env          # then set GEMINI_API_KEY (optional — see "AI behaviour")
npx prisma migrate deploy     # creates SQLite db from migrations
npm run dev                   # starts on http://localhost:4000
```

Health check:

```bash
curl http://localhost:4000/health
# {"status":"ok","message":"API Monitoring Backend is running"}
```

### 2. Frontend

```bash
cd Frontend
npm install
cp .env.example .env          # VITE_API_BASE_URL=http://localhost:4000
npm run dev                   # starts on http://localhost:5173
```

Open <http://localhost:5173>. The header chip shows whether the backend is reachable.

---

## Anomaly detection rules (deterministic)

Severity is **always** assigned by rules. The AI only writes explanations.

| Condition                                          | Severity |
| -------------------------------------------------- | -------- |
| `response_time_ms > THRESHOLD_CRITICAL_MS` (5000)  | CRITICAL |
| `response_time_ms > THRESHOLD_WARNING_MS` (3000)   | WARNING  |
| HTTP 5xx status                                    | CRITICAL |
| HTTP 429 (rate limited)                            | WARNING  |
| Other HTTP 4xx                                     | WARNING  |
| `records_returned == 0` on a successful response   | WARNING  |

Empty-result rules are skipped for APIs listed in
`EMPTY_RESULT_ALLOWED_APIS` (default `HealthCheckAPI,StatusAPI`), which may
legitimately return zero records.

Alerts are deduplicated by a SHA-256 **fingerprint**. A repeat observation of an
ACTIVE alert increments `occurrenceCount` and refreshes its observation fields
instead of creating a duplicate; a fingerprint matching only a RESOLVED alert
creates a new ACTIVE alert (re-alert after resolve).

---

## API reference

Base URL: `http://localhost:4000`

### `GET /health`

```json
{ "status": "ok", "message": "API Monitoring Backend is running" }
```

### `POST /monitor`

Accepts a single observation or a batch (`observations` array, capped at
`MAX_BATCH_SIZE`, default 50). Rate limited by `MONITOR_RATE_LIMIT_MAX`
(default 30/min).

```bash
curl -X POST http://localhost:4000/monitor \
  -H 'Content-Type: application/json' \
  -d '{
    "api_name": "PaymentAPI",
    "status_code": 500,
    "response_time_ms": 6000,
    "records_returned": 0,
    "observed_at": "2026-10-20T12:00:00.000Z"
  }'
```

Response (abridged):

```json
{
  "status": "ok",
  "summary": { "total": 1, "anomalous": 1, "normal": 0, "alertsCreated": 1,
               "alertsUpdated": 0, "aiExplained": 0, "fallbackExplained": 1 },
  "results": [{
    "api_name": "PaymentAPI",
    "isAnomalous": true,
    "severity": "CRITICAL",
    "fingerprint": "bdea13c5…",
    "alertId": "cmvgthvol0000xpibxzfkm7fi",
    "occurrenceCount": 1,
    "alertStatus": "CREATED",
    "explanationSource": "FALLBACK"
  }]
}
```

Batch example:

```bash
curl -X POST http://localhost:4000/monitor \
  -H 'Content-Type: application/json' \
  -d '{ "observations": [
        { "api_name": "OrdersAPI",  "status_code": 200, "response_time_ms": 4500, "records_returned": 12 },
        { "api_name": "HealthAPI",  "status_code": 200, "response_time_ms": 120,  "records_returned": 0 }
      ] }'
```

### `GET /alerts`

Query params: `status` (`ACTIVE`|`RESOLVED`), `severity` (`WARNING`|`CRITICAL`),
`apiName`, `limit` (1–200), `offset`.

```bash
curl 'http://localhost:4000/alerts?status=ACTIVE&severity=CRITICAL&limit=10'
```

```json
{ "status": "ok", "total": 3, "alerts": [ { "id": "…", "apiName": "PaymentAPI", "severity": "CRITICAL", "evidence": [ … ] } ] }
```

### `GET /alerts/:id`

Returns the full alert including decoded evidence and suggested actions.

```bash
curl http://localhost:4000/alerts/<alertId>
```

```json
{ "status": "ok", "alert": { "id": "…", "likelyCause": "…", "suggestedActions": [ … ], "source": "FALLBACK" } }
```

Returns `404` with `{ "status": "error", "message": "Alert not found" }` when the id
does not exist.

### `PATCH /alerts/:id/resolve`

Marks an alert RESOLVED and sets `resolvedAt`. Idempotent — repeating the call keeps
the original `resolvedAt`.

```bash
curl -X PATCH http://localhost:4000/alerts/<alertId>/resolve
```

```json
{ "status": "ok", "alert": { "id": "…", "status": "RESOLVED", "resolvedAt": "2026-10-20T12:05:00.000Z" } }
```

---

## AI behaviour (Gemini)

1. Deterministic rules run first and assign severity.
2. For **brand-new** alerts only, Gemini generates the explanation
   (title, summary, likely cause, suggested actions, severity rationale).
3. Repeated observations of the same fingerprint consume **no** AI budget
   (`AI_MAX_CALLS_PER_BATCH`, default 10, with `AI_MAX_CONCURRENT`, default 2).
4. If `GEMINI_API_KEY` is unset, the call fails, times out (`AI_TIMEOUT_MS`,
   default 15000), or returns schema-invalid JSON, a deterministic fallback
   explanation is used and the alert is tagged `source: "FALLBACK"`.

> **Note on latency:** with `gemini-3.8-flash`, live calls can take longer than the
> default 15 s timeout, so most alerts are explained via the fallback path — this is
> the intended safe default. To force live AI during a demo, raise `AI_TIMEOUT_MS`
> in `Backend/.env` (e.g. `120000`).

The prompts, guardrails, and output schema are documented in
[`AI_Prompts.docx`](./AI_Prompts.docx). Regenerate with:

```bash
cd Backend && npm run generate:prompts-doc
```

---

## Configuration

All backend settings live in `Backend/.env` (see `Backend/.env.example` for the full
list with defaults). Key values:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` / `HOST` | `4000` / `0.0.0.0` | Server bind |
| `DATABASE_URL` | `file:./dev.db` | SQLite location |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | `120` / `60000` | Global rate limit |
| `MONITOR_RATE_LIMIT_MAX` | `30` | `/monitor` per-minute limit |
| `THRESHOLD_WARNING_MS` / `THRESHOLD_CRITICAL_MS` | `3000` / `5000` | Latency thresholds (critical must be > warning) |
| `EMPTY_RESULT_ALLOWED_APIS` | `HealthCheckAPI,StatusAPI` | APIs allowed to return 0 records |
| `MAX_BATCH_SIZE` / `MAX_BODY_SIZE_BYTES` | `50` / `262144` | Request limits |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | — / `gemini-3.8-flash` | Gemini credentials and model |
| `AI_TIMEOUT_MS` / `AI_MAX_CONCURRENT` / `AI_MAX_CALLS_PER_BATCH` | `15000` / `2` / `10` | AI behaviour caps |

Frontend: `VITE_API_BASE_URL` (default `http://localhost:4000`).

---

## Database

Prisma with SQLite. Migrations live in `Backend/prisma/migrations`.

```bash
cd Backend
npx prisma migrate deploy    # apply committed migrations (safe, non-destructive)
npx prisma studio            # browse the Alert table
```

The `Alert` model stores the observation, rule findings (JSON-encoded), the AI or
fallback explanation fields, dedup fingerprint, occurrence count, and
ACTIVE/RESOLVED status with timestamps.

---

## Testing

```bash
cd Backend
npm test          # vitest — 99 tests
npm run lint      # eslint
npx tsc --noEmit  # type-check
```

Test suites:

- `tests/rules.test.ts` — anomaly detection boundaries, fingerprints, batching
- `tests/config.test.ts` — env validation and coercion
- `tests/validators.test.ts` — Zod request schemas
- `tests/ai.test.ts` — fallback explainer, stubbed Gemini client, concurrency cap
- `tests/integration/api.test.ts` — Supertest against a fresh temp SQLite DB
  (Gemini disabled, rate limits raised to avoid flakiness)

Frontend:

```bash
cd Frontend
npm run build     # tsc -b && vite build
npm run lint      # eslint
```

---

## Demo plan

See [`DEMO_PLAN.md`](./DEMO_PLAN.md) for a scripted 5–10 minute walkthrough
(backend health → critical alert → dedup → AI/fallback explanation → dashboard →
detail view → resolve).

---

## Security notes

- `.env` is gitignored; `.env.example` contains placeholders only.
- `GEMINI_API_KEY` is redacted from structured logs.
- Request bodies are size-limited (`MAX_BODY_SIZE_BYTES`), rate limiting is applied
  globally and on `/monitor`, and error responses never leak stack traces.
- Helmet security headers and explicit CORS origins are enabled.
