// On-device rule engine — a JS mirror of backend/app/services/events.py and
// scoring.py. Gives the rider an instant live score during the ride; the
// backend recomputes authoritatively (source of truth) when the trip ends.
import { TripPointOut } from "../types";

// Detection is GPS-derived (speed change and heading change), NOT from the raw
// accelerometer axes — those include gravity and depend on how the phone is
// mounted, which produced constant false "harsh acceleration" events on a
// stationary phone. See backend/app/services/events.py for the full reasoning;
// the two files must stay in sync.
export const HARSH_BRAKE_G = 0.35;
export const HARSH_ACCEL_G = 0.3;
export const CORNER_LATERAL_G = 0.3;
export const CORNER_MIN_SPEED_KMH = 10.0;
export const MAX_DT_S = 3.0;
export const CRASH_SPEED_DROP_KMH = 25.0;
export const CRASH_WINDOW_S = 2.0;
export const CRASH_MIN_PRE_SPEED_KMH = 30.0;
export const DEFAULT_SPEED_LIMIT_KMH = 50.0;
const G = 9.81;

export type LocalEventType =
  | "harsh_brake"
  | "harsh_accel"
  | "cornering"
  | "overspeed"
  | "crash_suspect";

export interface LocalEvent {
  type: LocalEventType;
  ts: number;
  peakValue: number;
}

export interface LiveState {
  events: LocalEvent[];
  distanceKm: number;
  overspeedSeconds: number;
  provisionalScore: number;
}

export function emptyState(): LiveState {
  return { events: [], distanceKm: 0, overspeedSeconds: 0, provisionalScore: 100 };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Processes the newest point against the previous one, mutates and
 * returns a new LiveState plus any event just detected (for UI toasts / SOS). */
export function stepLiveState(
  prev: TripPointOut | null,
  cur: TripPointOut,
  state: LiveState
): { state: LiveState; newEvent: LocalEvent | null; crashDetected: boolean } {
  const events = state.events;
  let distanceKm = state.distanceKm;
  let overspeedSeconds = state.overspeedSeconds;
  let newEvent: LocalEvent | null = null;
  let crashDetected = false;

  if (!prev) return { state, newEvent, crashDetected };

  const dt = (new Date(cur.ts).getTime() - new Date(prev.ts).getTime()) / 1000;
  if (dt <= 0) return { state, newEvent, crashDetected };

  if (prev.lat != null && prev.lon != null && cur.lat != null && cur.lon != null) {
    distanceKm += haversineKm(prev.lat, prev.lon, cur.lat, cur.lon);
  }

  const haveSpeeds = cur.speed_kmh != null && prev.speed_kmh != null;
  let longG: number | null = null;
  if (haveSpeeds && dt <= MAX_DT_S) {
    longG = ((cur.speed_kmh! - prev.speed_kmh!) / 3.6 / dt) / G;
  }

  if (
    haveSpeeds &&
    dt <= CRASH_WINDOW_S &&
    prev.speed_kmh! >= CRASH_MIN_PRE_SPEED_KMH &&
    prev.speed_kmh! - cur.speed_kmh! >= CRASH_SPEED_DROP_KMH
  ) {
    crashDetected = true;
    newEvent = { type: "crash_suspect", ts: Date.now(), peakValue: Math.abs(longG ?? 0) };
  } else if (longG != null && longG <= -HARSH_BRAKE_G) {
    newEvent = { type: "harsh_brake", ts: Date.now(), peakValue: Math.abs(longG) };
  } else if (longG != null && longG >= HARSH_ACCEL_G) {
    newEvent = { type: "harsh_accel", ts: Date.now(), peakValue: longG };
  }

  // Cornering: centripetal g from speed x heading change.
  if (
    !newEvent &&
    dt <= MAX_DT_S &&
    cur.speed_kmh != null &&
    cur.speed_kmh >= CORNER_MIN_SPEED_KMH &&
    cur.heading != null &&
    prev.heading != null
  ) {
    const dHeading = Math.abs(((cur.heading - prev.heading + 540) % 360) - 180);
    const yawRateRad = ((dHeading / dt) * Math.PI) / 180;
    const latG = ((cur.speed_kmh / 3.6) * yawRateRad) / G;
    if (latG >= CORNER_LATERAL_G) {
      newEvent = { type: "cornering", ts: Date.now(), peakValue: latG };
    }
  }

  if (cur.speed_kmh != null && cur.speed_kmh > DEFAULT_SPEED_LIMIT_KMH) {
    overspeedSeconds += dt;
  }

  if (newEvent) events.push(newEvent);

  // Cheap live-score estimate: start at 100, deduct per severity, floor at 0.
  const penalty =
    events.filter((e) => e.type === "harsh_brake").length * 3 +
    events.filter((e) => e.type === "harsh_accel").length * 2 +
    events.filter((e) => e.type === "cornering").length * 2 +
    events.filter((e) => e.type === "crash_suspect").length * 20 +
    Math.min(20, overspeedSeconds / 3);
  const provisionalScore = Math.max(0, Math.round(100 - penalty));

  return {
    state: { events, distanceKm, overspeedSeconds, provisionalScore },
    newEvent,
    crashDetected,
  };
}
