from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ---------- Auth ----------

class RiderCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    bike_model: Optional[str] = None
    city: Optional[str] = None


class RiderLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class EmergencyContact(BaseModel):
    name: str
    phone: str


class RiderOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    bike_model: Optional[str] = None
    city: Optional[str] = None
    emergency_contacts: list[EmergencyContact] = []

    class Config:
        from_attributes = True


# ---------- Trips ----------

class TripStart(BaseModel):
    lat: Optional[float] = None
    lon: Optional[float] = None


class TripPointIn(BaseModel):
    ts: datetime
    lat: Optional[float] = None
    lon: Optional[float] = None
    speed_kmh: Optional[float] = None
    accel_x: Optional[float] = None
    accel_y: Optional[float] = None
    accel_z: Optional[float] = None
    gyro_x: Optional[float] = None
    gyro_y: Optional[float] = None
    gyro_z: Optional[float] = None
    heading: Optional[float] = None


class TripPointsBatch(BaseModel):
    points: list[TripPointIn]


class TripEnd(BaseModel):
    pass


class RideEventOut(BaseModel):
    id: str
    event_type: str
    severity: str
    ts: datetime
    lat: Optional[float] = None
    lon: Optional[float] = None
    peak_value: Optional[float] = None
    duration_s: Optional[float] = None
    context: Optional[dict] = None
    coach_tip: Optional[str] = None

    class Config:
        from_attributes = True


class TripOut(BaseModel):
    id: str
    rider_id: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    status: str
    distance_km: float
    duration_s: int
    avg_speed_kmh: float
    max_speed_kmh: float
    trip_score: Optional[float] = None
    score_breakdown: Optional[dict] = None
    events: list[RideEventOut] = []

    class Config:
        from_attributes = True


class LiveScoreUpdate(BaseModel):
    """Sent by the phone's on-device rule engine as a live estimate; server
    recomputes authoritatively on trip end / batch ingest."""

    provisional_score: float
    events_so_far: int


# ---------- Coaching ----------

class CoachAsk(BaseModel):
    trip_id: Optional[str] = None
    question: str


class CoachAnswer(BaseModel):
    answer: str
    grounded_on: dict


# ---------- SOS ----------

class SosTrigger(BaseModel):
    trip_id: str
    lat: Optional[float] = None
    lon: Optional[float] = None


class SosConfirm(BaseModel):
    confirmed_ok: bool


class SosOut(BaseModel):
    id: str
    trip_id: str
    triggered_at: datetime
    confirmed_ok: Optional[bool] = None
    dispatched: bool

    class Config:
        from_attributes = True


# ---------- Insurer console ----------

class PortfolioSummary(BaseModel):
    active_riders: int
    avg_score: float
    safe_pct: float
    medium_pct: float
    high_pct: float
    crash_alerts: int


class RiderSummary(BaseModel):
    rider_id: str
    name: str
    score: float
    risk_band: str
    distance_km_30d: float
    harsh_braking_30d: int
    overspeed_30d: int
    crash_events_30d: int
