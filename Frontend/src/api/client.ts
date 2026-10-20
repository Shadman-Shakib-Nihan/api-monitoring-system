import type { ApiErrorDetail, HealthResponse, ListAlertsResponse } from "../types/alert";

const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4000";

const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  readonly status: number;
  readonly details: ApiErrorDetail[] | undefined;

  constructor(status: number, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function apiBaseUrl(): string {
  return BASE_URL;
}

async function request<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const record = body as { message?: string; details?: ApiErrorDetail[] } | null;
      throw new ApiError(
        res.status,
        record?.message ?? `Request failed with status ${res.status}`,
        record?.details,
      );
    }
    return body as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Request timed out. Is the backend running?");
    }
    throw new ApiError(0, err instanceof Error ? err.message : "Network error");
  } finally {
    clearTimeout(timer);
  }
}

export function fetchAlerts(params?: {
  status?: string;
  severity?: string;
  limit?: number;
}): Promise<ListAlertsResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.severity) query.set("severity", params.severity);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return request<ListAlertsResponse>(`/alerts${qs ? `?${qs}` : ""}`);
}

export function checkHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health", 5_000);
}
