import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/index.js";

describe("loadConfig defaults", () => {
  it("applies documented defaults for an empty env", () => {
    const cfg = loadConfig({});
    expect(cfg.nodeEnv).toBe("development");
    expect(cfg.port).toBe(4000);
    expect(cfg.host).toBe("0.0.0.0");
    expect(cfg.logLevel).toBe("info");
    expect(cfg.databaseUrl).toBe("file:./dev.db");
    expect(cfg.corsOrigins).toEqual(["http://localhost:5173"]);
    expect(cfg.rateLimit).toEqual({ max: 120, windowMs: 60_000, monitorMax: 30 });
    expect(cfg.thresholds.warningMs).toBe(3000);
    expect(cfg.thresholds.criticalMs).toBe(5000);
    expect([...cfg.thresholds.emptyResultAllowedApis]).toEqual([
      "HealthCheckAPI",
      "StatusAPI",
    ]);
    expect(cfg.limits).toEqual({ maxBatchSize: 50, maxBodySizeBytes: 262_144 });
    expect(cfg.ai.apiKey).toBe("");
    expect(cfg.ai.model).toBe("gemini-2.0-flash");
    expect(cfg.ai.timeoutMs).toBe(8000);
    expect(cfg.ai.maxConcurrent).toBe(2);
    expect(cfg.ai.maxCallsPerBatch).toBe(10);
  });

  it("coerces numeric strings from the environment", () => {
    const cfg = loadConfig({ PORT: "8080", THRESHOLD_WARNING_MS: "1500" });
    expect(cfg.port).toBe(8080);
    expect(cfg.thresholds.warningMs).toBe(1500);
  });

  it("splits CORS_ORIGIN into a trimmed array", () => {
    const cfg = loadConfig({ CORS_ORIGIN: "http://a.example, http://b.example" });
    expect(cfg.corsOrigins).toEqual(["http://a.example", "http://b.example"]);
  });

  it("builds the empty-result allowlist as a Set", () => {
    const cfg = loadConfig({
      EMPTY_RESULT_ALLOWED_APIS: "PingAPI, StatusAPI , , DiagnosticsAPI",
    });
    expect(cfg.thresholds.emptyResultAllowedApis.has("PingAPI")).toBe(true);
    expect(cfg.thresholds.emptyResultAllowedApis.has("StatusAPI")).toBe(true);
    expect(cfg.thresholds.emptyResultAllowedApis.has("DiagnosticsAPI")).toBe(true);
    expect(cfg.thresholds.emptyResultAllowedApis.has("")).toBe(false);
  });
});

describe("loadConfig validation", () => {
  it("rejects critical <= warning thresholds", () => {
    expect(() =>
      loadConfig({ THRESHOLD_WARNING_MS: "5000", THRESHOLD_CRITICAL_MS: "5000" }),
    ).toThrow(/THRESHOLD_CRITICAL_MS must be greater than THRESHOLD_WARNING_MS/);
    expect(() =>
      loadConfig({ THRESHOLD_WARNING_MS: "6000", THRESHOLD_CRITICAL_MS: "5000" }),
    ).toThrow(/THRESHOLD_CRITICAL_MS must be greater than THRESHOLD_WARNING_MS/);
  });

  it("accepts critical strictly greater than warning", () => {
    const cfg = loadConfig({
      THRESHOLD_WARNING_MS: "3000",
      THRESHOLD_CRITICAL_MS: "3001",
    });
    expect(cfg.thresholds.criticalMs).toBe(3001);
  });

  it("rejects an invalid NODE_ENV with a structured message", () => {
    expect(() => loadConfig({ NODE_ENV: "staging" })).toThrow(
      /Invalid environment configuration: NODE_ENV/,
    );
  });

  it("rejects non-numeric PORT", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(
      /Invalid environment configuration: PORT/,
    );
  });

  it("rejects a non-positive rate limit", () => {
    expect(() => loadConfig({ RATE_LIMIT_MAX: "0" })).toThrow(
      /Invalid environment configuration: RATE_LIMIT_MAX/,
    );
  });

  it("keeps Gemini AI settings", () => {
    const cfg = loadConfig({
      GEMINI_API_KEY: "test-key",
      GEMINI_MODEL: "gemini-3.8-flash",
      AI_TIMEOUT_MS: "15000",
      AI_MAX_CALLS_PER_BATCH: "10",
    });
    expect(cfg.ai.apiKey).toBe("test-key");
    expect(cfg.ai.model).toBe("gemini-3.8-flash");
    expect(cfg.ai.timeoutMs).toBe(15000);
    expect(cfg.ai.maxCallsPerBatch).toBe(10);
  });
});
