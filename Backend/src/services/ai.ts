import { z } from "zod";
import type { AppConfig } from "../config/index.js";
import { logger } from "../logger.js";
import { ANOMALY_TYPE_LABELS } from "../monitoring/rules.js";
import { GoogleGenAI } from "@google/genai";
import type {
  AlertExplanation,
  EvaluationResult,
  ExplainedAlert,
  ExplanationSource,
} from "../monitoring/types.js";

export const alertExplanationSchema = z.object({
  title: z.string().min(1).max(140),
  summary: z.string().min(1).max(2000),
  likely_cause: z.string().min(1).max(1500),
  suggested_actions: z.array(z.string().min(1).max(500)).min(1).max(8),
  severity_explanation: z.string().min(1).max(1500),
});

export interface AlertExplainer {
  readonly source: ExplanationSource;
  explain(result: EvaluationResult): Promise<ExplainedAlert>;
}

export const SYSTEM_PROMPT = `You are an API reliability assistant embedded in a monitoring system.
Explain the supplied monitoring findings using ONLY the provided evidence.
Rules you must follow:
- Do not invent events, logs, infrastructure details, deployments, or root causes.
- Clearly separate OBSERVED FACTS (from the findings) from POSSIBLE EXPLANATIONS.
- Any likely cause MUST be explicitly labeled as a hypothesis, never stated as confirmed.
- Never change or override the severity assigned by the deterministic monitoring rules; explain why that severity was assigned based on the supplied evidence.
- Recommend practical, ordered troubleshooting steps that an on-call engineer can act on.
- Do not include or invent patient data, personal names, medical records, or credentials.
- Keep the alert concise, professional, and specific to the supplied evidence.
- Return strictly valid JSON matching the required schema.`;

function buildUserPrompt(result: EvaluationResult): string {
  const payload = {
    api_name: result.observation.api_name,
    severity_assigned_by_rules: result.severity,
    observed: {
      http_status_code: result.observation.status_code,
      response_time_ms: result.observation.response_time_ms,
      records_returned: result.observation.records_returned,
    },
    findings: result.findings.map((f) => ({
      anomaly_type: f.anomaly_type,
      severity: f.severity,
      observed: f.observed,
      expected: f.expected,
      evidence: f.evidence,
    })),
  };
  return `Monitoring findings to explain:\n${JSON.stringify(payload, null, 2)}`;
}

export function buildFallbackExplanation(result: EvaluationResult): AlertExplanation {
  const api = result.observation.api_name;
  const severity = result.severity ?? "WARNING";
  const types = result.findings.map(
    (f) => ANOMALY_TYPE_LABELS[f.anomaly_type] ?? f.anomaly_type,
  );
  const title = `${api}: ${severity.toLowerCase()} — ${types[0] ?? "anomaly detected"}`;
  const summary =
    `Monitoring detected ${result.findings.length} issue(s) on "${api}": ` +
    `${types.join("; ")}. ` +
    `Observed: HTTP ${result.observation.status_code}, ` +
    `${result.observation.response_time_ms} ms response time, ` +
    `${result.observation.records_returned} record(s) returned. ` +
    `This alert was generated from deterministic rules because the AI explainer was unavailable.`;

  const actions: string[] = [];
  for (const f of result.findings) {
    switch (f.anomaly_type) {
      case "HTTP_SERVER_ERROR":
        actions.push(
          `Inspect recent error logs and stack traces for ${api} on the application server.`,
          `Check whether a recent deployment or dependency change coincides with the onset of HTTP 5xx responses.`,
        );
        break;
      case "RATE_LIMITED":
        actions.push(
          `Review client request rates and configured rate-limit quotas for ${api}; back off or add retry-with-jitter.`,
        );
        break;
      case "HTTP_CLIENT_ERROR":
        actions.push(
          `Verify request parameters, authentication tokens, and API contract versions sent to ${api}.`,
        );
        break;
      case "LATENCY_WARNING":
      case "LATENCY_CRITICAL":
        actions.push(
          `Profile slow endpoints of ${api}: inspect database query durations, payload sizes, and downstream call latency.`,
        );
        break;
      case "EMPTY_RESPONSE":
        actions.push(
          `Confirm whether ${api} legitimately returned zero records: check query filters, data-pipeline freshness, and caller permissions.`,
        );
        break;
    }
  }
  if (actions.length === 0)
    actions.push(`Review recent activity and dashboards for ${api}.`);

  const severityExplanation =
    `Severity ${severity} was assigned by the deterministic monitoring rules ` +
    `based on: ${result.findings.map((f) => `${f.anomaly_type} (observed ${f.observed}, expected ${f.expected})`).join("; ")}.`;

  return {
    title: title.slice(0, 140),
    summary,
    likely_cause: `Hypothesis (rule-based heuristic, AI explainer unavailable): ${types.join("; ")}. No root cause can be confirmed from operational metadata alone.`,
    suggested_actions: actions.slice(0, 8),
    severity_explanation: severityExplanation,
  };
}

export class FallbackAlertExplainer implements AlertExplainer {
  readonly source: ExplanationSource = "FALLBACK";

