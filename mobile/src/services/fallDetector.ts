// Detects a free-fall-then-impact signature — the phone (and likely its
// rider) being dropped from a height — distinct from the GPS-speed-based
// crash_suspect detection in localRules.ts, which needs a real, sustained
// drop in recorded speed and can miss a fall that's too fast or too local
// for 1Hz GPS to resolve (a rider going down at a stoplight, a phone
// flying off the bike mid-fall). Runs on every raw accelerometer sample
// (10Hz, see rideRecorder.ts), independent of the GPS-driven event loop,
// so it reacts in a couple hundred milliseconds instead of waiting for
// the next location fix.
//
// Classic two-phase signature used by phone/wearable fall detection:
//   1. Free fall: total accel magnitude drops near zero — the phone is
//      briefly weightless while falling, since gravity is the only force
//      acting on it and the accelerometer can't feel gravity in free fall.
//   2. Impact: within a short window after that, a sharp g-force spike as
//      it hits the ground/rider hits the road.
// Either phase alone is too common to be reliable on its own (free fall
// alone = you set the phone down quickly; a g-spike alone = you tapped
// the table) — it's the SEQUENCE, in order, that's distinctive.
//
// rideRecorder.ts's accelerometer samples are already unitless "g" values
// (1.0 == 9.81 m/s^2, gravity included) — no conversion needed here.

export const FREE_FALL_G = 0.5; // magnitude below this ~= weightless
export const FREE_FALL_MIN_SAMPLES = 2; // ~200ms at 10Hz — short falls still count
export const IMPACT_G = 2.5; // sharp spike on landing
export const IMPACT_WINDOW_MS = 1000; // impact must follow free fall within this
export const COOLDOWN_MS = 10000; // don't re-trigger on the same event's aftershocks

type State = "idle" | "falling" | "watching_impact";

export class FallDetector {
  private state: State = "idle";
  private freeFallSamples = 0;
  private fallEndedAt = 0;
  private cooldownUntil = 0;

  /** Feed one accelerometer sample (in g). Returns true the instant a
   * fall-then-impact is detected — fires once per event, not once per
   * sample, thanks to the cooldown. */
  ingest(x: number, y: number, z: number, now: number = Date.now()): boolean {
    if (now < this.cooldownUntil) return false;

    const magnitude = Math.sqrt(x * x + y * y + z * z);
    const isFreeFall = magnitude < FREE_FALL_G;
    const isImpact = magnitude >= IMPACT_G;

    switch (this.state) {
      case "idle":
        if (isFreeFall) {
          this.freeFallSamples = 1;
          this.state = "falling";
        }
        return false;

      case "falling":
        if (isFreeFall) {
          this.freeFallSamples += 1;
          return false;
        }
        if (this.freeFallSamples < FREE_FALL_MIN_SAMPLES) {
          // Too short to count as a real fall (a quick dip, not a drop).
          this.state = "idle";
          this.freeFallSamples = 0;
          return false;
        }
        if (isImpact) {
          this.trigger(now);
          return true;
        }
        // Gravity reasserted itself but no impact yet — keep watching for
        // one, in case this sample landed between free fall and impact.
        this.fallEndedAt = now;
        this.state = "watching_impact";
        return false;

      case "watching_impact":
        if (isImpact) {
          this.trigger(now);
          return true;
        }
        if (now - this.fallEndedAt > IMPACT_WINDOW_MS) {
          this.state = "idle";
          this.freeFallSamples = 0;
        }
        return false;
    }
  }

  private trigger(now: number) {
    this.state = "idle";
    this.freeFallSamples = 0;
    this.cooldownUntil = now + COOLDOWN_MS;
  }
}
