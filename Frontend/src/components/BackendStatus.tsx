import { useEffect, useState } from "react";
import { checkHealth } from "../api/client";

type Status = "checking" | "up" | "down";

export default function BackendStatus() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        await checkHealth();
        if (!cancelled) setStatus("up");
      } catch {
        if (!cancelled) setStatus("down");
      }
    }

    check();
    const interval = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (status === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
        Checking backend…
      </span>
    );
  }

  if (status === "up") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Backend online
      </span>
    );
  }

  return (
    <span
      title="Is the backend running on port 4000?"
      className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Backend offline
    </span>
  );
}
