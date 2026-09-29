"""Event detection engine.

Turns a time-ordered stream of phone-sourced samples (GPS speed + IMU
accelerometer/gyroscope) into semantic ride events: harsh braking, harsh
acceleration, aggressive cornering, overspeed, crash-suspect.

Works with real device data. If accelerometer/gyro samples are missing for a
point, falls back to GPS-derived speed-delta acceleration so the engine still
functions on GPS-only phones.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime

# Thresholds tuned for real phone IMU data (units: g for accel, deg/s for gyro)
HARSH_BRAKE_G = 0.35        # longitudinal decel
HARSH_ACCEL_G = 0.30        # longitudinal accel
CORNER_LATERAL_G = 0.30     # lateral g while turning
CORNER_GYRO_DPS = 25.0      # yaw rate deg/s, used alongside lateral g
CRASH_DECEL_G = 0.8         # sudden decel/impact-like signature
CRASH_SPEED_DROP_KMH = 25.0  # speed collapse within CRASH_WINDOW_S
CRASH_WINDOW_S = 2.0
DEFAULT_SPEED_LIMIT_KMH = 50.0  # used when no road-context lookup is available


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


def detect_events(points: list, speed_limit_lookup=None) -> list[DetectedEvent]:
    """points: ordered list of objects with ts, lat, lon, speed_kmh,
    accel_x/y/z, gyro_x/y/z (any of the IMU fields may be None)."""

    events: list[DetectedEvent] = []
    speed_limit_lookup = speed_limit_lookup or _speed_limit_for

    overspeed_start = None
    for i in range(1, len(points)):
        prev, cur = points[i - 1], points[i]
        dt = (cur.ts - prev.ts).total_seconds()
        if dt <= 0:
            continue

        # --- longitudinal accel: prefer IMU, else derive from GPS speed delta ---
        long_g = None
        if cur.accel_y is not None:
            long_g = cur.accel_y
        elif cur.speed_kmh is not None and prev.speed_kmh is not None:
            dv_ms = (cur.speed_kmh - prev.speed_kmh) / 3.6
            long_g = (dv_ms / dt) / 9.81

        if long_g is not None:
            if long_g <= -HARSH_BRAKE_G:
                events.append(DetectedEvent(
                    event_type="harsh_brake",
                    severity=_severity_for(abs(long_g), HARSH_BRAKE_G),
                    ts=cur.ts, lat=cur.lat, lon=cur.lon,
                    peak_value=round(abs(long_g), 2), duration_s=round(dt, 2),
                    context={"speed_before_kmh": prev.speed_kmh},
                    coach_tip="Increase following distance and brake earlier.",
                ))
            elif long_g >= HARSH_ACCEL_G:
                events.append(DetectedEvent(
                    event_type="harsh_accel",
                    severity=_severity_for(long_g, HARSH_ACCEL_G),
                    ts=cur.ts, lat=cur.lat, lon=cur.lon,
                    peak_value=round(long_g, 2), duration_s=round(dt, 2),
                    context={"speed_after_kmh": cur.speed_kmh},
                    coach_tip="Ease off the throttle for smoother launches.",
                ))

        # --- cornering: lateral g and/or yaw rate ---
        lat_g = cur.accel_x
        yaw = cur.gyro_z
        if (lat_g is not None and abs(lat_g) >= CORNER_LATERAL_G) or (
            yaw is not None and abs(yaw) >= CORNER_GYRO_DPS
        ):
            peak = abs(lat_g) if lat_g is not None else abs(yaw) / 100
            events.append(DetectedEvent(
                event_type="cornering",
                severity=_severity_for(abs(lat_g) if lat_g is not None else 1, CORNER_LATERAL_G),
                ts=cur.ts, lat=cur.lat, lon=cur.lon,
                peak_value=round(peak, 2), duration_s=round(dt, 2),
                context={"yaw_rate_dps": yaw},
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
                        severity=_severity_for(cur.speed_kmh or limit, limit),
                        ts=overspeed_start, lat=prev.lat, lon=prev.lon,
                        peak_value=round(prev.speed_kmh or limit, 1), duration_s=round(dur, 2),
                        context={"speed_limit_kmh": limit},
                        coach_tip="Watch the posted limit through this stretch.",
                    ))
                overspeed_start = None

        # --- crash-suspect: large decel + near-total speed collapse in a short window ---
        if (
            long_g is not None
            and long_g <= -CRASH_DECEL_G
            and prev.speed_kmh
            and cur.speed_kmh is not None
            and (prev.speed_kmh - cur.speed_kmh) >= CRASH_SPEED_DROP_KMH
            and dt <= CRASH_WINDOW_S
        ):
            events.append(DetectedEvent(
                event_type="crash_suspect",
                severity="high",
                ts=cur.ts, lat=cur.lat, lon=cur.lon,
                peak_value=round(abs(long_g), 2), duration_s=round(dt, 2),
                context={"speed_before_kmh": prev.speed_kmh, "speed_after_kmh": cur.speed_kmh},
                coach_tip="Are you OK? SOS countdown started.",
            ))

    return events
