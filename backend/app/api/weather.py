from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_rider
from app.models.models import Rider
from app.schemas.schemas import WeatherRiskOut
from app.services.weather import assess_weather_risk

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("/risk", response_model=WeatherRiskOut)
def weather_risk(
    lat: float = Query(...),
    lon: float = Query(...),
    rider: Rider = Depends(get_current_rider),
):
    """Called right before a ride starts to warn about rain/fog/wind/ice at
    the rider's current location. Unknown conditions (lookup failed) are
    reported as "low" risk with no reasons rather than erroring the
    request — a weather-API hiccup should never block starting a ride."""
    risk = assess_weather_risk(lat, lon)
    if risk is None:
        return WeatherRiskOut(level="low", reasons=[])
    return WeatherRiskOut(
        level=risk.level,
        reasons=risk.reasons,
        temperature_c=risk.temperature_c,
        wind_kmh=risk.wind_kmh,
        visibility_m=risk.visibility_m,
        condition=risk.condition,
    )
