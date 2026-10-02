import { useEffect, useState } from "react";
import { api } from "../api/client";
import { CrashAlertRecord } from "../types";

/**
 * Polls one alert every couple of seconds so each side can see what the
 * other did about it — the rider sees "Dad acknowledged", the contact sees
 * "Alex says they're OK". Polling rather than a socket on purpose: it works
 * identically in Expo Go, on a screen with no live socket, and after a
 * reconnect, and a 2s delay is fine for a human-to-human acknowledgement.
 */
export function useAlertStatus(alertId: string | null | undefined, intervalMs = 2000) {
  const [alert, setAlert] = useState<CrashAlertRecord | null>(null);

  useEffect(() => {
    if (!alertId) return;
    let cancelled = false;
    async function poll() {
      try {
        const data = await api.get<CrashAlertRecord>(`/alerts/${alertId}`);
        if (!cancelled) setAlert(data);
      } catch {
        // transient network error — try again on the next tick
      }
    }
    poll();
    const timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [alertId, intervalMs]);

  return alert;
}