  async explain(result: EvaluationResult): Promise<ExplainedAlert> {
    return { explanation: buildFallbackExplanation(result), source: this.source };
  }
}

export class GeminiAlertExplainer implements AlertExplainer {
  readonly source: ExplanationSource = "AI";

  constructor(
    private readonly cfg: AppConfig["ai"],
    private readonly clientFactory: () => GoogleGenAI,
  ) {}

  async explain(result: EvaluationResult): Promise<ExplainedAlert> {
    const gemini = this.clientFactory();

    const response = await gemini.models.generateContent({
      model: this.cfg.model,
      contents: buildUserPrompt(result),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 1200,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            summary: { type: "STRING" },
            likely_cause: { type: "STRING" },
            suggested_actions: {
              type: "ARRAY",
              items: { type: "STRING" },
            },
            severity_explanation: { type: "STRING" },
          },
          required: [
            "title",
            "summary",
            "likely_cause",
            "suggested_actions",
            "severity_explanation",
          ],
        },
      },
    });

    const content = response.text;

    logger.debug(
      { model: this.cfg.model, finishReason: response.candidates?.[0]?.finishReason },
      "Gemini response received",
    );

    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("Gemini response contained no content");
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch (error) {
      logger.warn(
        { model: this.cfg.model, snippet: content.slice(0, 200) },
        "Gemini returned invalid JSON",
      );
      throw error;
    }

    return {
      explanation: alertExplanationSchema.parse(parsed),
      source: this.source,
    };
  }
}

// export class OpenAIAlertExplainer implements AlertExplainer {
//   readonly source: ExplanationSource = "AI";

//   constructor(
//     private readonly cfg: AppConfig["ai"],
//     private readonly clientFactory: () => import("openai").default,
//   ) {}
//   async explain(result: EvaluationResult): Promise<ExplainedAlert> {
//     const openai = this.clientFactory();
//     const response = await openai.chat.completions.create(
//       {
//         model: this.cfg.model,
//         temperature: 0.2,
//         max_tokens: 700,
//         messages: [
//           { role: "system", content: SYSTEM_PROMPT },
//           { role: "user", content: buildUserPrompt(result) },
//         ],
//         response_format: {
//           type: "json_schema",
//           json_schema: {
//             name: "api_alert",
//             strict: true,
//             schema: {
//               type: "object",
//               additionalProperties: false,
//               properties: {
//                 title: { type: "string", description: "Concise alert title (max ~100 chars)" },
//                 summary: {
//                   type: "string",
//                   description: "2-4 sentence professional summary of observed facts",
//                 },
//                 likely_cause: {
//                   type: "string",
//                   description: "Possible explanation, explicitly labeled as a hypothesis",
//                 },
//                 suggested_actions: {
//                   type: "array",
//                   items: { type: "string" },
//                   description: "Ordered, practical troubleshooting steps",
//                 },
//                 severity_explanation: {
//                   type: "string",
//                   description: "Why the pre-assigned severity follows from the evidence",
//                 },
//               },
//               required: [
//                 "title",
//                 "summary",
//                 "likely_cause",
//                 "suggested_actions",
//                 "severity_explanation",
//               ],
//             },
//           },
//         },
//       },
//       { timeout: this.cfg.timeoutMs },
//     );

//     const content = response.choices[0]?.message?.content;
//     if (!content) throw new Error("AI response contained no content");
//     const parsed: unknown = JSON.parse(content);
//     return { explanation: alertExplanationSchema.parse(parsed), source: this.source };
//   }
// }

export class AiExplainerService implements AlertExplainer {
  readonly source: ExplanationSource;
  private readonly primary: AlertExplainer;
  private readonly fallback: FallbackAlertExplainer;

  constructor(primary: AlertExplainer, fallback = new FallbackAlertExplainer()) {
    this.primary = primary;
    this.fallback = fallback;
    this.source = primary.source;
  }

  async explain(result: EvaluationResult): Promise<ExplainedAlert> {
    try {
      return await this.primary.explain(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { apiName: result.observation.api_name, err: message },
        "AI explanation failed; using deterministic fallback alert",
      );
      return this.fallback.explain(result);
    }
  }
}

export function createExplainer(config: AppConfig): AlertExplainer {
  if (!config.ai.apiKey) {
    logger.info("GEMINI_API_KEY not configured — using deterministic fallback explainer");
    return new FallbackAlertExplainer();
  }

  let cached: GoogleGenAI | undefined;

  const explainer = new GeminiAlertExplainer(config.ai, () => {
    if (!cached) {
      cached = new GoogleGenAI({
        apiKey: config.ai.apiKey,
        httpOptions: { timeout: config.ai.timeoutMs },
      });
    }

    return cached;
  });

  logger.info({ model: config.ai.model }, "Gemini explainer configured");

  return new AiExplainerService(explainer);
}

/** Run async tasks with a concurrency cap, preserving input order in the results. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (next < items.length) {
        const i = next++;
        const item = items[i];
        if (item === undefined) {
          continue;
        }
        results[i] = await fn(item, i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
