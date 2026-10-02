// A crash alert can reach a contact on two channels at once — the live-map
// WebSocket and (in a development/production build) a push notification —
// each carrying the same `alert_id`. Whichever arrives first opens the
// alarm screen; this lets the second one be recognised and ignored instead
// of stacking a second alarm (two sirens, two vibration loops) on top.
const seen = new Set<string>();
const MAX_REMEMBERED = 50;

/** Returns true the first time an alert id is seen, false for repeats.
 * Alerts without an id are always handled (can't be de-duplicated). */
export function shouldHandleCrashAlert(alertId: string | undefined | null): boolean {
  if (!alertId) return true;
  if (seen.has(alertId)) return false;
  seen.add(alertId);
  if (seen.size > MAX_REMEMBERED) {
    const oldest = seen.values().next().value;
    if (oldest !== undefined) seen.delete(oldest);
  }
  return true;
}
