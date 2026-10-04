import { useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "../api/client";
import { FallAlertRecord } from "../types";
import { openFallAlert } from "./openFallAlert";

// 2s, not 5s — see usePendingAlertReplay.ts for why: with push not yet
// wired up, this poll interval directly is the alert latency.
const POLL_INTERVAL_MS = 2000;

/**
 * Same safety-net role as usePendingAlertReplay, for standalone fall
 * alerts (GET /safety/pending) instead of trip-scoped crash alerts —
 * catches one that arrived while this contact's app was closed, offline,
 * or push wasn't registered.
 */
export function usePendingFallAlertReplay(onTick?: () => void) {
  const router = useRouter();

  const check = useCallback(async () => {
    try {
      const pending = await api.get<FallAlertRecord[]>("/safety/pending");
      for (const a of pending) {
        openFallAlert(router, { alert_id: a.id, rider_name: a.rider_name });
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
