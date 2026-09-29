"""Rider Safety Score — rule-based, explainable, per-100km normalised.

Score = 0.25*Speed + 0.15*Brake + 0.10*Accel + 0.10*Corner + 0.15*RoadRisk
        + 0.15*History + 0.05*Exposure + 0.05*Consistency

This rule-based engine is the source of truth from day one (no ML model
exists until enough real trips have accumulated). Weights match the deck.
An XGBoost+SHAP model can later be trained on the same feature set
(see services/ml_model.py) and swapped in without changing the API.
"""

from __future__ import annotations

from dataclasses import dataclass

WEIGHTS = {
    "speed": 0.25,
    "brake": 0.15,
    "accel": 0.10,
    "corner": 0.10,
    "road_risk": 0.15,
    "history": 0.15,
    "exposure": 0.05,
    "consistency": 0.05,
}


@dataclass
class ScoreBreakdown:
    total: float
    components: dict  # per-category 0-100 sub-scores
    weighted: dict  # per-category weighted contribution
    events_per_100km: dict


def _per_100km(count: int, distance_km: float) -> float:
    if distance_km <= 0:
        return 0.0
    return round(count / distance_km * 100, 2)


def _penalty_score(rate_per_100km: float, tolerant_rate: float, severe_rate: float) -> float:
    """Maps an events-per-100km rate to a 0-100 sub-score.
    <= tolerant_rate -> ~100, >= severe_rate -> ~0, linear between."""
    if rate_per_100km <= tolerant_rate:
        return 100.0
    if rate_per_100km >= severe_rate:
        return 0.0
    span = severe_rate - tolerant_rate
    return round(100.0 * (1 - (rate_per_100km - tolerant_rate) / span), 2)


def compute_trip_score(
    distance_km: float,
    harsh_brake_count: int,
    harsh_accel_count: int,
    cornering_count: int,
    overspeed_seconds: float,
    duration_s: float,
    road_risk_score: float,  # 0-100, 100 = safest context, from services/road_risk.py
    accident_history_score: float,  # 0-100, 100 = clean history
    consistency_score: float = 85.0,  # 0-100, stability vs rider's own past trips
) -> ScoreBreakdown:
    brake_rate = _per_100km(harsh_brake_count, distance_km)
    accel_rate = _per_100km(harsh_accel_count, distance_km)
    corner_rate = _per_100km(cornering_count, distance_km)
    overspeed_pct = (overspeed_seconds / duration_s * 100) if duration_s > 0 else 0

    components = {
        "speed": max(0.0, round(100 - overspeed_pct * 4, 2)),
        "brake": _penalty_score(brake_rate, tolerant_rate=1.0, severe_rate=8.0),
        "accel": _penalty_score(accel_rate, tolerant_rate=1.0, severe_rate=8.0),
        "corner": _penalty_score(corner_rate, tolerant_rate=1.5, severe_rate=10.0),
        "road_risk": round(road_risk_score, 2),
        "history": round(accident_history_score, 2),
        # exposure: mild reward for real usage, never a penalty (per deck: "context, not penalty")
        "exposure": round(min(100.0, 60 + distance_km / 10), 2),
        "consistency": round(consistency_score, 2),
    }

    weighted = {k: round(components[k] * WEIGHTS[k], 2) for k in WEIGHTS}
    total = round(sum(weighted.values()), 1)
    total = max(0.0, min(100.0, total))

    return ScoreBreakdown(
        total=total,
        components=components,
        weighted=weighted,
        events_per_100km={"brake": brake_rate, "accel": accel_rate, "corner": corner_rate},
    )


def risk_band(score: float) -> str:
    if score >= 90:
        return "SAFE"
    if score >= 75:
        return "GOOD"
    if score >= 60:
        return "MEDIUM"
    return "HIGH"


def reward_tier(score: float) -> str:
    if score >= 90:
        return "safe_rider"
    if score >= 75:
        return "good_rider"
    if score >= 60:
        return "needs_improvement"
    return "high_risk"
