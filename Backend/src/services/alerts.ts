import type { Alert, Prisma, PrismaClient } from "@prisma/client";
import type {
  EvaluationResult,
  ExplainedAlert,
  ExplanationSource,
  Finding,
} from "../monitoring/types.js";

export interface AlertDto {
  id: string;
  apiName: string;
  severity: string;
  anomalyTypes: string[];
  statusCode: number | null;
  responseTimeMs: number | null;
  recordsReturned: number | null;
  evidence: Finding[];
  title: string;
  summary: string;
  likelyCause: string;
  suggestedActions: string[];
  severityExplanation: string;
  source: ExplanationSource;
  status: string;
  fingerprint: string;
  occurrenceCount: number;
  lastObservedAt: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface RecordAlertInput {
  result: EvaluationResult;
  explained: ExplainedAlert;
}

export interface ListAlertsOptions {
  status?: string | undefined;
  severity?: string | undefined;
  apiName?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ListAlertsResult {
  items: AlertDto[];
  total: number;
}

function parseJsonStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function parseEvidence(value: string): Finding[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as Finding[]) : [];
  } catch {
    return [];
  }
}

export function toAlertDto(alert: Alert): AlertDto {
  return {
    id: alert.id,
    apiName: alert.apiName,
    severity: alert.severity,
    anomalyTypes: parseJsonStringArray(alert.anomalyTypes),
    statusCode: alert.statusCode,
    responseTimeMs: alert.responseTimeMs,
    recordsReturned: alert.recordsReturned,
    evidence: parseEvidence(alert.evidence),
    title: alert.title,
    summary: alert.summary,
    likelyCause: alert.likelyCause,
    suggestedActions: parseJsonStringArray(alert.suggestedActions),
    severityExplanation: alert.severityExplanation,
    source: alert.source === "AI" ? "AI" : "FALLBACK",
    status: alert.status,
    fingerprint: alert.fingerprint,
    occurrenceCount: alert.occurrenceCount,
    lastObservedAt: alert.lastObservedAt.toISOString(),
    createdAt: alert.createdAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString(),
    resolvedAt: alert.resolvedAt ? alert.resolvedAt.toISOString() : null,
  };
}

function resolveObservedAt(observedAt: string | undefined): Date {
  if (!observedAt) return new Date();
  const parsed = new Date(observedAt);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Persist an anomalous observation as an Alert.
 * If an ACTIVE alert with the same fingerprint already exists, its occurrence
 * count is incremented and its observation fields are refreshed instead of
 * creating a duplicate. A fingerprint that only matches a RESOLVED alert
 * creates a new ACTIVE alert (re-alert after resolve).
 */
export async function recordAlert(
  db: PrismaClient,
  input: RecordAlertInput,
): Promise<AlertDto> {
  const { result, explained } = input;
  if (!result.isAnomalous || !result.severity) {
    throw new Error("recordAlert requires an anomalous evaluation result");
  }
  const { observation } = result;
  const lastObservedAt = resolveObservedAt(observation.observed_at);

  const existing = await db.alert.findFirst({
    where: { fingerprint: result.fingerprint, status: "ACTIVE" },
  });

  if (existing) {
    const updated = await db.alert.update({
      where: { id: existing.id },
      data: {
        occurrenceCount: { increment: 1 },
        lastObservedAt,
        statusCode: observation.status_code,
        responseTimeMs: observation.response_time_ms,
        recordsReturned: observation.records_returned,
        evidence: JSON.stringify(result.findings),
      },
    });
    return toAlertDto(updated);
  }

  const created = await db.alert.create({
    data: {
      apiName: observation.api_name,
      severity: result.severity,
      anomalyTypes: JSON.stringify(result.findings.map((f) => f.anomaly_type)),
      statusCode: observation.status_code,
      responseTimeMs: observation.response_time_ms,
      recordsReturned: observation.records_returned,
      evidence: JSON.stringify(result.findings),
      title: explained.explanation.title,
      summary: explained.explanation.summary,
      likelyCause: explained.explanation.likely_cause,
      suggestedActions: JSON.stringify(explained.explanation.suggested_actions),
      severityExplanation: explained.explanation.severity_explanation,
      source: explained.source,
      fingerprint: result.fingerprint,
      lastObservedAt,
    },
  });
  return toAlertDto(created);
}

export async function listAlerts(
  db: PrismaClient,
  options: ListAlertsOptions = {},
): Promise<ListAlertsResult> {
  const where: Prisma.AlertWhereInput = {
    ...(options.status ? { status: options.status } : {}),
    ...(options.severity ? { severity: options.severity } : {}),
    ...(options.apiName ? { apiName: options.apiName } : {}),
  };
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const [items, total] = await Promise.all([
    db.alert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.alert.count({ where }),
  ]);

  return { items: items.map(toAlertDto), total };
}

export async function getAlertById(
  db: PrismaClient,
  id: string,
): Promise<AlertDto | null> {
  const alert = await db.alert.findUnique({ where: { id } });
  return alert ? toAlertDto(alert) : null;
}

export async function resolveAlert(
  db: PrismaClient,
  id: string,
): Promise<AlertDto | null> {
  const alert = await db.alert.findUnique({ where: { id } });
  if (!alert) return null;
  if (alert.status === "RESOLVED") return toAlertDto(alert);
  const updated = await db.alert.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
    },
  });
  return toAlertDto(updated);
}
