import { useRouter } from "expo-router";
import { shouldHandleMutualAidPing } from "./mutualAidDedupe";

type AppRouter = ReturnType<typeof useRouter>;

export interface MutualAidPingLike {
  ping_id?: string;
  id?: string;
}

/** The one way every entry point (push tap, home-screen replay poll) opens
 * the mutual-aid screen. Returns false — and does nothing — if this ping
 * was already opened. */
export function openMutualAidAlert(router: AppRouter, ping: MutualAidPingLike): boolean {
  const pingId = ping.ping_id ?? ping.id;
  if (!shouldHandleMutualAidPing(pingId)) return false;
  router.push(`/mutual-aid-alert?pingId=${pingId}`);
  return true;
}
