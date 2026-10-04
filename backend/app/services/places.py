"""Nearby hospitals/police stations/vehicle garages around a crash
location, so a contact (or the crashed/nearby rider) looking at an alert
screen doesn't have to leave the app and manually search a map. Backed by
OpenStreetMap's Overpass API — same zero-API-key, no-account philosophy as
components/OsmMapView.tsx on the mobile side; see docs/google-maps-setup.md
for why this project avoids Google's key-gated APIs where a free
equivalent exists.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import atan2, cos, radians, sin, sqrt

import httpx

from app.core.logging_utils import get_logger

logger = get_logger("bimaride.places")

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Each kind maps to one or more OSM tag=value pairs that identify it.
# Hospitals/police are tagged under "amenity"; vehicle repair shops are
# tagged under "shop" in OSM, not "amenity" — garages need two values
# since OSM distinguishes car vs. motorcycle repair shops and either is
# relevant to a crashed rider.
_KIND_TAGS: dict[str, list[tuple[str, str]]] = {
    "hospital": [("amenity", "hospital")],
    "police": [("amenity", "police")],
    "garage": [("shop", "car_repair"), ("shop", "motorcycle_repair")],
}

_KIND_DEFAULT_NAME = {
    "hospital": "Hospital",
    "police": "Police station",
    "garage": "Vehicle garage",
}


@dataclass
class NearbyPlace:
    name: str
    kind: str  # hospital | police | garage
    lat: float
    lon: float
    distance_km: float


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _kind_of(tags: dict) -> str | None:
    for kind, tag_pairs in _KIND_TAGS.items():
        if any(tags.get(key) == value for key, value in tag_pairs):
            return kind
    return None


def find_nearby_places(lat: float, lon: float, kinds: list[str], radius_km: float = 5.0, limit: int = 8) -> list[NearbyPlace]:
    """Queries Overpass for the given kinds within radius_km of (lat, lon).
    Best-effort: returns an empty list (never raises) on any network/parse
    failure — someone mid-emergency should see "no results" rather than a
    crashed screen."""
    radius_m = int(radius_km * 1000)
    clauses = "".join(
        f'node["{key}"="{value}"](around:{radius_m},{lat},{lon});'
        for k in kinds
        if k in _KIND_TAGS
        for key, value in _KIND_TAGS[k]
    )
    if not clauses:
        return []
    query = f"[out:json][timeout:10];({clauses});out body {limit * 3};"

    try:
        resp = httpx.post(OVERPASS_URL, data={"data": query}, timeout=12.0)
        if resp.status_code >= 300:
            logger.warning("Overpass query failed: %s %s", resp.status_code, resp.text[:200])
            return []
        elements = resp.json().get("elements", [])
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Overpass query failed: %s", exc)
        return []

    places: list[NearbyPlace] = []
    for el in elements:
        el_lat, el_lon = el.get("lat"), el.get("lon")
        if el_lat is None or el_lon is None:
            continue
        tags = el.get("tags", {})
        kind = _kind_of(tags)
        if not kind:
            continue
        places.append(
            NearbyPlace(
                name=tags.get("name") or _KIND_DEFAULT_NAME[kind],
                kind=kind,
                lat=el_lat,
                lon=el_lon,
                distance_km=round(_haversine_km(lat, lon, el_lat, el_lon), 2),
            )
        )

    places.sort(key=lambda p: p.distance_km)
    return places[:limit]
