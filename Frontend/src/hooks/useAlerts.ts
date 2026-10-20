import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchAlerts } from "../api/client";
import type { Alert } from "../types/alert";

export interface AlertsState {
  alerts: Alert[] | null;
  total: number;
  /** True only during the very first load (no data yet). */
  loading: boolean;
  /** True while re-fetching with data already on screen. */
  refreshing: boolean;
  error: string | null;
  lastUpdated: Date | null;
  reload: (isRefresh: boolean) => void;
}

/**
 * Subscribes to the alerts list. Loading state is derived from `started` +
 * `lastUpdated` rather than set inside the effect, so no setState is called
 * synchronously in the effect body (react-hooks/set-state-in-effect).
 */
export function useAlerts(limit = 100): AlertsState {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [total, setTotal] = useState(0);
  const [started, setStarted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const [isRefresh, setIsRefresh] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAlerts({ limit })
      .then((response) => {
        if (cancelled) return;
        setAlerts(response.alerts);
        setTotal(response.total);
        setError(null);
        setLastUpdated(new Date());
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : "Unexpected error while loading alerts";
        setError(message);
        if (!isRefresh) setAlerts(null);
      })
      .finally(() => {
        if (cancelled) return;
        setStarted(true);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick, isRefresh, limit]);

  const reload = useCallback((refresh: boolean) => {
    setIsRefresh(refresh);
    if (refresh) setRefreshing(true);
    setTick((t) => t + 1);
  }, []);

  const loading = !started && alerts === null && error === null;

  return { alerts, total, loading, refreshing, error, lastUpdated, reload };
}
