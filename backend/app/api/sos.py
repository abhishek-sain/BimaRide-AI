from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_rider
from app.core.database import get_db
from app.models.models import Rider, SosAlert, Trip
from app.schemas.schemas import SosConfirm, SosOut, SosTrigger

router = APIRouter(prefix="/sos", tags=["sos"])


@router.post("/trigger", response_model=SosOut)
def trigger_sos(payload: SosTrigger, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    trip = db.query(Trip).filter(Trip.id == payload.trip_id, Trip.rider_id == rider.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    alert = SosAlert(trip_id=trip.id, rider_id=rider.id, lat=payload.lat, lon=payload.lon)
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


@router.post("/{alert_id}/confirm", response_model=SosOut)
def confirm_sos(alert_id: str, payload: SosConfirm, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Rider responds to the 15s 'Are you OK?' countdown."""
    alert = db.query(SosAlert).filter(SosAlert.id == alert_id, SosAlert.rider_id == rider.id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.confirmed_ok = payload.confirmed_ok
    alert.resolved_at = datetime.utcnow()
    if not payload.confirmed_ok:
        alert.dispatched = True
        # In production: send SMS/call to rider.emergency_contacts here.
    db.commit()
    db.refresh(alert)
    return alert


@router.post("/{alert_id}/timeout", response_model=SosOut)
def timeout_sos(alert_id: str, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Called by the app if the 15s countdown expires with no response —
    dispatches to emergency contacts automatically."""
    alert = db.query(SosAlert).filter(SosAlert.id == alert_id, SosAlert.rider_id == rider.id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.confirmed_ok is None:
        alert.dispatched = True
        alert.resolved_at = datetime.utcnow()
        db.commit()
        db.refresh(alert)
    return alert
