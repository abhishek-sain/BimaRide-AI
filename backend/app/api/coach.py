from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_rider
from app.core.database import get_db
from app.models.models import Rider, RideEvent, Trip
from app.schemas.schemas import CoachAnswer, CoachAsk
from app.services.coach import explain

router = APIRouter(prefix="/coach", tags=["coach"])


@router.post("/ask", response_model=CoachAnswer)
def ask_coach(payload: CoachAsk, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    grounded = {"current_score": None, "score_breakdown": {}, "recent_events": []}

    if payload.trip_id:
        trip = db.query(Trip).filter(Trip.id == payload.trip_id, Trip.rider_id == rider.id).first()
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        grounded["current_score"] = trip.trip_score
        grounded["score_breakdown"] = trip.score_breakdown or {}
        grounded["recent_events"] = [
            {"event_type": e.event_type, "severity": e.severity, "peak_value": e.peak_value}
            for e in trip.events
        ]
    else:
        recent_trips = (
            db.query(Trip)
            .filter(Trip.rider_id == rider.id, Trip.trip_score.isnot(None))
            .order_by(Trip.started_at.desc())
            .limit(5)
            .all()
        )
        if recent_trips:
            grounded["current_score"] = recent_trips[0].trip_score
            grounded["score_breakdown"] = recent_trips[0].score_breakdown or {}
        events = (
            db.query(RideEvent)
            .join(Trip)
            .filter(Trip.rider_id == rider.id)
            .order_by(RideEvent.ts.desc())
            .limit(20)
            .all()
        )
        grounded["recent_events"] = [
            {"event_type": e.event_type, "severity": e.severity, "peak_value": e.peak_value} for e in events
        ]

    answer = explain(payload.question, grounded)
    return CoachAnswer(answer=answer, grounded_on=grounded)
