"""Insurer console API — portfolio-wide read endpoints.

MVP note: unauthenticated for simplicity. Before a real pilot, put these
behind an insurer-org login/API key, separate from rider auth.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Rider, RideEvent, SosAlert, Trip
from app.schemas.schemas import PortfolioSummary, RiderSummary
from app.services.scoring import risk_band

router = APIRouter(prefix="/insurer", tags=["insurer"])


@router.get("/portfolio", response_model=PortfolioSummary)
def portfolio_summary(db: Session = Depends(get_db)):
    riders = db.query(Rider).all()
    scores = []
    bands = {"SAFE": 0, "GOOD": 0, "MEDIUM": 0, "HIGH": 0}
    for r in riders:
        latest = (
            db.query(Trip)
            .filter(Trip.rider_id == r.id, Trip.trip_score.isnot(None))
            .order_by(Trip.started_at.desc())
            .first()
        )
        if latest and latest.trip_score is not None:
            scores.append(latest.trip_score)
            bands[risk_band(latest.trip_score)] += 1

    active_riders = len(riders)
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0
    banded_total = sum(bands.values()) or 1
    crash_alerts = db.query(SosAlert).count()

    return PortfolioSummary(
        active_riders=active_riders,
        avg_score=avg_score,
        safe_pct=round((bands["SAFE"] + bands["GOOD"]) / banded_total * 100, 1),
        medium_pct=round(bands["MEDIUM"] / banded_total * 100, 1),
        high_pct=round(bands["HIGH"] / banded_total * 100, 1),
        crash_alerts=crash_alerts,
    )


@router.get("/riders", response_model=list[RiderSummary])
def list_riders(db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=30)
    out = []
    for r in db.query(Rider).all():
        trips_30d = (
            db.query(Trip)
            .filter(Trip.rider_id == r.id, Trip.started_at >= since, Trip.trip_score.isnot(None))
            .all()
        )
        latest_score = trips_30d[0].trip_score if trips_30d else None
        latest_score = (
            db.query(Trip.trip_score)
            .filter(Trip.rider_id == r.id, Trip.trip_score.isnot(None))
            .order_by(Trip.started_at.desc())
            .limit(1)
            .scalar()
        )
        distance_30d = sum(t.distance_km for t in trips_30d)
        trip_ids = [t.id for t in trips_30d]
        harsh = 0
        overspeed = 0
        crash = 0
        if trip_ids:
            events = db.query(RideEvent).filter(RideEvent.trip_id.in_(trip_ids)).all()
            harsh = len([e for e in events if e.event_type == "harsh_brake"])
            overspeed = len([e for e in events if e.event_type == "overspeed"])
            crash = len([e for e in events if e.event_type == "crash_suspect"])

        out.append(RiderSummary(
            rider_id=r.id,
            name=r.name,
            score=latest_score or 0.0,
            risk_band=risk_band(latest_score) if latest_score else "UNSCORED",
            distance_km_30d=round(distance_30d, 1),
            harsh_braking_30d=harsh,
            overspeed_30d=overspeed,
            crash_events_30d=crash,
        ))
    return sorted(out, key=lambda x: x.score)


@router.get("/riders/{rider_id}")
def rider_drilldown(rider_id: str, db: Session = Depends(get_db)):
    rider = db.query(Rider).filter(Rider.id == rider_id).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    trips = (
        db.query(Trip)
        .filter(Trip.rider_id == rider.id, Trip.trip_score.isnot(None))
        .order_by(Trip.started_at.desc())
        .limit(20)
        .all()
    )
    return {
        "rider": {"id": rider.id, "name": rider.name, "city": rider.city, "bike_model": rider.bike_model},
        "trips": [
            {
                "id": t.id, "started_at": t.started_at, "distance_km": t.distance_km,
                "trip_score": t.trip_score, "status": t.status,
                "events": [{"type": e.event_type, "severity": e.severity} for e in t.events],
            }
            for t in trips
        ],
    }


@router.get("/heatmap")
def city_heatmap(db: Session = Depends(get_db)):
    """Event locations for a simple risk heatmap: green/yellow/red clusters."""
    events = (
        db.query(RideEvent)
        .filter(RideEvent.lat.isnot(None), RideEvent.lon.isnot(None))
        .order_by(RideEvent.ts.desc())
        .limit(2000)
        .all()
    )
    severity_color = {"low": "green", "medium": "yellow", "high": "red"}
    return [
        {
            "lat": e.lat, "lon": e.lon, "type": e.event_type,
            "color": severity_color.get(e.severity, "yellow"),
        }
        for e in events
    ]
