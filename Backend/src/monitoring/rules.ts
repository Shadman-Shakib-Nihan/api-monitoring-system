import { createHash } from "crypto";
import type { AppConfig } from "../config/index.js";
import type { AnomalyType, ApiObservation, EvaluationResult, Finding, Severity } from "./types.js";
import { SEVERITY_RANK } from "./types.js";

export interface RuleEngineOptions {
  warningMs: number;
  criticalMs: number;
  emptyResultAllowedApis: Set<string>;
}

export function ruleEngineOptionsFromConfig(config: AppConfig): RuleEngineOptions {
  return {
    warningMs: config.thresholds.warningMs,
    criticalMs: config.thresholds.criticalMs,
    emptyResultAllowedApis: config.thresholds.emptyResultAllowedApis,
  };
}

export function highestSeverity(findings: Finding[]): Severity | null {
  let best: Severity | null = null;
  for (const f of findings) {
    if (!best || SEVERITY_RANK[f.severity] > SEVERITY_RANK[best]) best = f.severity;
  }
  return best;
}

/**
 * Stable fingerprint for deduplicating repeated occurrences of the same active issue.
 * Status codes are bucketed (5xx / 4xx / 429) so variations of the same class of
 * failure group together; observed latency/record values are intentionally excluded
 * so repeated slow/empty responses of the same API group together.
 */
export function computeFingerprint(
  apiName: string,
  findings: Pick<Finding, "anomaly_type" | "observed">[],
  statusCode: number,
): string {
  const types = findings
    .map((f) => f.anomaly_type)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .sort()
    .join(",");

  let statusBucket = "OK";
  if (statusCode >= 500) statusBucket = "5xx";
  else if (statusCode === 429) statusBucket = "429";
  else if (statusCode >= 400) statusBucket = "4xx";

  const raw = `${apiName}|${types}|${statusBucket}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function checkHttpStatus(o: ApiObservation, findings: Finding[]): void {
  if (o.status_code >= 500) {
    findings.push({
      anomaly_type: "HTTP_SERVER_ERROR",
      severity: "CRITICAL",
      observed: o.status_code,
      expected: "HTTP status < 500 (successful or client-side response)",
      evidence: `API "${o.api_name}" returned HTTP ${o.status_code}, a server-side error status. 5xx responses indicate the server failed to process the request.`,
    });
  } else if (o.status_code === 429) {
    findings.push({
      anomaly_type: "RATE_LIMITED",
      severity: "WARNING",
      observed: 429,
      expected: "HTTP status other than 429 (not rate limited)",
      evidence: `API "${o.api_name}" returned HTTP 429 (Too Many Requests), indicating rate limiting is in effect.`,
    });
  } else if (o.status_code >= 400) {
    findings.push({
      anomaly_type: "HTTP_CLIENT_ERROR",
      severity: "WARNING",
      observed: o.status_code,
      expected: "HTTP status < 400 (successful response)",
      evidence: `API "${o.api_name}" returned HTTP ${o.status_code}, a client-side error status. The request was rejected or could not be fulfilled as sent.`,
    });
  }
}

function checkLatency(o: ApiObservation, opts: RuleEngineOptions, findings: Finding[]): void {
  if (o.response_time_ms > opts.criticalMs) {
    findings.push({
      anomaly_type: "LATENCY_CRITICAL",
      severity: "CRITICAL",
      observed: o.response_time_ms,
      expected: `Response time <= ${opts.criticalMs} ms (critical threshold)`,
      evidence: `API "${o.api_name}" responded in ${o.response_time_ms} ms, exceeding the critical latency threshold of ${opts.criticalMs} ms.`,
    });
  } else if (o.response_time_ms > opts.warningMs) {
    findings.push({
      anomaly_type: "LATENCY_WARNING",
      severity: "WARNING",
      observed: o.response_time_ms,
      expected: `Response time <= ${opts.warningMs} ms (warning threshold)`,
      evidence: `API "${o.api_name}" responded in ${o.response_time_ms} ms, exceeding the warning latency threshold of ${opts.warningMs} ms.`,
    });
  }
}

/**
 * Zero-records rule.
 * - Only applies to successful responses (status < 400): a failed request
 *   already explains an empty payload and would otherwise produce noisy duplicates.
 * - Skipped entirely for API names explicitly configured as "empty results allowed",
 *   so e.g. a health-check API returning 0 records is not alerted on.
 */
function checkUnexpectedEmpty(
  o: ApiObservation,
  opts: RuleEngineOptions,
  findings: Finding[],
): void {
  if (o.status_code >= 400) return;
  if (opts.emptyResultAllowedApis.has(o.api_name)) return;
  if (o.records_returned === 0) {
    findings.push({
      anomaly_type: "EMPTY_RESPONSE",
      severity: "WARNING",
      observed: 0,
      expected: "At least 1 record (this API is expected to return data)",
      evidence: `API "${o.api_name}" returned HTTP ${o.status_code} but delivered 0 records. The API is configured as expected to return data, so an empty payload is suspicious.`,
    });
  }
}

export function evaluateObservation(
  observation: ApiObservation,
  opts: RuleEngineOptions,
): EvaluationResult {
  const findings: Finding[] = [];
  checkHttpStatus(observation, findings);
  checkLatency(observation, opts, findings);
  checkUnexpectedEmpty(observation, opts, findings);

  const severity = highestSeverity(findings);
  const fingerprint = computeFingerprint(observation.api_name, findings, observation.status_code);

  return {
    observation,
    findings,
    isAnomalous: findings.length > 0,
    severity,
    fingerprint,
  };
}

export function evaluateBatch(
  observations: ApiObservation[],
  opts: RuleEngineOptions,
): EvaluationResult[] {
  return observations.map((o) => evaluateObservation(o, opts));
}

export const ANOMALY_TYPE_LABELS: Record<AnomalyType, string> = {
  HTTP_SERVER_ERROR: "HTTP server error (5xx)",
  RATE_LIMITED: "Rate limited (HTTP 429)",
  HTTP_CLIENT_ERROR: "HTTP client error (4xx)",
  LATENCY_WARNING: "Slow response (warning)",
  LATENCY_CRITICAL: "Slow response (critical)",
  EMPTY_RESPONSE: "Unexpected empty result set",
};
