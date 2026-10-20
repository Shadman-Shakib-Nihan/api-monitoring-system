import { RefreshCwIcon } from "lucide-react";
import { useAlerts } from "../hooks/useAlerts";
import AlertList from "../components/AlertList";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${accent ?? "text-slate-900"}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export default function DashboardPage({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const { alerts, total, loading, refreshing, error, lastUpdated, reload } =
    useAlerts(100);

  const activeAlerts = alerts?.filter((a) => a.status === "ACTIVE") ?? [];
  const criticalActive = activeAlerts.filter((a) => a.severity === "CRITICAL");
  const resolvedCount = (alerts ?? []).filter((a) => a.status === "RESOLVED").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Alerts</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {lastUpdated
              ? `Last updated ${lastUpdated.toLocaleTimeString()}`
              : "Loading alert data…"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => reload(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCwIcon className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total alerts" value={total} />
        <SummaryCard
          label="Active"
          value={activeAlerts.length}
          accent="text-blue-700"
        />
        <SummaryCard
          label="Critical (active)"
          value={criticalActive.length}
          accent="text-red-600"
        />
        <SummaryCard label="Resolved" value={resolvedCount} />
      </div>

      {loading && <LoadingState label="Loading alerts…" />}

      {!loading && error && (
        <ErrorState message={error} onRetry={() => reload(false)} />
      )}

      {!loading && !error && alerts !== null && alerts.length === 0 && <EmptyState />}

      {!loading && !error && alerts !== null && alerts.length > 0 && (
        <AlertList alerts={alerts} onSelect={onSelect} />
      )}
    </div>
  );
}
