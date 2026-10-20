import { describe, expect, it } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import {
  AiExplainerService,
  FallbackAlertExplainer,
  GeminiAlertExplainer,
  alertExplanationSchema,
  buildFallbackExplanation,
  createExplainer,
  mapWithConcurrency,
} from "../src/services/ai.js";
import type { AlertExplainer } from "../src/services/ai.js";
import { evaluateObservation } from "../src/monitoring/rules.js";
import type { AppConfig } from "../src/config/index.js";
import type { EvaluationResult, ExplainedAlert } from "../src/monitoring/types.js";

const ruleOptions = {
  warningMs: 3000,
  criticalMs: 5000,
  emptyResultAllowedApis: new Set<string>(),
};

function anomalousResult(): EvaluationResult {
  return evaluateObservation(
    {
      api_name: "AppointmentAPI",
      response_time_ms: 5500,
      status_code: 500,
      records_returned: 0,
    },
    ruleOptions,
  );
}

const aiCfg: AppConfig["ai"] = {
  apiKey: "test-key",
  model: "gemini-test",
  timeoutMs: 1000,
  maxConcurrent: 2,
  maxCallsPerBatch: 10,
};

const validGeminiJson = JSON.stringify({
  title: "AppointmentAPI critical failure",
  summary: "The API returned HTTP 500 and exceeded the critical latency threshold.",
  likely_cause: "Hypothesis: the backing service is unhealthy.",
  suggested_actions: ["Check server logs", "Review recent deploys"],
  severity_explanation: "Rules assigned CRITICAL due to 5xx and latency.",
});

function stubClient(
  payload: { text?: string; candidates?: unknown[] } | Error,
): GoogleGenAI {
  return {
    models: {
      generateContent: async () => {
        if (payload instanceof Error) throw payload;
        return payload;
      },
    },
  } as unknown as GoogleGenAI;
}

describe("FallbackAlertExplainer", () => {
  it("returns source FALLBACK with schema-valid explanation", async () => {
    const result = anomalousResult();
    expect(result.isAnomalous).toBe(true);
    const explained = await new FallbackAlertExplainer().explain(result);
    expect(explained.source).toBe("FALLBACK");
    expect(() => alertExplanationSchema.parse(explained.explanation)).not.toThrow();
  });

  it("labels likely_cause as a hypothesis, never a confirmed cause", async () => {
    const explained = await new FallbackAlertExplainer().explain(anomalousResult());
    expect(explained.explanation.likely_cause).toContain("Hypothesis");
  });

  it("mentions the API name and deterministic rules in the text", async () => {
    const explained = await new FallbackAlertExplainer().explain(anomalousResult());
    expect(explained.explanation.title).toContain("AppointmentAPI");
    expect(explained.explanation.severity_explanation).toContain("deterministic");
  });

  it("caps suggested actions at 8", async () => {
    const explanation = buildFallbackExplanation(anomalousResult());
    expect(explainedActionsWithinCap(explanation.suggested_actions)).toBe(true);
  });

  function explainedActionsWithinCap(actions: string[]): boolean {
    return actions.length >= 1 && actions.length <= 8;
  }
});

describe("GeminiAlertExplainer with stubbed client", () => {
  it("returns source AI for a valid structured response", async () => {
    const explainer = new GeminiAlertExplainer(aiCfg, () =>
      stubClient({ text: validGeminiJson }),
    );
    const explained = await explainer.explain(anomalousResult());
    expect(explained.source).toBe("AI");
    expect(explained.explanation.title).toBe("AppointmentAPI critical failure");
  });

  it("throws on empty content", async () => {
    const explainer = new GeminiAlertExplainer(aiCfg, () => stubClient({ text: "  " }));
    await expect(explainer.explain(anomalousResult())).rejects.toThrow(/no content/);
  });

  it("throws on invalid JSON content", async () => {
    const explainer = new GeminiAlertExplainer(aiCfg, () =>
      stubClient({ text: "not json {" }),
    );
    await expect(explainer.explain(anomalousResult())).rejects.toThrow();
  });

  it("throws when JSON violates the Zod schema", async () => {
    const explainer = new GeminiAlertExplainer(aiCfg, () =>
      stubClient({ text: JSON.stringify({ title: "only a title" }) }),
    );
    await expect(explainer.explain(anomalousResult())).rejects.toThrow();
  });

  it("propagates client/timeout errors", async () => {
    const explainer = new GeminiAlertExplainer(aiCfg, () =>
      stubClient(new Error("This operation was aborted")),
    );
    await expect(explainer.explain(anomalousResult())).rejects.toThrow(/aborted/);
  });
});

describe("AiExplainerService cascade", () => {
  it("passes through a successful AI explanation", async () => {
    const aiExplained: ExplainedAlert = {
      explanation: {
        title: "t",
        summary: "s",
        likely_cause: "Hypothesis: h",
        suggested_actions: ["a"],
        severity_explanation: "se",
      },
      source: "AI",
    };
    const primary: AlertExplainer = {
      source: "AI",
      explain: async () => aiExplained,
    };
    const service = new AiExplainerService(primary);
    const explained = await service.explain(anomalousResult());
    expect(explained).toBe(aiExplained);
  });

  it("falls back to deterministic explanation when the primary throws", async () => {
    const primary: AlertExplainer = {
      source: "AI",
      explain: async () => {
        throw new Error("boom");
      },
    };
    const service = new AiExplainerService(primary);
    const explained = await service.explain(anomalousResult());
    expect(explained.source).toBe("FALLBACK");
    expect(() => alertExplanationSchema.parse(explained.explanation)).not.toThrow();
  });

  it("falls back when the primary returns invalid output at runtime", async () => {
    const primary: AlertExplainer = {
      source: "AI",
      explain: async () => {
        throw new Error("Gemini returned invalid JSON");
      },
    };
    const service = new AiExplainerService(primary);
    const explained = await service.explain(anomalousResult());
    expect(explained.source).toBe("FALLBACK");
  });
});

describe("createExplainer", () => {
  it("returns the deterministic fallback explainer when no API key is set", () => {
    const explainer = createExplainer({
      ...({} as AppConfig),
      ai: { ...aiCfg, apiKey: "" },
    });
    expect(explainer).toBeInstanceOf(FallbackAlertExplainer);
  });
});

describe("mapWithConcurrency", () => {
  it("preserves input order in results", async () => {
    const results = await mapWithConcurrency([3, 1, 2], 2, async (n) => {
      await new Promise((r) => setTimeout(r, n * 5));
      return n * 10;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("handles an empty input", async () => {
    const results = await mapWithConcurrency([], 5, async () => "x");
    expect(results).toEqual([]);
  });
});
