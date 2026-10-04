from typing import Union

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_account
from app.models.models import ContactUser, Rider
from app.schemas.schemas import NearbyPlaceOut
from app.services.places import find_nearby_places

router = APIRouter(prefix="/places", tags=["places"])


@router.get("/nearby", response_model=list[NearbyPlaceOut])
def nearby_places(
    lat: float = Query(...),
    lon: float = Query(...),
    kind: str = Query("all", pattern="^(all|hospital|police|garage)$"),
    radius_km: float = Query(5.0, gt=0, le=20),
    account: Union[Rider, ContactUser] = Depends(get_current_account),
):
    """Hospitals/police/garages near a point — meant to be called with a
    crash alert's lat/lon so the crashed rider, their contact, or a nearby
    rider paged in to help can see what's around without leaving the app.
    Either account type may call this; it doesn't expose anything
    rider-specific, just a map search."""
    kinds = ["hospital", "police", "garage"] if kind == "all" else [kind]
    places = find_nearby_places(lat, lon, kinds, radius_km=radius_km)
    return [NearbyPlaceOut(**p.__dict__) for p in places]
