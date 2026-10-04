// Same reasoning as crashAlertDedupe.ts: a mutual-aid ping can reach a
// rider over both push and the pending-replay poll at once, carrying the
// same ping_id. Whichever arrives first opens the screen.
const seen = new Set<string>();
const MAX_REMEMBERED = 50;

export function shouldHandleMutualAidPing(pingId: string | undefined | null): boolean {
  if (!pingId) return true;
  if (seen.has(pingId)) return false;
  seen.add(pingId);
  if (seen.size > MAX_REMEMBERED) {
    const oldest = seen.values().next().value;
    if (oldest !== undefined) seen.delete(oldest);
  }
  return true;
}
