import { useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "../api/client";
import { MutualAidPing } from "../types";
import { openMutualAidAlert } from "./openMutualAidAlert";

// 2s, not 10s: this is the only delivery path while push notifications
// aren't wired up (no EAS project linked yet — see pushNotifications.ts),
// so the poll interval IS the alert latency. A nearby rider being paged
// about a crash needs to find out in the next couple seconds, not
// whenever a slower background-safety-net poll happens to fire next.
const POLL_INTERVAL_MS = 2000;

/**
 * While the calling screen (rider home) is focused, every 2 seconds: open
 * any mutual-aid ping this rider hasn't responded to yet
 * (GET /mutual-aid/pending). Same safety-net role as
 * usePendingAlertReplay — catches a ping whose push notification never
 * registered (no dev build, backgrounded, etc).
 */
export function useMutualAidPendingReplay() {
  const router = useRouter();

  const check = useCallback(async () => {
    try {
      const pending = await api.get<MutualAidPing[]>("/mutual-aid/pending");
      for (const p of pending) {
        openMutualAidAlert(router, { ping_id: p.id });
      }
    } catch {
      // offline or transient — next tick
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      check();
      const timer = setInterval(check, POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [check])
  );
}
