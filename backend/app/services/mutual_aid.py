"""Finding nearby, opted-in riders to notify about another rider's crash —
physical proximity the rider's own emergency contacts usually don't have.
Paged immediately, in parallel with those contacts, not as a fallback for
if they don't respond. See api/alerts.py for when this gets triggered.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from math import atan2, cos, radians, sin, sqrt

from sqlalchemy.orm import Session

from app.models.models import Rider

# A rider's last_lat/lon is only updated while they're actively riding (see
# api/trips.py:upload_points) — there's no background location feed. Past
# this age it's treated as stale: a rider who rode an hour ago is no
# longer a reliable "nearby, available to help" signal.
FRESHNESS_WINDOW = timedelta(minutes=30)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def find_nearby_optin_riders(
    db: Session,
    exclude_rider_id: str,
    lat: float,
    lon: float,
    radius_km: float = 3.0,
    max_results: int = 10,
) -> list[tuple[Rider, float]]:
    """Opted-in riders within radius_km of (lat, lon), with a recent-enough
    last known location, nearest first. Filtering by a bounding box in SQL
    first (cheap, uses no spatial extension) then exact haversine in
    Python keeps this fast without needing PostGIS for what's a small
    table in practice."""
    cutoff = datetime.utcnow() - FRESHNESS_WINDOW
    # ~1 degree latitude is ~111km; pad generously since longitude degrees
    # shrink with latitude and this is just a pre-filter, not the final cut.
    deg_pad = (radius_km / 111.0) * 1.5

    candidates = (
        db.query(Rider)
        .filter(
            Rider.id != exclude_rider_id,
            Rider.mutual_aid_optin.is_(True),
            Rider.last_location_at.isnot(None),
            Rider.last_location_at >= cutoff,
            Rider.last_lat.between(lat - deg_pad, lat + deg_pad),
            Rider.last_lon.between(lon - deg_pad, lon + deg_pad),
        )
        .all()
    )

    results = []
    for rider in candidates:
        distance = _haversine_km(lat, lon, rider.last_lat, rider.last_lon)
        if distance <= radius_km:
            results.append((rider, round(distance, 2)))

    results.sort(key=lambda pair: pair[1])
    return results[:max_results]
