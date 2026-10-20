import { describe, expect, it } from "vitest";
import {
  computeFingerprint,
  evaluateBatch,
  evaluateObservation,
  highestSeverity,
  ruleEngineOptionsFromConfig,
  type RuleEngineOptions,
} from "../src/monitoring/rules.js";
import type { ApiObservation } from "../src/monitoring/types.js";
import type { AppConfig } from "../src/config/index.js";

const opts: RuleEngineOptions = {
  warningMs: 3000,
  criticalMs: 5000,
  emptyResultAllowedApis: new Set(["HealthCheckAPI", "StatusAPI"]),
};

function obs(overrides: Partial<ApiObservation> = {}): ApiObservation {
  return {
    api_name: "AppointmentAPI",
    response_time_ms: 200,
    status_code: 200,
    records_returned: 10,
    ...overrides,
  };
}

describe("normal observations", () => {
  it("does not alert on a fast, successful response with records", () => {
    const result = evaluateObservation(obs(), opts);
    expect(result.isAnomalous).toBe(false);
    expect(result.findings).toHaveLength(0);
    expect(result.severity).toBeNull();
  });

  it("does not alert exactly AT the warning threshold (strict >)", () => {
    const result = evaluateObservation(obs({ response_time_ms: 3000 }), opts);
    expect(result.isAnomalous).toBe(false);
  });

  it("treats exactly AT the critical threshold as warning-level only", () => {
    const result = evaluateObservation(obs({ response_time_ms: 5000 }), opts);
    expect(result.isAnomalous).toBe(true);
    expect(result.severity).toBe("WARNING");
    expect(result.findings.map((f) => f.anomaly_type)).toEqual(["LATENCY_WARNING"]);
  });

  it("does not alert on 2xx statuses with records (201)", () => {
    const result = evaluateObservation(obs({ status_code: 201 }), opts);
    expect(result.isAnomalous).toBe(false);
  });
});

describe("latency rules", () => {
  it("flags 3001 ms as WARNING latency", () => {
    const result = evaluateObservation(obs({ response_time_ms: 3001 }), opts);
    expect(result.isAnomalous).toBe(true);
    expect(result.severity).toBe("WARNING");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.anomaly_type).toBe("LATENCY_WARNING");
    expect(result.findings[0]?.observed).toBe(3001);
  });

  it("flags 5001 ms as CRITICAL latency", () => {
    const result = evaluateObservation(obs({ response_time_ms: 5001 }), opts);
    expect(result.severity).toBe("CRITICAL");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.anomaly_type).toBe("LATENCY_CRITICAL");
  });

  it("emits only one latency finding (warning and critical are exclusive)", () => {
    const result = evaluateObservation(obs({ response_time_ms: 9000 }), opts);
    const latencyFindings = result.findings.filter((f) =>
      f.anomaly_type.startsWith("LATENCY"),
    );
    expect(latencyFindings).toHaveLength(1);
  });
});

describe("HTTP status rules", () => {
  it("flags 500 as CRITICAL server error", () => {
    const result = evaluateObservation(
      obs({ status_code: 500, records_returned: 5 }),
      opts,
    );
    expect(result.severity).toBe("CRITICAL");
    expect(result.findings.map((f) => f.anomaly_type)).toEqual(["HTTP_SERVER_ERROR"]);
  });

  it("flags 503 as CRITICAL server error", () => {
    const result = evaluateObservation(
      obs({ status_code: 503, records_returned: 5 }),
      opts,
    );
    expect(result.severity).toBe("CRITICAL");
    expect(result.findings[0]?.anomaly_type).toBe("HTTP_SERVER_ERROR");
  });

  it("flags 429 as WARNING rate-limited (not generic client error)", () => {
    const result = evaluateObservation(
      obs({ status_code: 429, records_returned: 5 }),
      opts,
    );
    expect(result.severity).toBe("WARNING");
    expect(result.findings.map((f) => f.anomaly_type)).toEqual(["RATE_LIMITED"]);
  });

  it("flags 404 and 400 as WARNING client errors", () => {
    for (const status_code of [400, 404]) {
      const result = evaluateObservation(obs({ status_code, records_returned: 5 }), opts);
      expect(result.severity).toBe("WARNING");
      expect(result.findings.map((f) => f.anomaly_type)).toEqual(["HTTP_CLIENT_ERROR"]);
    }
  });
});

