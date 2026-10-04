"""The mutual-aid network: riders who opt in can be pushed a nearby crash
alert (see api/alerts.py for the trigger) so a stranger who happens to be
close by can physically reach the rider faster than a distant emergency
contact. Separate from the contact-ack loop entirely — a mutual-aid ping
is informational to the pinged rider and never affects the alert's own
status (open/acknowledged/rider_ok), which is reserved for the rider's
own connected emergency contacts.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_rider
from app.core.database import get_db
from app.models.models import CrashAlert, MutualAidPing, Rider
from app.schemas.schemas import MutualAidOptinUpdate, MutualAidPingOut, MutualAidRespondIn, RiderOut
from app.services.push import send_expo_push

router = APIRouter(prefix="/mutual-aid", tags=["mutual-aid"])

# Same window as the contact-alert replay poll (api/alerts.py) — past this
# a ping is history, not something still worth surfacing to the pinged rider.
PENDING_WINDOW = timedelta(minutes=30)


def _ping_out(ping: MutualAidPing) -> MutualAidPingOut:
    alert = ping.alert
    return MutualAidPingOut(
        id=ping.id,
        alert_id=ping.alert_id,
        status=ping.status,
        distance_km=ping.distance_km,
        created_at=ping.created_at,
        responded_at=ping.responded_at,
        kind=alert.kind,
        lat=alert.lat,
        lon=alert.lon,
        alert_status=alert.status,
    )


@router.put("/optin", response_model=RiderOut)
def set_optin(
    payload: MutualAidOptinUpdate,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    rider.mutual_aid_optin = payload.opt_in
    db.commit()
    db.refresh(rider)
    return rider


@router.get("/pending", response_model=list[MutualAidPingOut])
def pending_pings(
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    """Polled while the app is open — the same replay-safety-net pattern as
    GET /alerts/pending, for a rider who was offline or closed when a
    nearby ping's push arrived."""
    cutoff = datetime.utcnow() - PENDING_WINDOW
    pings = (
        db.query(MutualAidPing)
        .filter(
            MutualAidPing.rider_id == rider.id,
            MutualAidPing.status == "notified",
            MutualAidPing.created_at >= cutoff,
        )
        .order_by(MutualAidPing.created_at.desc())
        .all()
    )
    return [_ping_out(p) for p in pings]


@router.get("/{ping_id}", response_model=MutualAidPingOut)
def get_ping(
    ping_id: str,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    ping = db.query(MutualAidPing).filter(MutualAidPing.id == ping_id, MutualAidPing.rider_id == rider.id).first()
    if not ping:
        raise HTTPException(status_code=404, detail="Not found")
    return _ping_out(ping)


@router.post("/{ping_id}/respond", response_model=MutualAidPingOut)
def respond(
    ping_id: str,
    payload: MutualAidRespondIn,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    ping = db.query(MutualAidPing).filter(MutualAidPing.id == ping_id, MutualAidPing.rider_id == rider.id).first()
    if not ping:
        raise HTTPException(status_code=404, detail="Not found")

    if ping.status == "notified":
        ping.status = "responding" if payload.responding else "dismissed"
        ping.responded_at = datetime.utcnow()
        db.commit()
        db.refresh(ping)

        if payload.responding:
            crashed_rider = ping.alert.rider
            if crashed_rider and crashed_rider.push_token:
                send_expo_push(
                    [crashed_rider.push_token],
                    title="A nearby rider is coming to help",
                    body=f"Another BimaRide rider ~{ping.distance_km} km away is on their way.",
                    data={"type": "mutual_aid_responding", "alert_id": ping.alert_id},
                )
    return _ping_out(ping)
