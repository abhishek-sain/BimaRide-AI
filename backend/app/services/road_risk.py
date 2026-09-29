"""Road-risk context scoring.

Placeholder implementation using deterministic heuristics keyed off
time-of-day and a tiny in-memory "accident zone" table, so the score
pipeline works end-to-end without external API keys. Swap `lookup_context`
for real OSM / weather / accident-density APIs when available — the
interface (return a 0-100 "safer=higher" score) does not need to change.
"""

from __future__ import annotations

from datetime import datetime

# A few illustrative high-risk zones (lat, lon, radius_km) — replace with a
# real accident-density dataset (e.g. MoRTH / city police open data).
ACCIDENT_ZONES: list[tuple[float, float, float]] = []


def _in_accident_zone(lat: float | None, lon: float | None) -> bool:
    if lat is None or lon is None or not ACCIDENT_ZONES:
        return False
    for zlat, zlon, radius_km in ACCIDENT_ZONES:
        # crude equirectangular distance, good enough at city scale
        dx = (lon - zlon) * 111 * 0.9
        dy = (lat - zlat) * 111
        if (dx ** 2 + dy ** 2) ** 0.5 <= radius_km:
            return True
    return False


def road_risk_score(lat: float | None, lon: float | None, ts: datetime | None = None) -> float:
    """Returns 0-100, where 100 = safest context."""
    ts = ts or datetime.utcnow()
    score = 90.0

    if _in_accident_zone(lat, lon):
        score -= 30

    hour = ts.hour
    if hour >= 22 or hour <= 5:
        score -= 15  # night riding

    return max(0.0, min(100.0, score))


def accident_history_score(past_crash_events: int, past_claims: int) -> float:
    """Recency-weighted accident-history sub-score, 100 = clean record."""
    score = 100.0 - (past_crash_events * 15) - (past_claims * 20)
    return max(0.0, min(100.0, score))