describe("empty-result rules and allowlist", () => {
  it("flags 0 records on a successful response as WARNING for a normal API", () => {
    const result = evaluateObservation(
      obs({ api_name: "UsersAPI", records_returned: 0 }),
      opts,
    );
    expect(result.isAnomalous).toBe(true);
    expect(result.severity).toBe("WARNING");
    expect(result.findings.map((f) => f.anomaly_type)).toEqual(["EMPTY_RESPONSE"]);
  });

  it("does NOT flag HealthCheckAPI returning 0 records", () => {
    const result = evaluateObservation(
      obs({ api_name: "HealthCheckAPI", records_returned: 0 }),
      opts,
    );
    expect(result.isAnomalous).toBe(false);
  });

  it("does NOT flag StatusAPI returning 0 records", () => {
    const result = evaluateObservation(
      obs({ api_name: "StatusAPI", records_returned: 0 }),
      opts,
    );
    expect(result.isAnomalous).toBe(false);
  });

  it("does NOT flag 1 record on a normal API", () => {
    const result = evaluateObservation(
      obs({ api_name: "UsersAPI", records_returned: 1 }),
      opts,
    );
    expect(result.isAnomalous).toBe(false);
  });

  it("does NOT duplicate EMPTY_RESPONSE when the response already failed (500 + 0 records)", () => {
    const result = evaluateObservation(
      obs({ status_code: 500, records_returned: 0 }),
      opts,
    );
    expect(result.findings.map((f) => f.anomaly_type)).toEqual(["HTTP_SERVER_ERROR"]);
  });

  it("does NOT duplicate EMPTY_RESPONSE on a 404 + 0 records", () => {
    const result = evaluateObservation(
      obs({ status_code: 404, records_returned: 0 }),
      opts,
    );
    expect(result.findings.map((f) => f.anomaly_type)).toEqual(["HTTP_CLIENT_ERROR"]);
  });

  it("still flags allowlisted APIs on real problems (HealthCheckAPI + 500)", () => {
    const result = evaluateObservation(
      obs({ api_name: "HealthCheckAPI", status_code: 500, records_returned: 0 }),
      opts,
    );
    expect(result.severity).toBe("CRITICAL");
    expect(result.findings.map((f) => f.anomaly_type)).toEqual(["HTTP_SERVER_ERROR"]);
  });
});

describe("combined findings and severity", () => {
  it("collects multiple findings and takes the highest severity", () => {
    const result = evaluateObservation(
      obs({ response_time_ms: 5500, status_code: 500, records_returned: 0 }),
      opts,
    );
    expect(result.findings.map((f) => f.anomaly_type).sort()).toEqual([
      "HTTP_SERVER_ERROR",
      "LATENCY_CRITICAL",
    ]);
    expect(result.severity).toBe("CRITICAL");
  });

  it("highestSeverity returns null for no findings", () => {
    expect(highestSeverity([])).toBeNull();
  });

  it("highestSeverity prefers CRITICAL over WARNING", () => {
    expect(
      highestSeverity([
        {
          anomaly_type: "LATENCY_WARNING",
          severity: "WARNING",
          observed: 1,
          expected: "x",
          evidence: "x",
        },
        {
          anomaly_type: "HTTP_SERVER_ERROR",
          severity: "CRITICAL",
          observed: 1,
          expected: "x",
          evidence: "x",
        },
      ]),
    ).toBe("CRITICAL");
  });
});

describe("fingerprints", () => {
  it("is stable for the same api + finding types + status bucket", () => {
    const a = evaluateObservation(obs({ response_time_ms: 6000 }), opts);
    const b = evaluateObservation(obs({ response_time_ms: 6100 }), opts);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("differs across API names", () => {
    const a = evaluateObservation(obs({ response_time_ms: 6000 }), opts);
    const b = evaluateObservation(
      obs({ api_name: "OtherAPI", response_time_ms: 6000 }),
      opts,
    );
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("differs across finding type sets", () => {
    const latency = evaluateObservation(obs({ response_time_ms: 6000 }), opts);
    const serverError = evaluateObservation(
      obs({ status_code: 500, records_returned: 5 }),
      opts,
    );
    expect(latency.fingerprint).not.toBe(serverError.fingerprint);
  });

  it("differs across status buckets for the same finding type", () => {
    const fp5xx = computeFingerprint("API", [], 500);
    const fp4xx = computeFingerprint("API", [], 404);
    const fpOk = computeFingerprint("API", [], 200);
    expect(fp5xx).not.toBe(fp4xx);
    expect(fp4xx).not.toBe(fpOk);
  });

  it("is a 32-char hex string", () => {
    const { fingerprint } = evaluateObservation(obs({ response_time_ms: 6000 }), opts);
    expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("evaluateBatch", () => {
  it("preserves order and evaluates every observation", () => {
    const results = evaluateBatch(
      [
        obs(),
        obs({ response_time_ms: 6000 }),
        obs({ status_code: 500, records_returned: 5 }),
      ],
      opts,
    );
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.isAnomalous)).toEqual([false, true, true]);
    expect(results.map((r) => r.severity)).toEqual([null, "CRITICAL", "CRITICAL"]);
  });
});

describe("ruleEngineOptionsFromConfig", () => {
  it("maps AppConfig fields into rule options", () => {
    const appConfig = {
      nodeEnv: "test",
      port: 4000,
      host: "0.0.0.0",
      logLevel: "silent",
      databaseUrl: "file:./dev.db",
      corsOrigins: [],
      rateLimit: { max: 120, windowMs: 60000, monitorMax: 30 },
      thresholds: {
        warningMs: 2500,
        criticalMs: 4500,
        emptyResultAllowedApis: new Set(["PingAPI"]),
      },
      limits: { maxBatchSize: 50, maxBodySizeBytes: 262144 },
      ai: {
        apiKey: "",
        model: "m",
        timeoutMs: 1,
        maxConcurrent: 1,
        maxCallsPerBatch: 1,
      },
    } as AppConfig;

    const mapped = ruleEngineOptionsFromConfig(appConfig);
    expect(mapped.warningMs).toBe(2500);
    expect(mapped.criticalMs).toBe(4500);
    expect(mapped.emptyResultAllowedApis.has("PingAPI")).toBe(true);

    const result = evaluateObservation(
      obs({ api_name: "PingAPI", records_returned: 0 }),
      mapped,
    );
    expect(result.isAnomalous).toBe(false);
  });
});
