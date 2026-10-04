"""Alerts to a rider's connected, accepted emergency contacts, and what
happens next: a one-tap "I'm starting a ride" ping, the crash/SOS alert
itself, and the response loop — a contact acknowledging, or the rider
saying they're OK.

Every crash/SOS alert is persisted (models.CrashAlert) and delivered on up
to three channels: the live-map WebSocket (the only one that works in Expo
Go, which has no remote push since SDK 53), a push notification (dev and
production builds), and replay — a contact's app polls /alerts/pending so
an alert raised while they were offline or on another screen still
surfaces. All three carry the same alert id so the app opens one alarm.

These replace the old SMS-to-a-phone-number path (api/sos.py,
services/notifications.py); see services/push.py for why.
"""

from datetime import datetime, timedelta
from typing import Union

import anyio.from_thread
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_account, get_current_contact, get_current_rider
from app.api.live import broadcast_to_trip
from app.core.database import SessionLocal, get_db
from app.models.models import ContactUser, Connection, CrashAlert, MutualAidPing, Rider, Trip
from app.schemas.schemas import AlertOut, CrashAlertIn, CrashAlertOut, RideNotifyOut
from app.core.logging_utils import get_logger
from app.services.mutual_aid import find_nearby_optin_riders
from app.services.push import send_expo_push

logger = get_logger("bimaride.mutual_aid")

router = APIRouter(prefix="/trips", tags=["alerts"])
alerts_router = APIRouter(prefix="/alerts", tags=["alerts"])

# How long an unresolved alert keeps surfacing to a contact who hasn't
# handled it. Past this it's history, not an emergency in progress.
PENDING_WINDOW = timedelta(minutes=30)

# A stranger standing right next to the crash can often reach the rider
# faster than a distant emergency contact — so nearby opted-in riders are
# paged immediately, in parallel with the rider's own contacts, not held
# back waiting to see if a contact responds first.
MUTUAL_AID_RADIUS_KM = 3.0


def _page_nearby_riders(alert_id: str) -> None:
    """Runs in FastAPI's background-task threadpool right after the crash-
    alert request has already responded, so the Overpass-free nearby-rider
    DB lookup and the extra push sends don't add latency to the rider's own
    alert. Opens its own DB session since the request's session is closed
    by the time a background task runs."""
    db = SessionLocal()
    try:
        alert = db.query(CrashAlert).filter(CrashAlert.id == alert_id).first()
        if not alert or alert.status == "rider_ok" or alert.lat is None or alert.lon is None:
            return  # already resolved as a false alarm, or no location to search around
        nearby = find_nearby_optin_riders(
            db, exclude_rider_id=alert.rider_id, lat=alert.lat, lon=alert.lon, radius_km=MUTUAL_AID_RADIUS_KM
        )
        if not nearby:
            return
        pings = [MutualAidPing(alert_id=alert.id, rider_id=rider.id, distance_km=distance) for rider, distance in nearby]
        db.add_all(pings)
        db.commit()
        for ping, (rider, distance) in zip(pings, nearby):
            if not rider.push_token:
                continue
            send_expo_push(
                [rider.push_token],
                title="🚨 Nearby rider may need help",
                body=f"A crash alert was raised ~{distance} km from your last ride. Tap to see if you can help.",
                data={"type": "mutual_aid", "ping_id": ping.id, "alert_id": alert.id},
                category_id="crash_alert",
            )
    except Exception:
        logger.exception("Mutual-aid paging failed for alert %s", alert_id)
    finally:
        db.close()


def _accepted_contact_tokens(db: Session, rider_id: str) -> list[str]:
    connections = (
        db.query(Connection)
        .filter(Connection.rider_id == rider_id, Connection.status == "accepted")
        .all()
    )
    return [c.contact.push_token for c in connections if c.contact.push_token]


def _alert_out(alert: CrashAlert) -> AlertOut:
    return AlertOut(
        id=alert.id,
        trip_id=alert.trip_id,
        rider_id=alert.rider_id,
        rider_name=alert.rider.name,
        kind=alert.kind,
        lat=alert.lat,
        lon=alert.lon,
        speed_kmh=alert.speed_kmh,
        status=alert.status,
        created_at=alert.created_at,
        rider_ok_at=alert.rider_ok_at,
        acknowledged_by=alert.acknowledged_by or [],
    )


def _broadcast(trip_id: str, payload: dict) -> int:
    """Sync endpoints run in a worker thread; hop to the event loop that
    owns the sockets. Never let a socket problem fail the request."""
    try:
        return anyio.from_thread.run(broadcast_to_trip, trip_id, payload)
    except Exception:
        return 0


def _visible_alert(db: Session, alert_id: str, account: Union[Rider, ContactUser]) -> CrashAlert:
    """The alert, if this account may see it: the rider who raised it, or a
    contact with an ACCEPTED connection to that rider. Otherwise a 404 —
    deliberately the same answer as "doesn't exist" so ids can't be probed."""
    alert = db.query(CrashAlert).filter(CrashAlert.id == alert_id).first()
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


