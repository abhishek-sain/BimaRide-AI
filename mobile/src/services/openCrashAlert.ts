import { useRouter } from "expo-router";
import { shouldHandleCrashAlert } from "./crashAlertDedupe";

type AppRouter = ReturnType<typeof useRouter>;

export interface CrashAlertLike {
  alert_id?: string;
  id?: string;
  kind?: string;
  trip_id?: string;
  rider_name?: string;
  lat?: number | null;
  lon?: number | null;
  speed_kmh?: number | null;
}

/**
 * The one way every entry point (push tap, live-map socket, home-screen
 * replay poll) opens the alarm screen. Returns false — and does nothing —
 * if this alert was already opened, whichever channel got there first.
 */
export function openCrashAlert(router: AppRouter, alert: CrashAlertLike): boolean {
  const alertId = alert.alert_id ?? alert.id;
  if (!shouldHandleCrashAlert(alertId)) return false;
  const params = new URLSearchParams({
    alertId: alertId ?? "",
    kind: alert.kind ?? "crash",
    riderName: alert.rider_name ?? "Rider",
    lat: alert.lat != null ? String(alert.lat) : "",
    lon: alert.lon != null ? String(alert.lon) : "",
    speedKmh: alert.speed_kmh != null ? String(alert.speed_kmh) : "",
    tripId: alert.trip_id ?? "",
  });
  router.push(`/crash-alert?${params.toString()}`);
  return true;
}
