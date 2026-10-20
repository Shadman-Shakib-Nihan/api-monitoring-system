export type Severity = "WARNING" | "CRITICAL";
export type AlertStatus = "ACTIVE" | "RESOLVED";
export type ExplanationSource = "AI" | "FALLBACK";

export interface Finding {
  anomaly_type: string;
  severity: Severity;
  observed: number | string;
  expected: string;
  evidence: string;
}

export interface Alert {
  id: string;
  apiName: string;
  severity: Severity;
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
  status: AlertStatus;
  fingerprint: string;
  occurrenceCount: number;
  lastObservedAt: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface ListAlertsResponse {
  status: "ok";
  total: number;
  alerts: Alert[];
}

export interface HealthResponse {
  status: "ok" | string;
  message: string;
}

export interface ApiErrorDetail {
  path: string;
  message: string;
}