# ---------------------------------------------------------------- trips ---

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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    """Called by the rider's app the moment a crash is auto-detected (or
    the manual SOS button is tapped) — in parallel with, not instead of,
    the rider's own phone vibrating and sounding its alarm locally."""
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.rider_id == rider.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    alert = CrashAlert(
        trip_id=trip.id,
        rider_id=rider.id,
        kind=payload.kind,
        lat=payload.lat,
        lon=payload.lon,
        speed_kmh=payload.speed_kmh,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    alert_data = {
        "type": "crash_alert",
        "alert_id": alert.id,
        "kind": alert.kind,
        "trip_id": trip.id,
        "rider_id": rider.id,
        "rider_name": rider.name,
        "lat": alert.lat,
        "lon": alert.lon,
        "speed_kmh": alert.speed_kmh,
    }

    label = "SOS" if alert.kind == "manual" else "Crash alert"
    sent = send_expo_push(
        _accepted_contact_tokens(db, rider.id),
        title=f"🚨 {label}",
        body=(
            f"{rider.name} pressed SOS. Tap to see their location."
            if alert.kind == "manual"
            else f"{rider.name} may have been in a crash. Tap to see their location."
        ),
        data=alert_data,
        category_id="crash_alert",
    )
    live_viewers = _broadcast(trip.id, alert_data)

    if payload.lat is not None and payload.lon is not None:
        background_tasks.add_task(_page_nearby_riders, alert.id)

    return CrashAlertOut(alert_id=alert.id, notified=sent, live_viewers=live_viewers)


# --------------------------------------------------------------- alerts ---

@alerts_router.get("/pending", response_model=list[AlertOut])
def pending_alerts(
    db: Session = Depends(get_db),
    contact: ContactUser = Depends(get_current_contact),
):
    """Unresolved alerts from this contact's connected riders that this
    contact hasn't acknowledged yet. The contact app polls this, which is
    how an alert raised while they were offline — or on a screen with no
    live socket — still reaches them."""
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
        db.query(CrashAlert)
        .filter(
            CrashAlert.rider_id.in_(rider_ids),
            CrashAlert.status != "rider_ok",
            CrashAlert.created_at >= cutoff,
        )
        .order_by(CrashAlert.created_at.desc())
        .all()
    )
    return [
        _alert_out(a)
        for a in alerts
        if contact.id not in {e.get("contact_id") for e in (a.acknowledged_by or [])}
    ]


@alerts_router.get("", response_model=list[AlertOut])
def list_alerts(
    db: Session = Depends(get_db),
    account: Union[Rider, ContactUser] = Depends(get_current_account),
):
    """Alert history: a rider's own, or those of every rider a contact is
    connected to. Newest first, capped at 50."""
    if isinstance(account, Rider):
        rider_ids = [account.id]
    else:
        rider_ids = [
            c.rider_id
            for c in db.query(Connection).filter(
                Connection.contact_id == account.id, Connection.status == "accepted"
            )
        ]
    if not rider_ids:
        return []
    alerts = (
        db.query(CrashAlert)
        .filter(CrashAlert.rider_id.in_(rider_ids))
        .order_by(CrashAlert.created_at.desc())
        .limit(50)
        .all()
    )
    return [_alert_out(a) for a in alerts]


@alerts_router.get("/{alert_id}", response_model=AlertOut)
def get_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    account: Union[Rider, ContactUser] = Depends(get_current_account),
):
    return _alert_out(_visible_alert(db, alert_id, account))


@alerts_router.post("/{alert_id}/ack", response_model=AlertOut)
def acknowledge_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    contact: ContactUser = Depends(get_current_contact),
):
    """A contact says "I've seen this and I'm responding". Idempotent: a
    second tap from the same contact changes nothing."""
    alert = _visible_alert(db, alert_id, contact)
    entries = list(alert.acknowledged_by or [])
    if all(e.get("contact_id") != contact.id for e in entries):
        entries.append({"contact_id": contact.id, "name": contact.name, "at": datetime.utcnow().isoformat()})
        alert.acknowledged_by = entries  # reassign: SQLAlchemy won't see an in-place JSON mutation
        if alert.status == "open":
            alert.status = "acknowledged"
        db.commit()
        db.refresh(alert)

        if alert.rider.push_token:
            send_expo_push(
                [alert.rider.push_token],
                title="Help is aware",
                body=f"{contact.name} saw your alert and is responding.",
                data={"type": "alert_ack", "alert_id": alert.id},
            )
    return _alert_out(alert)


@alerts_router.post("/{alert_id}/rider-ok", response_model=AlertOut)
def rider_is_ok(
    alert_id: str,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    """The rider says "false alarm / I'm OK". Without this a contact who
    got a crash alert has no way to know the rider is fine — they'd be left
    worrying (or driving across town) over an alarm the rider already
    dismissed."""
    alert = _visible_alert(db, alert_id, rider)
    if alert.status != "rider_ok":
        alert.status = "rider_ok"
        alert.rider_ok_at = datetime.utcnow()
        db.commit()
        db.refresh(alert)

        send_expo_push(
            _accepted_contact_tokens(db, rider.id),
            title="Rider is OK",
            body=f"{rider.name} says they're OK.",
            data={"type": "rider_ok", "alert_id": alert.id},
        )
        _broadcast(alert.trip_id, {"type": "rider_ok", "alert_id": alert.id})
    return _alert_out(alert)
