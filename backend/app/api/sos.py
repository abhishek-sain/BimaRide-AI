from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_rider
from app.core.database import get_db
from app.models.models import Rider, SosAlert, Trip
from app.schemas.schemas import SosConfirm, SosOut, SosTrigger
from app.services.notifications import notify_emergency_contacts

router = APIRouter(prefix="/sos", tags=["sos"])


@router.post("/trigger", response_model=SosOut)
def trigger_sos(payload: SosTrigger, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    trip = db.query(Trip).filter(Trip.id == payload.trip_id, Trip.rider_id == rider.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    alert = SosAlert(
        trip_id=trip.id, rider_id=rider.id, lat=payload.lat, lon=payload.lon, speed_kmh=payload.speed_kmh
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def _dispatch(alert: SosAlert, rider: Rider, db: Session) -> None:
    """Marks the alert dispatched and actually sends the SMS to every saved
    emergency contact. Runs synchronously — SMS sends are logged failures,
    never exceptions, so this can't leave the alert half-updated."""
    alert.dispatched = True
    alert.contacts_notified = notify_emergency_contacts(
        rider_name=rider.name,
        contacts=rider.emergency_contacts or [],
        lat=alert.lat,
        lon=alert.lon,
        speed_kmh=alert.speed_kmh,
    )


@router.post("/{alert_id}/confirm", response_model=SosOut)
def confirm_sos(alert_id: str, payload: SosConfirm, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Rider responds to the 15s 'Are you OK?' countdown (or taps
    'I need help' immediately, which also lands here with confirmed_ok=False)."""
    alert = db.query(SosAlert).filter(SosAlert.id == alert_id, SosAlert.rider_id == rider.id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.confirmed_ok = payload.confirmed_ok
    alert.resolved_at = datetime.utcnow()
    if not payload.confirmed_ok:
        _dispatch(alert, rider, db)
    db.commit()
    db.refresh(alert)
    return alert


@router.post("/{alert_id}/timeout", response_model=SosOut)
def timeout_sos(alert_id: str, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Called by the app if the 15s countdown expires with no response —
    dispatches to emergency contacts automatically, with no rider action."""
    alert = db.query(SosAlert).filter(SosAlert.id == alert_id, SosAlert.rider_id == rider.id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.confirmed_ok is None:
        alert.resolved_at = datetime.utcnow()
        _dispatch(alert, rider, db)
        db.commit()
        db.refresh(alert)
    return alert
