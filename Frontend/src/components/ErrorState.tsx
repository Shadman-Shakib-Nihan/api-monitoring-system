import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";

export default function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 py-16 text-center">
      <AlertTriangleIcon className="h-10 w-10 text-red-400" />
      <div>
        <p className="text-sm font-semibold text-red-800">Could not load alerts</p>
        <p className="mt-1 max-w-md text-sm text-red-700">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <RefreshCwIcon className="h-4 w-4" />
          Retry
        </button>
      )}
    </div>
  );
}
