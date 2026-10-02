"""Push notifications to a rider's connected, accepted emergency contacts:
a one-tap "I'm starting a ride" ping, and the crash-alert dispatch.

These replace the old SMS-to-a-phone-number path (api/sos.py,
services/notifications.py) now that contacts are real paired accounts
with their own push tokens — see services/push.py for why that's a
strictly better fit than the Twilio integration it replaces.
"""

import uuid

import anyio.from_thread
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_rider
from app.api.live import broadcast_to_trip
from app.core.database import get_db
from app.models.models import Connection, Rider, Trip
from app.schemas.schemas import CrashAlertIn, CrashAlertOut, RideNotifyOut
from app.services.push import send_expo_push

router = APIRouter(prefix="/trips", tags=["alerts"])


def _accepted_contact_tokens(db: Session, rider_id: str) -> list[str]:
    connections = (
        db.query(Connection)
        .filter(Connection.rider_id == rider_id, Connection.status == "accepted")
        .all()
    )
    return [c.contact.push_token for c in connections if c.contact.push_token]


@router.post("/{trip_id}/notify-start", response_model=RideNotifyOut)
def notify_ride_start(
    trip_id: str,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    """The rider's one-click 'notify my emergency contact' button, meant to
    be tapped right before or as a ride starts."""
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.rider_id == rider.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    tokens = _accepted_contact_tokens(db, rider.id)
    sent = send_expo_push(
        tokens,
        title="Ride started",
        body=f"{rider.name} just started a ride. You can follow their live location in the app.",
        data={"type": "ride_start", "trip_id": trip.id, "rider_id": rider.id, "rider_name": rider.name},
    )
    return RideNotifyOut(notified=sent)


@router.post("/{trip_id}/crash-alert", response_model=CrashAlertOut)
def crash_alert(
    trip_id: str,
    payload: CrashAlertIn,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    """Called by the rider's app the moment a crash is auto-detected (or
    the manual SOS button is tapped) — in parallel with, not instead of,
    the rider's own phone vibrating and sounding its alarm locally."""
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.rider_id == rider.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # One id shared by BOTH delivery channels below, so a contact whose app
    # is open and who ALSO gets the push (production builds) can recognise
    # it as the same alert and open the alarm screen once, not twice.
    alert_data = {
        "type": "crash_alert",
        "alert_id": uuid.uuid4().hex,
        "trip_id": trip.id,
        "rider_id": rider.id,
        "rider_name": rider.name,
        "lat": payload.lat,
        "lon": payload.lon,
        "speed_kmh": payload.speed_kmh,
    }

    tokens = _accepted_contact_tokens(db, rider.id)
    sent = send_expo_push(
        tokens,
        title="🚨 Crash alert",
        body=f"{rider.name} may have been in a crash. Tap to see their location.",
        data=alert_data,
        category_id="crash_alert",
    )

    # Second channel: any contact currently watching this trip's live map
    # gets it instantly over the WebSocket. This is the ONLY channel that
    # works in Expo Go (no remote push there since SDK 53). This endpoint is
    # a sync def running in FastAPI's worker thread, so hop back onto the
    # event loop that owns the sockets to send.
    try:
        live_viewers = anyio.from_thread.run(broadcast_to_trip, trip.id, alert_data)
    except Exception:
        live_viewers = 0

    return CrashAlertOut(notified=sent, live_viewers=live_viewers)
