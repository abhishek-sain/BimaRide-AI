from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_rider
from app.core.database import get_db
from app.models.models import Rider, RewardLedger, RideEvent, Trip, TripPoint
from app.schemas.schemas import (
    RideEventOut,
    TripOut,
    TripPointsBatch,
    TripStart,
)
from app.services.events import detect_events
from app.services.road_risk import accident_history_score, road_risk_score
from app.services.scoring import compute_trip_score, reward_tier

router = APIRouter(prefix="/trips", tags=["trips"])


@router.post("", response_model=TripOut)
def start_trip(payload: TripStart, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    trip = Trip(rider_id=rider.id, started_at=datetime.utcnow(), status="active")
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return trip


@router.post("/{trip_id}/points")
def upload_points(
    trip_id: str,
    batch: TripPointsBatch,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.rider_id == rider.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.status != "active":
        raise HTTPException(status_code=400, detail="Trip is not active")

    for p in batch.points:
        db.add(TripPoint(
            trip_id=trip.id, ts=p.ts, lat=p.lat, lon=p.lon, speed_kmh=p.speed_kmh,
            accel_x=p.accel_x, accel_y=p.accel_y, accel_z=p.accel_z,
            gyro_x=p.gyro_x, gyro_y=p.gyro_y, gyro_z=p.gyro_z, heading=p.heading,
        ))
    db.commit()
    return {"received": len(batch.points)}


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    from math import radians, sin, cos, sqrt, atan2
    R = 6371.0
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


@router.post("/{trip_id}/end", response_model=TripOut)
def end_trip(trip_id: str, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.rider_id == rider.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    points = (
        db.query(TripPoint)
        .filter(TripPoint.trip_id == trip.id)
        .order_by(TripPoint.ts.asc())
        .all()
    )

    distance_km = 0.0
    speeds = []
    for prev, cur in zip(points, points[1:]):
        if None not in (prev.lat, prev.lon, cur.lat, cur.lon):
            distance_km += _haversine_km(prev.lat, prev.lon, cur.lat, cur.lon)
        if cur.speed_kmh is not None:
            speeds.append(cur.speed_kmh)

    duration_s = int((points[-1].ts - points[0].ts).total_seconds()) if len(points) >= 2 else 0

    detected = detect_events(points)
    for e in detected:
        db.add(RideEvent(
            trip_id=trip.id, event_type=e.event_type, severity=e.severity, ts=e.ts,
            lat=e.lat, lon=e.lon, peak_value=e.peak_value, duration_s=e.duration_s,
            context=e.context, coach_tip=e.coach_tip,
        ))

    counts = {"harsh_brake": 0, "harsh_accel": 0, "cornering": 0}
    overspeed_seconds = 0.0
    crash_suspect = False
    for e in detected:
        if e.event_type in counts:
            counts[e.event_type] += 1
        elif e.event_type == "overspeed":
            overspeed_seconds += e.duration_s
        elif e.event_type == "crash_suspect":
            crash_suspect = True

    mid_point = points[len(points) // 2] if points else None
    rr_score = road_risk_score(
        mid_point.lat if mid_point else None,
        mid_point.lon if mid_point else None,
        trip.started_at,
    )

    past_crashes = (
        db.query(RideEvent)
        .join(Trip)
        .filter(Trip.rider_id == rider.id, RideEvent.event_type == "crash_suspect")
        .count()
    )
    hist_score = accident_history_score(past_crash_events=past_crashes, past_claims=0)

    breakdown = compute_trip_score(
        distance_km=distance_km,
        harsh_brake_count=counts["harsh_brake"],
        harsh_accel_count=counts["harsh_accel"],
        cornering_count=counts["cornering"],
        overspeed_seconds=overspeed_seconds,
        duration_s=duration_s or 1,
        road_risk_score=rr_score,
        accident_history_score=hist_score,
    )

    trip.ended_at = datetime.utcnow()
    trip.status = "crash_flagged" if crash_suspect else "completed"
    trip.distance_km = round(distance_km, 2)
    trip.duration_s = duration_s
    trip.avg_speed_kmh = round(sum(speeds) / len(speeds), 1) if speeds else 0.0
    trip.max_speed_kmh = round(max(speeds), 1) if speeds else 0.0
    trip.trip_score = breakdown.total
    trip.score_breakdown = {"components": breakdown.components, "weighted": breakdown.weighted,
                             "events_per_100km": breakdown.events_per_100km}

    db.add(RewardLedger(
        rider_id=rider.id, trip_id=trip.id, tier=reward_tier(breakdown.total),
        points=int(breakdown.total), reason="trip_completed",
    ))

    db.commit()
    db.refresh(trip)
    return trip


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(trip_id: str, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.rider_id == rider.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@router.get("", response_model=list[TripOut])
def list_trips(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    return (
        db.query(Trip)
        .filter(Trip.rider_id == rider.id)
        .order_by(Trip.started_at.desc())
        .all()
    )


@router.get("/{trip_id}/events", response_model=list[RideEventOut])
def get_trip_events(trip_id: str, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.rider_id == rider.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip.events
