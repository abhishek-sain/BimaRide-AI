"""Pre-ride weather risk check. Backed by Open-Meteo, which needs no API
key or account (unlike most weather APIs) — consistent with this
project's avoid-external-accounts-for-testing approach (see
services/places.py, components/OsmMapView.tsx).

This only ever advises the rider before they start; it's not wired into
scoring or detection, so a lookup failure (no network, Open-Meteo down)
should never block a ride — see api/weather.py, which degrades to
"unknown, no warning" rather than erroring the request.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.core.logging_utils import get_logger

logger = get_logger("bimaride.weather")

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# WMO weather codes (Open-Meteo's `weather_code`) that mean reduced
# traction or visibility for a two-wheeler specifically — a car driver
# barely notices drizzle; a motorcycle rider's available grip drops
# sharply. https://open-meteo.com/en/docs#weathervariables
_RAIN_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}
_SNOW_ICE_CODES = {71, 73, 75, 77, 85, 86}
_FOG_CODES = {45, 48}

_CODE_LABEL = {
    **{c: "rain" for c in _RAIN_CODES},
    **{c: "snow/ice" for c in _SNOW_ICE_CODES},
    **{c: "fog" for c in _FOG_CODES},
}


@dataclass
class WeatherRisk:
    level: str  # low | moderate | high
    reasons: list[str]
    temperature_c: float | None
    wind_kmh: float | None
    visibility_m: float | None
    condition: str | None  # rain | snow/ice | fog | None


def assess_weather_risk(lat: float, lon: float) -> WeatherRisk | None:
    """Returns None (meaning "couldn't determine, don't warn") rather than
    raising, on any network/parse failure."""
    try:
        resp = httpx.get(
            OPEN_METEO_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,wind_speed_10m,weather_code,visibility",
                "timezone": "auto",
            },
            timeout=8.0,
        )
        if resp.status_code >= 300:
            logger.warning("Open-Meteo request failed: %s %s", resp.status_code, resp.text[:200])
            return None
        current = resp.json().get("current", {})
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Open-Meteo request failed: %s", exc)
        return None

    code = current.get("weather_code")
    wind_kmh = current.get("wind_speed_10m")
    visibility_m = current.get("visibility")
    temperature_c = current.get("temperature_2m")
    condition = _CODE_LABEL.get(code)

    reasons: list[str] = []
    level = "low"

    if code in _SNOW_ICE_CODES:
        level = "high"
        reasons.append("Snow/ice conditions — significantly reduced traction for two-wheelers.")
    elif code in _RAIN_CODES:
        level = "moderate"
        reasons.append("Rain in the area — wet roads reduce braking grip and visibility.")

    if visibility_m is not None and visibility_m < 1000:
        level = "high"
        reasons.append(f"Low visibility (~{int(visibility_m)} m).")
    elif code in _FOG_CODES:
        level = "moderate" if level == "low" else level
        reasons.append("Fog reported in the area.")

    if wind_kmh is not None and wind_kmh >= 40:
        level = "high"
        reasons.append(f"Strong winds (~{round(wind_kmh)} km/h) — can destabilize a two-wheeler.")
    elif wind_kmh is not None and wind_kmh >= 25:
        level = "moderate" if level == "low" else level
        reasons.append(f"Gusty winds (~{round(wind_kmh)} km/h).")

    return WeatherRisk(
        level=level,
        reasons=reasons,
        temperature_c=temperature_c,
        wind_kmh=wind_kmh,
        visibility_m=visibility_m,
        condition=condition,
    )
