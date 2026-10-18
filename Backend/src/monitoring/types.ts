export type Severity = "WARNING" | "CRITICAL";

export const SEVERITY_RANK: Record<Severity, number> = { WARNING: 1, CRITICAL: 2 };

export type AnomalyType =
  | "HTTP_SERVER_ERROR"
  | "RATE_LIMITED"
  | "HTTP_CLIENT_ERROR"
  | "LATENCY_WARNING"
  | "LATENCY_CRITICAL"
  | "EMPTY_RESPONSE";

export interface ApiObservation {
  api_name: string;
  response_time_ms: number;
  status_code: number;
  records_returned: number;
  observed_at?: string;
}

export interface Finding {
  anomaly_type: AnomalyType;
  severity: Severity;
  observed: number | string;
  expected: string;
  evidence: string;
}

export interface EvaluationResult {
  observation: ApiObservation;
  findings: Finding[];
  isAnomalous: boolean;
  severity: Severity | null;
  fingerprint: string;
}

export interface AlertExplanation {
  title: string;
  summary: string;
  likely_cause: string;
  suggested_actions: string[];
  severity_explanation: string;
}

export type ExplanationSource = "AI" | "FALLBACK";

export interface ExplainedAlert {
  explanation: AlertExplanation;
  source: ExplanationSource;
}
