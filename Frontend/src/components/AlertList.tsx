import SeverityBadge from "./SeverityBadge";
import type { Alert } from "../types/alert";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatMs(ms: number | null): string {
  return ms === null ? "—" : `${ms.toLocaleString()} ms`;
}

function formatRecords(count: number | null): string {
  return count === null ? "—" : count.toLocaleString();
}

function StatusChip({ alert }: { alert: Alert }) {
  if (alert.status === "RESOLVED") {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        Resolved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
      Active
    </span>
  );
}

export default function AlertList({
  alerts,
  onSelect,
}: {
  alerts: Alert[];
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {/* Mobile: stacked cards */}
      <ul className="space-y-3 md:hidden">
        {alerts.map((alert) => (
          <li key={alert.id}>
            <button
              type="button"
              onClick={() => onSelect(alert.id)}
              className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-indigo-300 hover:shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{alert.apiName}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{alert.title}</p>
                </div>
                <SeverityBadge severity={alert.severity} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-slate-500">Status</dt>
                  <dd className="mt-0.5">
                    <StatusChip alert={alert} />
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Response time</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {formatMs(alert.responseTimeMs)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Records</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {formatRecords(alert.recordsReturned)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Occurrences</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {alert.occurrenceCount}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-500">First seen</dt>
                  <dd className="mt-0.5 text-slate-700">
                    {formatTimestamp(alert.createdAt)}
                  </dd>
                </div>
              </dl>
            </button>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">API</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Response time</th>
              <th className="px-4 py-3 text-right">Records</th>
              <th className="px-4 py-3 text-right">Occurrences</th>
              <th className="px-4 py-3">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {alerts.map((alert) => (
              <tr
                key={alert.id}
                tabIndex={0}
                role="button"
                aria-label={`Open alert for ${alert.apiName}`}
                onClick={() => onSelect(alert.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(alert.id);
                  }
                }}
                className="cursor-pointer outline-none hover:bg-slate-50 focus-visible:bg-slate-100"
              >
                <td className="px-4 py-3">
                  <SeverityBadge severity={alert.severity} />
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{alert.apiName}</p>
                  <p className="max-w-xs truncate text-xs text-slate-500">
                    {alert.title}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <StatusChip alert={alert} />
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-800">
                  {formatMs(alert.responseTimeMs)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-800">
                  {formatRecords(alert.recordsReturned)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-800">
                  {alert.occurrenceCount}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatTimestamp(alert.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
