import { useRouter } from "expo-router";
import { shouldHandleFallAlert } from "./fallAlertDedupe";

type AppRouter = ReturnType<typeof useRouter>;

export interface FallAlertLike {
  alert_id?: string;
  id?: string;
  rider_name?: string;
}

/** The one way every entry point (push tap, home-screen replay poll) opens
 * the fall-alert screen. Returns false — and does nothing — if this alert
 * was already opened. */
export function openFallAlert(router: AppRouter, alert: FallAlertLike): boolean {
  const alertId = alert.alert_id ?? alert.id;
  if (!shouldHandleFallAlert(alertId)) return false;
  const params = new URLSearchParams({ alertId: alertId ?? "", riderName: alert.rider_name ?? "Rider" });
  router.push(`/fall-alert?${params.toString()}`);
  return true;
}
