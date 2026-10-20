import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import type createSupertest from "supertest";

let app: Express;
let supertest: typeof createSupertest;
let prisma: PrismaClient;
let tempDir: string;

const criticalObservation = {
  api_name: "AppointmentAPI",
  response_time_ms: 5500,
  status_code: 500,
  records_returned: 0,
};

const normalObservation = {
  api_name: "StatusAPI",
  response_time_ms: 120,
  status_code: 200,
  records_returned: 0,
};

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "autoalert-it-"));
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = `file:${join(tempDir, "test.db")}`;
  process.env.GEMINI_API_KEY = "";
  process.env.RATE_LIMIT_MAX = "100000";
  process.env.MONITOR_RATE_LIMIT_MAX = "100000";
  execSync("npx prisma migrate deploy", {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
  });
  ({ app } = await import("../../src/app.js"));
  ({ default: supertest } = (await import("supertest")) as {
    default: typeof createSupertest;
  });
  ({ prisma } = await import("../../src/db/prisma.js"));
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe("GET /health", () => {
  it("returns a structured ok payload", async () => {
    const res = await supertest(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      message: "API Monitoring Backend is running",
    });
  });
});

describe("404 handling", () => {
  it("returns a structured 404 for unknown routes", async () => {
    const res = await supertest(app).get("/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      status: "error",
      message: "Route not found",
      path: "/definitely-not-a-route",
    });
  });
});

