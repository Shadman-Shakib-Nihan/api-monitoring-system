# Demo Plan (5–10 minutes)

Scripted walkthrough of the Intelligent API Monitoring & Alert System. Assumes the
backend is on `http://localhost:4000` and the frontend on `http://localhost:5173`.

## Before you start (30 s)

```bash
# Terminal 1
cd Backend && npm run dev

# Terminal 2
cd Frontend && npm run dev
```

Open <http://localhost:5173>. Confirm the header chip says **Backend online**.

---

## 1. The system is live (30 s)

- Show `curl http://localhost:4000/health` returning `{"status":"ok",...}`.
- Point at the dashboard header chip polling that endpoint.
- State the design principle: **rules decide severity; AI only explains.**

## 2. A critical alert arrives (1 min)

```bash
curl -X POST http://localhost:4000/monitor -H 'Content-Type: application/json' \
  -d '{"api_name":"PaymentAPI","status_code":500,"response_time_ms":6000,"records_returned":0}'
```

- Highlight the response: `severity: "CRITICAL"`, `alertStatus: "CREATED"`,
  `explanationSource`.
- Explain the rule hits: HTTP 5xx → CRITICAL, latency 6000 ms > 5000 ms →
  CRITICAL, empty result on a non-allowlisted API → WARNING.

## 3. Deduplication (1 min)

Run the **same** curl again.

- `alertStatus` is now `UPDATED` and `occurrenceCount` is `2` — no duplicate row,
  no extra AI budget spent.
- Mention the SHA-256 fingerprint and that a RESOLVED alert would re-alert.

## 4. Batch + rule variety (1 min)

```bash
curl -X POST http://localhost:4000/monitor -H 'Content-Type: application/json' \
  -d '{"observations":[
    {"api_name":"OrdersAPI","status_code":200,"response_time_ms":4500,"records_returned":12},
    {"api_name":"ReportAPI","status_code":429,"response_time_ms":900,"records_returned":0},
    {"api_name":"StatusAPI","status_code":200,"response_time_ms":80,"records_returned":0}
  ]}'
```

- `OrdersAPI` → WARNING (latency 4500 ms, between thresholds).
- `ReportAPI` → WARNING (429 rate limited + empty result).
- `StatusAPI` → **no alert**: it is on `EMPTY_RESULT_ALLOWED_APIS`.

## 5. The dashboard (1–2 min)

- Click **Refresh** — the new alerts appear; summary cards update.
- Point out severity badges, status chips, occurrences, and the responsive
  layout (resize the window to show mobile cards).
- Note the **Backend offline** chip behaviour by stopping the backend briefly,
  then restart it.

## 6. Detail view + AI vs fallback (1–2 min)

- Click an alert. Show:
  - **Likely cause** and **severity rationale**.
  - **Suggested actions** (ordered troubleshooting steps).
  - **Evidence cards** — each finding with observed vs expected.
  - The source badge: **Rule-based** (fallback) or **AI explanation**.
- Explain the fallback: no `GEMINI_API_KEY`, a timeout, or invalid AI JSON never
  loses an alert — it just gets a deterministic explanation.
- If live AI is wanted for the demo, set `AI_TIMEOUT_MS=120000` in
  `Backend/.env`, restart, and submit a new alert to see `source: "AI"`.
  Reference `AI_Prompts.docx` for the prompt and guardrails.

## 7. Resolve (1 min)

- Click **Resolve** on an ACTIVE alert. The view updates to Resolved.
- Show idempotency from the terminal:

  ```bash
  curl -X PATCH http://localhost:4000/alerts/<alertId>/resolve   # twice
  ```

  The second call keeps the original `resolvedAt`.
- Go **Back to alerts** — the list refetches and the summary reflects the resolve.

## 8. Quality story (30–60 s)

- `cd Backend && npm test` → **99/99 passing** (unit + Supertest integration on a
  temp DB; Gemini disabled so no quota is used).
- `cd Frontend && npm run build && npm run lint` → clean.
- Close on the safety/quality notes: rate limiting, body-size caps, helmet,
  explicit CORS, no stack-trace leaks, `.env` gitignored, no secrets committed.

---

## Talking points / likely questions

- **Why rules instead of pure AI?** Deterministic, testable, no hallucinated
  severities, and it works offline. AI is an enrichment layer, not a decider.
- **What happens when Gemini is down?** Cascade fallback — the alert is still
  recorded with `source: "FALLBACK"`.
- **How does dedup work?** SHA-256 fingerprint over the observation identity;
  repeats bump `occurrenceCount` on the ACTIVE alert.
- **Why SQLite?** Zero-setup persistence for the assignment; Prisma makes the
  schema portable to Postgres later.
