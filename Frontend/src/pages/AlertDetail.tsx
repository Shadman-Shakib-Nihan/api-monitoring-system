import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { ApiError, fetchAlert, resolveAlert } from "../api/client";
import type { Alert } from "../types/alert";
import SeverityBadge from "../components/SeverityBadge";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";

function formatTimestamp(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-40 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  );
}

export default function AlertDetail({
  alertId,
  onBack,
}: {
  alertId: string;
  onBack: () => void;
}) {
  const [alert, setAlert] = useState<Alert | null>(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Fetch runs in the effect; all setState happens in promise callbacks
  // (react-hooks/set-state-in-effect forbids synchronous setState here).
  useEffect(() => {
    let cancelled = false;
    fetchAlert(alertId)
      .then((data) => {
        if (cancelled) return;
        setAlert(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Unexpected error while loading alert",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setStarted(true);
      });
    return () => {
      cancelled = true;
    };
  }, [alertId, tick]);

  const loading = !started && alert === null && error === null;

  const retry = useCallback(() => {
    setError(null);
    setStarted(false);
    setTick((t) => t + 1);
  }, []);

  const handleResolve = useCallback(async () => {
    setResolving(true);
    setResolveError(null);
    try {
      const updated = await resolveAlert(alertId);
      setAlert(updated);
    } catch (err) {
      setResolveError(
        err instanceof ApiError ? err.message : "Unexpected error while resolving",
      );
    } finally {
      setResolving(false);
    }
  }, [alertId]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to alerts
      </button>

      {loading && <LoadingState label="Loading alert…" />}

      {!loading && error && <ErrorState message={error} onRetry={retry} />}

      {!loading && !error && alert && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={alert.severity} />
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      alert.status === "RESOLVED"
                        ? "bg-slate-100 text-slate-600"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {alert.status === "RESOLVED" ? "Resolved" : "Active"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                    <SparklesIcon className="h-3 w-3" />
                    {alert.source === "AI" ? "AI explanation" : "Rule-based"}
                  </span>
                </div>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">
                  {alert.title}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">{alert.summary}</p>
              </div>
              {alert.status === "ACTIVE" && (
                <button
                  type="button"
                  onClick={() => void handleResolve()}
                  disabled={resolving}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2Icon className="h-4 w-4" />
                  {resolving ? "Resolving…" : "Resolve"}
                </button>
              )}
            </div>
            {resolveError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {resolveError}
              </p>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Analysis
              </h3>
              <dl className="mt-2">
                <DetailRow label="Likely cause" value={alert.likelyCause} />
                <DetailRow label="Severity rationale" value={alert.severityExplanation} />
                <DetailRow label="Anomaly types" value={alert.anomalyTypes.join(", ") || "—"} />
                <DetailRow label="Occurrences" value={String(alert.occurrenceCount)} />
                <DetailRow label="First seen" value={formatTimestamp(alert.createdAt)} />
                <DetailRow label="Last observed" value={formatTimestamp(alert.lastObservedAt)} />
                <DetailRow
                  label="Resolved at"
                  value={formatTimestamp(alert.resolvedAt)}
                />
              </dl>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Suggested actions
                </h3>
                {alert.suggestedActions.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">None provided.</p>
                ) : (
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
                    {alert.suggestedActions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Evidence
                </h3>
                {alert.evidence.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No evidence recorded.</p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {alert.evidence.map((finding, index) => (
                      <li
                        key={`${finding.anomaly_type}-${index}`}
                        className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-800">
                            {finding.anomaly_type}
                          </span>
                          <SeverityBadge severity={finding.severity} />
                        </div>
                        <p className="mt-1 text-sm text-slate-700">{finding.evidence}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Observed: {String(finding.observed)} · Expected:{" "}
                          {finding.expected}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Observation
              </h3>
              <button
                type="button"
                onClick={retry}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                <RefreshCwIcon className="h-4 w-4" />
                Reload
              </button>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
              <DetailRow label="API name" value={alert.apiName} />
              <DetailRow label="Status code" value={String(alert.statusCode ?? "—")} />
              <DetailRow
                label="Response time"
                value={alert.responseTimeMs === null ? "—" : `${alert.responseTimeMs} ms`}
              />
              <DetailRow
                label="Records"
                value={alert.recordsReturned === null ? "—" : String(alert.recordsReturned)}
              />
            </dl>
          </div>
        </>
      )}
    </div>
  );
}
