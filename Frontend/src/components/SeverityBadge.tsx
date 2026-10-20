import type { Severity } from "../types/alert";

const STYLES: Record<Severity, string> = {
  CRITICAL: "bg-red-100 text-red-800 ring-red-200",
  WARNING: "bg-amber-100 text-amber-800 ring-amber-200",
};

const DOT: Record<Severity, string> = {
  CRITICAL: "bg-red-500",
  WARNING: "bg-amber-500",
};

export default function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STYLES[severity]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[severity]}`} />
      {severity}
    </span>
  );
}
