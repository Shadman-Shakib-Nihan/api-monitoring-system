import { InboxIcon } from "lucide-react";

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
      <InboxIcon className="h-10 w-10 text-slate-400" />
      <div>
        <p className="text-sm font-semibold text-slate-700">No alerts yet</p>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          Alerts appear here when monitored observations trigger the anomaly
          rules. Submit observations via <code className="rounded bg-slate-100 px-1">POST /monitor</code>.
        </p>
      </div>
    </div>
  );
}
