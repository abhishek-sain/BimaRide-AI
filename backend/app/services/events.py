"""Event detection engine.

Turns a time-ordered stream of phone-sourced GPS samples into semantic ride
events: harsh braking, harsh acceleration, aggressive cornering, overspeed,
crash-suspect.

Why GPS and not the raw accelerometer axes: a phone accelerometer reports
gravity too (~1 g spread across whichever axes point down for the way the
phone happens to be mounted). Treating one raw axis as "forward/back
acceleration" meant a stationary phone tilted in a mount read as a constant
+0.5 g — in real stored data, 478 high-severity "harsh acceleration" events
at ~0.8 g with an average speed of 0.5 km/h. Speed change and heading change
from GPS don't depend on orientation at all:

  longitudinal g = d(speed)/dt / 9.81
  lateral g      = speed * d(heading)/dt / 9.81   (centripetal)

The accelerometer/gyroscope columns are still stored on each point (useful
for a future impact-magnitude signal) but are not used for detection.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

HARSH_BRAKE_G = 0.35         # longitudinal decel
HARSH_ACCEL_G = 0.30         # longitudinal accel
CORNER_LATERAL_G = 0.30      # lateral g while turning
CORNER_MIN_SPEED_KMH = 10.0  # GPS heading is noise below walking pace
MAX_DT_S = 3.0               # a longer gap (lost signal) makes deltas meaningless
CRASH_SPEED_DROP_KMH = 25.0  # speed collapse within CRASH_WINDOW_S...
CRASH_WINDOW_S = 2.0
CRASH_MIN_PRE_SPEED_KMH = 30.0  # ...from a speed that was actually fast
DEFAULT_SPEED_LIMIT_KMH = 50.0  # used when no road-context lookup is available
G = 9.81


@dataclass
class DetectedEvent:
    event_type: str
    severity: str
    ts: datetime
    lat: float | None
    lon: float | None
    peak_value: float
    duration_s: float
    context: dict
    coach_tip: str


def _severity_for(value: float, threshold: float) -> str:
    ratio = value / threshold if threshold else 1
    if ratio >= 1.8:
        return "high"
    if ratio >= 1.2:
        return "medium"
    return "low"


def _speed_limit_for(lat: float | None, lon: float | None) -> float:
    # Placeholder for OSM/road-context lookup (see services/road_risk.py).
    return DEFAULT_SPEED_LIMIT_KMH


def _heading_delta_deg(a: float, b: float) -> float:
    """Shortest signed angle from a to b, in degrees (handles 359 -> 1)."""
    return (b - a + 540.0) % 360.0 - 180.0


def detect_events(points: list, speed_limit_lookup=None) -> list[DetectedEvent]:
    """points: ordered list of objects with ts, lat, lon, speed_kmh, heading
    (any may be None)."""

    events: list[DetectedEvent] = []
    speed_limit_lookup = speed_limit_lookup or _speed_limit_for

    overspeed_start = None
    for i in range(1, len(points)):
        prev, cur = points[i - 1], points[i]
        dt = (cur.ts - prev.ts).total_seconds()
        if dt <= 0:
            continue

        have_speeds = cur.speed_kmh is not None and prev.speed_kmh is not None
        long_g = None
        if have_speeds and dt <= MAX_DT_S:
            long_g = ((cur.speed_kmh - prev.speed_kmh) / 3.6 / dt) / G

        # --- crash-suspect: a fast vehicle losing >=25 km/h within 2 s ---
        if (
            have_speeds
            and dt <= CRASH_WINDOW_S
            and prev.speed_kmh >= CRASH_MIN_PRE_SPEED_KMH
            and (prev.speed_kmh - cur.speed_kmh) >= CRASH_SPEED_DROP_KMH
        ):
            events.append(DetectedEvent(
                event_type="crash_suspect",
                severity="high",
                ts=cur.ts, lat=cur.lat, lon=cur.lon,
                peak_value=round(abs(long_g or 0.0), 2), duration_s=round(dt, 2),
                context={"speed_before_kmh": prev.speed_kmh, "speed_after_kmh": cur.speed_kmh},
                coach_tip="Are you OK? Your emergency contact was alerted.",
            ))
        elif long_g is not None and long_g <= -HARSH_BRAKE_G:
            events.append(DetectedEvent(
                event_type="harsh_brake",
                severity=_severity_for(abs(long_g), HARSH_BRAKE_G),
                ts=cur.ts, lat=cur.lat, lon=cur.lon,
                peak_value=round(abs(long_g), 2), duration_s=round(dt, 2),
                context={"speed_before_kmh": prev.speed_kmh},
                coach_tip="Increase following distance and brake earlier.",
            ))
        elif long_g is not None and long_g >= HARSH_ACCEL_G:
            events.append(DetectedEvent(
                event_type="harsh_accel",
                severity=_severity_for(long_g, HARSH_ACCEL_G),
                ts=cur.ts, lat=cur.lat, lon=cur.lon,
                peak_value=round(long_g, 2), duration_s=round(dt, 2),
                context={"speed_after_kmh": cur.speed_kmh},
                coach_tip="Ease off the throttle for smoother launches.",
            ))

        # --- cornering: centripetal g from speed x heading change ---
        if (
            dt <= MAX_DT_S
            and cur.speed_kmh is not None
            and cur.speed_kmh >= CORNER_MIN_SPEED_KMH
            and cur.heading is not None
            and prev.heading is not None
        ):
            yaw_rate = abs(_heading_delta_deg(prev.heading, cur.heading)) / dt  # deg/s
            lat_g = (cur.speed_kmh / 3.6) * (yaw_rate * 3.141592653589793 / 180.0) / G
            if lat_g >= CORNER_LATERAL_G:
                events.append(DetectedEvent(
                    event_type="cornering",
                    severity=_severity_for(lat_g, CORNER_LATERAL_G),
                    ts=cur.ts, lat=cur.lat, lon=cur.lon,
                    peak_value=round(lat_g, 2), duration_s=round(dt, 2),
                    context={"yaw_rate_dps": round(yaw_rate, 1)},
                    coach_tip="Slow down before the corner, not during it.",
                ))

        # --- overspeed ---
        limit = speed_limit_lookup(cur.lat, cur.lon)
        if cur.speed_kmh is not None and cur.speed_kmh > limit:
            if overspeed_start is None:
                overspeed_start = cur.ts
        else:
            if overspeed_start is not None:
                dur = (cur.ts - overspeed_start).total_seconds()
                if dur >= 3.0:
                    events.append(DetectedEvent(
                        event_type="overspeed",
                        severity=_severity_for(prev.speed_kmh or limit, limit),
                        ts=overspeed_start, lat=prev.lat, lon=prev.lon,
                        peak_value=round(prev.speed_kmh or limit, 1), duration_s=round(dur, 2),
                        context={"speed_limit_kmh": limit},
                        coach_tip="Watch the posted limit through this stretch.",
                    ))
                overspeed_start = None

    return events
