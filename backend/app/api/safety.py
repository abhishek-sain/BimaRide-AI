"""Standalone fall alerts — from the always-on background monitor (the
native `fall-detection` Expo module), not tied to an active trip. See
models.FallAlert for why this is a separate table/API from CrashAlert
rather than a trip_id-optional variant of it.

Delivery is push + polling replay only (no live-map WebSocket — there's no
trip/live map to broadcast into when the rider isn't riding). The
ack/rider-ok response loop mirrors api/alerts.py's CrashAlert flow so the
contact-side UI can reuse the same patterns.
"""

from datetime import datetime, timedelta
from typing import Union

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_account, get_current_contact, get_current_rider
from app.core.database import get_db
from app.models.models import ContactUser, Connection, FallAlert, Rider
from app.schemas.schemas import FallAlertIn, FallAlertOut
from app.services.push import send_expo_push

router = APIRouter(prefix="/safety", tags=["safety"])

PENDING_WINDOW = timedelta(minutes=30)


def _accepted_contact_tokens(db: Session, rider_id: str) -> list[str]:
    connections = (
        db.query(Connection)
        .filter(Connection.rider_id == rider_id, Connection.status == "accepted")
        .all()
    )
    return [c.contact.push_token for c in connections if c.contact.push_token]


def _alert_out(alert: FallAlert) -> FallAlertOut:
    return FallAlertOut(
        id=alert.id,
        rider_id=alert.rider_id,
        rider_name=alert.rider.name,
        lat=alert.lat,
        lon=alert.lon,
        status=alert.status,
        created_at=alert.created_at,
        rider_ok_at=alert.rider_ok_at,
        acknowledged_by=alert.acknowledged_by or [],
    )


def _visible_alert(db: Session, alert_id: str, account: Union[Rider, ContactUser]) -> FallAlert:
    alert = db.query(FallAlert).filter(FallAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if isinstance(account, Rider):
        if alert.rider_id != account.id:
            raise HTTPException(status_code=404, detail="Alert not found")
    else:
        connected = (
            db.query(Connection)
            .filter(
                Connection.rider_id == alert.rider_id,
                Connection.contact_id == account.id,
                Connection.status == "accepted",
            )
            .first()
        )
        if not connected:
            raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.post("/fall-alert", response_model=FallAlertOut)
def report_fall(
    payload: FallAlertIn,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    """Called by the native background monitor the instant it detects a
    free-fall-then-impact signature — authenticated with the same bearer
    token the rider's app already holds, cached on-device by the native
    module so it can call this even with the JS app fully closed."""
    alert = FallAlert(rider_id=rider.id, lat=payload.lat, lon=payload.lon)
    db.add(alert)
    db.commit()
    db.refresh(alert)

    send_expo_push(
        _accepted_contact_tokens(db, rider.id),
        title="🚨 Possible fall detected",
        body=f"{rider.name}'s phone detected a sudden drop while not on a tracked ride. Tap to see their last known location.",
        data={"type": "fall_alert", "alert_id": alert.id, "rider_id": rider.id, "rider_name": rider.name},
        category_id="crash_alert",
    )

    return _alert_out(alert)


@router.get("/pending", response_model=list[FallAlertOut])
def pending_fall_alerts(
    db: Session = Depends(get_db),
    contact: ContactUser = Depends(get_current_contact),
):
    rider_ids = [
        c.rider_id
        for c in db.query(Connection).filter(
            Connection.contact_id == contact.id, Connection.status == "accepted"
        )
    ]
    if not rider_ids:
        return []
    cutoff = datetime.utcnow() - PENDING_WINDOW
    alerts = (
        db.query(FallAlert)
        .filter(
            FallAlert.rider_id.in_(rider_ids),
            FallAlert.status != "rider_ok",
            FallAlert.created_at >= cutoff,
        )
        .order_by(FallAlert.created_at.desc())
        .all()
    )
    return [
        _alert_out(a)
        for a in alerts
        if contact.id not in {e.get("contact_id") for e in (a.acknowledged_by or [])}
    ]


@router.get("/{alert_id}", response_model=FallAlertOut)
def get_fall_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    account: Union[Rider, ContactUser] = Depends(get_current_account),
):
    return _alert_out(_visible_alert(db, alert_id, account))


@router.post("/{alert_id}/ack", response_model=FallAlertOut)
def acknowledge_fall_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    contact: ContactUser = Depends(get_current_contact),
):
    alert = _visible_alert(db, alert_id, contact)
    entries = list(alert.acknowledged_by or [])
    if all(e.get("contact_id") != contact.id for e in entries):
        entries.append({"contact_id": contact.id, "name": contact.name, "at": datetime.utcnow().isoformat()})
        alert.acknowledged_by = entries
        if alert.status == "open":
            alert.status = "acknowledged"
        db.commit()
        db.refresh(alert)

        if alert.rider.push_token:
            send_expo_push(
                [alert.rider.push_token],
                title="Help is aware",
                body=f"{contact.name} saw your fall alert and is responding.",
                data={"type": "alert_ack", "alert_id": alert.id},
            )
    return _alert_out(alert)


@router.post("/{alert_id}/rider-ok", response_model=FallAlertOut)
def fall_rider_is_ok(
    alert_id: str,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    alert = _visible_alert(db, alert_id, rider)
    if alert.status != "rider_ok":
        alert.status = "rider_ok"
        alert.rider_ok_at = datetime.utcnow()
        db.commit()
        db.refresh(alert)

        send_expo_push(
            _accepted_contact_tokens(db, rider.id),
            title="Rider is OK",
            body=f"{rider.name} says they're OK — that fall alert was a false alarm.",
            data={"type": "rider_ok", "alert_id": alert.id},
        )
    return _alert_out(alert)
