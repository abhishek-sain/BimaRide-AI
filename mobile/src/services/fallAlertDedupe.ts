// Same reasoning as crashAlertDedupe.ts: a fall alert can reach a contact
// over both push and the pending-replay poll at once, carrying the same
// alert id. Whichever arrives first opens the screen.
const seen = new Set<string>();
const MAX_REMEMBERED = 50;

export function shouldHandleFallAlert(alertId: string | undefined | null): boolean {
  if (!alertId) return true;
  if (seen.has(alertId)) return false;
  seen.add(alertId);
  if (seen.size > MAX_REMEMBERED) {
    const oldest = seen.values().next().value;
    if (oldest !== undefined) seen.delete(oldest);
  }
  return true;
}
