import re
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

# E.164-ish: an optional leading '+', then 7-15 digits once separators
# (space/dash/parens) are stripped. Rejects things like "-------" or
# "(((((((" that the old `[0-9 ()-]{7,20}` pattern accepted — that pattern
# had no requirement that any of the characters actually be a digit.
_PHONE_SEPARATORS = re.compile(r"[ ()-]")
_DIGITS_ONLY = re.compile(r"^\+?\d{7,15}$")

# Emergency contacts specifically must include a country code. A local
# 10-digit number like "7066115366" passes the looser check above but
# Twilio has no way to know which country it belongs to and will either
# reject it or misroute it — an SMS that silently never arrives is worse
# than a validation error at save time.
_E164_STRICT = re.compile(r"^\+\d{8,15}$")

# Real names don't need to be sentences: caps here (and on the other
# free-text fields below) exist because this data can end up interpolated
# into an outbound SMS (see services/notifications.py) or displayed in the
# insurer console — unbounded input is how that becomes a way to smuggle
# arbitrary content through, not just an inconvenience.
NAME_MAX = 80
FREE_TEXT_MAX = 80
POLICY_NUMBER_MAX = 40
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _validate_phone(value: str) -> str:
    stripped = _PHONE_SEPARATORS.sub("", value.strip())
    if not _DIGITS_ONLY.match(stripped):
        raise ValueError(f"'{value}' doesn't look like a valid phone number.")
    return value.strip()


def _validate_emergency_phone(value: str) -> str:
    stripped = _PHONE_SEPARATORS.sub("", value.strip())
    if not _E164_STRICT.match(stripped):
        raise ValueError(
            f"'{value}' needs a country code to work as an emergency contact, "
            f"e.g. +91 70661 15366 for India or +1 555 123 4567 for the US."
        )
    return stripped


def _validate_iso_date(value: str) -> str:
    if not ISO_DATE_RE.match(value):
        raise ValueError(f"'{value}' must be a date in YYYY-MM-DD format.")
    try:
        date.fromisoformat(value)
    except ValueError:
        raise ValueError(f"'{value}' isn't a real calendar date.")
    return value


# ---------- Auth ----------

class RiderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=NAME_MAX)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: Optional[str] = None
    bike_model: Optional[str] = Field(default=None, max_length=FREE_TEXT_MAX)
    city: Optional[str] = Field(default=None, max_length=FREE_TEXT_MAX)

    @field_validator("phone")
    @classmethod
    def _phone_is_valid(cls, v: Optional[str]) -> Optional[str]:
        return _validate_phone(v) if v else v


class RiderLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class EmergencyContact(BaseModel):
    """The write path — validates a contact being saved. Deliberately
    strict (requires a country code) because this is the shape that
    actually gets texted by services/notifications.py."""

    name: str = Field(min_length=1, max_length=NAME_MAX)
    phone: str

    @field_validator("phone")
    @classmethod
    def _phone_is_valid(cls, v: str) -> str:
        return _validate_emergency_phone(v)


class EmergencyContactOut(BaseModel):
    """The read path — deliberately has NO validation. RiderOut uses this,
    not EmergencyContact, because a response model re-validates whatever is
    already in the database. If it were as strict as the write path, a
    contact saved under an older, looser rule (e.g. before country codes
    were required) would make every profile fetch for that rider fail with
    a 500 — including the one AuthContext calls right after login — until
    they happened to re-save that one field. A stricter rule should block
    new bad data, never retroactively break reading old data."""

    name: str
    phone: str

    class Config:
        from_attributes = True


class RiderOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None
    city: Optional[str] = None
    bike_model: Optional[str] = None
    bike_reg_number: Optional[str] = None
    bike_year: Optional[int] = None
    insurer_name: Optional[str] = None
    policy_number: Optional[str] = None
    idv: Optional[float] = None
    ncb_percent: Optional[float] = None
    policy_expiry: Optional[str] = None
    emergency_contacts: list[EmergencyContactOut] = []

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    """All fields optional and independently settable — the profile screen
    saves whichever section the rider just edited (personal / vehicle /
    policy) without requiring the others to be filled in first."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=NAME_MAX)
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None
    city: Optional[str] = Field(default=None, max_length=FREE_TEXT_MAX)
    bike_model: Optional[str] = Field(default=None, max_length=FREE_TEXT_MAX)
    bike_reg_number: Optional[str] = Field(default=None, max_length=20)
    bike_year: Optional[int] = Field(default=None, ge=1950, le=2100)
    insurer_name: Optional[str] = Field(default=None, max_length=FREE_TEXT_MAX)
    policy_number: Optional[str] = Field(default=None, max_length=POLICY_NUMBER_MAX)
    idv: Optional[float] = Field(default=None, ge=0)
    ncb_percent: Optional[float] = Field(default=None, ge=0, le=50)
    policy_expiry: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def _phone_is_valid(cls, v: Optional[str]) -> Optional[str]:
        return _validate_phone(v) if v else v

    @field_validator("date_of_birth", "policy_expiry")
    @classmethod
    def _date_is_valid(cls, v: Optional[str]) -> Optional[str]:
        return _validate_iso_date(v) if v else v


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
    speed_kmh: Optional[float] = None  # last recorded speed, included in the emergency-contact SMS


class SosConfirm(BaseModel):
    confirmed_ok: bool


class SosOut(BaseModel):
    id: str
    trip_id: str
    triggered_at: datetime
    confirmed_ok: Optional[bool] = None
    dispatched: bool
    contacts_notified: int = 0

    class Config:
        from_attributes = True


# ---------- Emergency contacts ----------

class EmergencyContactsUpdate(BaseModel):
    contacts: list[EmergencyContact]


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
