import { useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "../api/client";
import { CrashAlertRecord } from "../types";
import { openCrashAlert } from "./openCrashAlert";

// 2s, not 5s: with push notifications not yet wired up (no EAS project
// linked — see pushNotifications.ts), this poll is the ONLY delivery path
// for a contact who isn't currently on the live-map screen watching the
// WebSocket. The poll interval directly is the alert latency in that case.
const POLL_INTERVAL_MS = 2000;

/**
 * While the calling screen is focused, every 2 seconds: open any unresolved
 * alert from a connected rider that this contact hasn't acknowledged
 * (GET /alerts/pending, last 30 minutes). This is the safety net behind the
 * live socket and push — it catches an alert raised while the app was
 * closed, offline, or the socket was mid-reconnect, and it's the only
 * path that needs nothing beyond plain HTTP (so it works in Expo Go).
 * `onTick` lets a screen piggy-back its own refresh on the same timer.
 */
export function usePendingAlertReplay(onTick?: () => void) {
  const router = useRouter();

  const check = useCallback(async () => {
    try {
      const pending = await api.get<CrashAlertRecord[]>("/alerts/pending");
      for (const a of pending) {
        openCrashAlert(router, {
          alert_id: a.id,
          kind: a.kind,
          trip_id: a.trip_id,
          rider_name: a.rider_name,
          lat: a.lat,
          lon: a.lon,
          speed_kmh: a.speed_kmh,
        });
      }
    } catch {
      // offline or transient — next tick
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      onTick?.();
      check();
      const timer = setInterval(() => {
        onTick?.();
        check();
      }, POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [check, onTick])
  );
}