describe("POST /monitor", () => {
  let alertId: string;

  it("accepts a single normal observation without creating alerts", async () => {
    const res = await supertest(app).post("/monitor").send(normalObservation);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.summary).toMatchObject({
      total: 1,
      anomalous: 0,
      normal: 1,
      alertsCreated: 0,
    });
    expect(res.body.results[0].isAnomalous).toBe(false);
    expect(res.body.results[0].alertId).toBeNull();
  });

  it("creates a CRITICAL alert for a 5xx + slow observation (fallback source)", async () => {
    const res = await supertest(app).post("/monitor").send(criticalObservation);
    expect(res.status).toBe(200);
    const item = res.body.results[0];
    expect(item.isAnomalous).toBe(true);
    expect(item.severity).toBe("CRITICAL");
    expect(item.alertStatus).toBe("CREATED");
    expect(item.explanationSource).toBe("FALLBACK");
    expect(item.occurrenceCount).toBe(1);
    alertId = item.alertId;
    expect(typeof alertId).toBe("string");
  });

  it("deduplicates a repeat of the same anomaly", async () => {
    const res = await supertest(app).post("/monitor").send(criticalObservation);
    expect(res.status).toBe(200);
    expect(res.body.results[0].alertStatus).toBe("UPDATED");
    expect(res.body.results[0].occurrenceCount).toBe(2);
    expect(res.body.results[0].alertId).toBe(alertId);
    expect(res.body.summary.alertsUpdated).toBe(1);
  });

  it("processes a mixed batch with correct per-item results", async () => {
    const res = await supertest(app)
      .post("/monitor")
      .send({
        observations: [
          normalObservation,
          { ...criticalObservation, api_name: "ReportAPI" },
          {
            ...criticalObservation,
            api_name: "OrdersAPI",
            response_time_ms: 400,
            status_code: 404,
            records_returned: 3,
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 3, anomalous: 2, normal: 1 });
    expect(res.body.results.map((r: { isAnomalous: boolean }) => r.isAnomalous)).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("returns 400 with details for malformed JSON", async () => {
    const res = await supertest(app)
      .post("/monitor")
      .set("Content-Type", "application/json")
      .send("{not valid json");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      status: "error",
      message: "Invalid JSON in request body",
    });
  });

  it("returns 400 with field details for an invalid observation", async () => {
    const res = await supertest(app).post("/monitor").send({
      api_name: "X",
      response_time_ms: 10,
      status_code: 999,
      records_returned: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(res.body.details).toEqual([
      {
        path: "observations.0.status_code",
        message: "Number must be less than or equal to 599",
      },
    ]);
  });

  it("returns 400 for an empty batch", async () => {
    const res = await supertest(app).post("/monitor").send({ observations: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });

  it("returns 400 when the batch exceeds MAX_BATCH_SIZE", async () => {
    const observations = Array.from({ length: 51 }, (_, i) => ({
      ...normalObservation,
      api_name: `BulkAPI${i}`,
    }));
    const res = await supertest(app).post("/monitor").send({ observations });
    expect(res.status).toBe(400);
    expect(res.body.details?.[0]?.message).toMatch(/at most 50/);
  });

  it("stores the seeded alert id for later tests", () => {
    expect(typeof alertId).toBe("string");
    expect(alertId.length).toBeGreaterThan(0);
  });
});

describe("GET /alerts", () => {
  it("lists persisted alerts newest first", async () => {
    const res = await supertest(app).get("/alerts");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.total).toBe(3);
    expect(res.body.alerts).toHaveLength(3);
    expect(res.body.alerts[0].apiName).toBe("OrdersAPI");
  });

  it("filters by severity", async () => {
    const res = await supertest(app).get("/alerts").query({ severity: "CRITICAL" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(
      res.body.alerts.every((a: { severity: string }) => a.severity === "CRITICAL"),
    ).toBe(true);
  });

  it("filters by apiName", async () => {
    const res = await supertest(app).get("/alerts").query({ apiName: "ReportAPI" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.alerts[0].apiName).toBe("ReportAPI");
  });

  it("honours limit and offset", async () => {
    const res = await supertest(app).get("/alerts").query({ limit: 1, offset: 1 });
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.total).toBe(3);
  });

  it("rejects an out-of-range limit with a structured 400", async () => {
    const res = await supertest(app).get("/alerts").query({ limit: 999 });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ status: "error", message: "Validation failed" });
    expect(res.body.details[0].path).toBe("limit");
  });

  it("rejects an invalid status filter", async () => {
    const res = await supertest(app).get("/alerts").query({ status: "BOGUS" });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe("status");
  });
});

describe("GET /alerts/:id", () => {
  let alertId: string;

  it("finds a seeded alert with decoded evidence", async () => {
    const list = await supertest(app).get("/alerts").query({ apiName: "AppointmentAPI" });
    alertId = list.body.alerts[0].id;
    const res = await supertest(app).get(`/alerts/${alertId}`);
    expect(res.status).toBe(200);
    const alert = res.body.alert;
    expect(alert.apiName).toBe("AppointmentAPI");
    expect(alert.occurrenceCount).toBe(2);
    expect(Array.isArray(alert.evidence)).toBe(true);
    expect(alert.evidence.length).toBeGreaterThan(0);
    expect(Array.isArray(alert.suggestedActions)).toBe(true);
    expect(alert.resolvedAt).toBeNull();
  });

  it("returns structured 404 for an unknown id", async () => {
    const res = await supertest(app).get("/alerts/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ status: "error", message: "Alert not found" });
  });
});

describe("PATCH /alerts/:id/resolve", () => {
  let alertId: string;
  let firstResolvedAt: string;

  it("resolves a seeded alert", async () => {
    const list = await supertest(app).get("/alerts").query({ apiName: "ReportAPI" });
    alertId = list.body.alerts[0].id;
    const res = await supertest(app).patch(`/alerts/${alertId}/resolve`);
    expect(res.status).toBe(200);
    expect(res.body.alert.status).toBe("RESOLVED");
    expect(res.body.alert.resolvedAt).toBeTruthy();
    firstResolvedAt = res.body.alert.resolvedAt;
  });

  it("is idempotent on repeat resolves", async () => {
    const res = await supertest(app).patch(`/alerts/${alertId}/resolve`);
    expect(res.status).toBe(200);
    expect(res.body.alert.status).toBe("RESOLVED");
    expect(res.body.alert.resolvedAt).toBe(firstResolvedAt);
  });

  it("returns structured 404 for unknown ids", async () => {
    const res = await supertest(app).patch("/alerts/nope/resolve");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ status: "error", message: "Alert not found" });
  });

  it("reflects the resolve in status filters", async () => {
    const active = await supertest(app).get("/alerts").query({ status: "ACTIVE" });
    expect(active.body.total).toBe(2);
    const resolved = await supertest(app).get("/alerts").query({ status: "RESOLVED" });
    expect(resolved.body.total).toBe(1);
    expect(resolved.body.alerts[0].apiName).toBe("ReportAPI");
  });
});
