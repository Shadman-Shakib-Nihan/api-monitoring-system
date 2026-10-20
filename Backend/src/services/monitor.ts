import type { PrismaClient } from "@prisma/client";
import { config } from "../config/index.js";
import { evaluateBatch, ruleEngineOptionsFromConfig } from "../monitoring/rules.js";
import type {
  ApiObservation,
  EvaluationResult,
  ExplanationSource,
  Severity,
} from "../monitoring/types.js";
import { FallbackAlertExplainer, createExplainer, mapWithConcurrency } from "./ai.js";
import type { AlertExplainer } from "./ai.js";
import { recordAlert } from "./alerts.js";

export interface MonitorResultItem {
  api_name: string;
  isAnomalous: boolean;
  severity: Severity | null;
  fingerprint: string;
  alertId: string | null;
  occurrenceCount: number | null;
  alertStatus: "CREATED" | "UPDATED" | null;
  explanationSource: ExplanationSource | null;
}

export interface MonitorResponse {
  summary: {
    total: number;
    anomalous: number;
    normal: number;
    alertsCreated: number;
    alertsUpdated: number;
    aiExplained: number;
    fallbackExplained: number;
  };
  results: MonitorResultItem[];
}

export interface ProcessObservationsOptions {
  explainer?: AlertExplainer;
}

let appExplainer: AlertExplainer | null = null;

function getExplainer(): AlertExplainer {
  if (!appExplainer) {
    appExplainer = createExplainer(config);
  }
  return appExplainer;
}

/**
 * Full monitoring pipeline for one request:
 * deterministic evaluation → dedup-aware AI explanation (capped per batch,
 * concurrency-limited) → alert persistence with fingerprint dedup.
 */
export async function processObservations(
  db: PrismaClient,
  observations: ApiObservation[],
  options: ProcessObservationsOptions = {},
): Promise<MonitorResponse> {
  const ruleOptions = ruleEngineOptionsFromConfig(config);
  const evaluations = evaluateBatch(observations, ruleOptions);
  const anomalous = evaluations.filter((e) => e.isAnomalous);

  const activeFingerprints = new Set<string>();
  if (anomalous.length > 0) {
    const fingerprints = [...new Set(anomalous.map((e) => e.fingerprint))];
    const existingActive = await db.alert.findMany({
      where: { fingerprint: { in: fingerprints }, status: "ACTIVE" },
      select: { fingerprint: true },
    });
    for (const row of existingActive) {
      activeFingerprints.add(row.fingerprint);
    }
  }

  // Only brand-new alerts may consume the AI budget; repeats reuse persisted text.
  const needsAi = anomalous.filter((e) => !activeFingerprints.has(e.fingerprint));
  const aiBudget = Math.max(0, Math.min(needsAi.length, config.ai.maxCallsPerBatch));
  const aiTargets = needsAi.slice(0, aiBudget);

  const explainer = options.explainer ?? getExplainer();
  const fallback = new FallbackAlertExplainer();

  const explainedByResult = new Map<
    EvaluationResult,
    Awaited<ReturnType<AlertExplainer["explain"]>>
  >();

  const aiExplained = await mapWithConcurrency(
    aiTargets,
    config.ai.maxConcurrent,
    (result) => explainer.explain(result),
  );
  aiTargets.forEach((result, i) => {
    const explained = aiExplained[i];
    if (explained) explainedByResult.set(result, explained);
  });

  for (const result of anomalous) {
    if (!explainedByResult.has(result)) {
      explainedByResult.set(result, await fallback.explain(result));
    }
  }

  const results: MonitorResultItem[] = [];
  let alertsCreated = 0;
  let alertsUpdated = 0;
  let aiExplainedCount = 0;
  let fallbackExplainedCount = 0;

  for (let i = 0; i < evaluations.length; i++) {
    const evaluation = evaluations[i];
    const observation = observations[i];
    if (!evaluation || !observation) continue;

    if (!evaluation.isAnomalous || !evaluation.severity) {
      results.push({
        api_name: observation.api_name,
        isAnomalous: false,
        severity: null,
        fingerprint: evaluation.fingerprint,
        alertId: null,
        occurrenceCount: null,
        alertStatus: null,
        explanationSource: null,
      });
      continue;
    }

    const explained = explainedByResult.get(evaluation);
    if (!explained) {
      throw new Error("Missing explanation for anomalous evaluation");
    }

    const dto = await recordAlert(db, { result: evaluation, explained });
    const created = dto.occurrenceCount === 1;
    if (created) {
      alertsCreated++;
    } else {
      alertsUpdated++;
    }
    if (dto.source === "AI") aiExplainedCount++;
    else fallbackExplainedCount++;

    results.push({
      api_name: observation.api_name,
      isAnomalous: true,
      severity: evaluation.severity,
      fingerprint: evaluation.fingerprint,
      alertId: dto.id,
      occurrenceCount: dto.occurrenceCount,
      alertStatus: created ? "CREATED" : "UPDATED",
      explanationSource: dto.source,
    });
  }

  return {
    summary: {
      total: evaluations.length,
      anomalous: anomalous.length,
      normal: evaluations.length - anomalous.length,
      alertsCreated,
      alertsUpdated,
      aiExplained: aiExplainedCount,
      fallbackExplained: fallbackExplainedCount,
    },
    results,
  };
}
