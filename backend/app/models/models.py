import secrets
import string
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


def gen_id() -> str:
    return uuid.uuid4().hex


_CONNECT_CODE_ALPHABET = string.ascii_uppercase + string.digits
# Excludes visually-ambiguous characters (0/O, 1/I/L) since this code is
# meant to be read aloud or typed by hand between two people pairing up.
_CONNECT_CODE_ALPHABET = "".join(c for c in _CONNECT_CODE_ALPHABET if c not in "01OIL")


def gen_connect_code() -> str:
    return "".join(secrets.choice(_CONNECT_CODE_ALPHABET) for _ in range(8))


class Rider(Base):
    __tablename__ = "riders"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    emergency_contacts = Column(JSON, default=list)  # list of {name, phone}
    date_of_birth = Column(String, nullable=True)  # ISO date (YYYY-MM-DD); age is a scoring input, not just display
    city = Column(String, nullable=True)

    # Vehicle — what's being insured
    bike_model = Column(String, nullable=True)
    bike_reg_number = Column(String, nullable=True)  # license plate / registration number
    bike_year = Column(Integer, nullable=True)

    # Insurance policy — reference info only; see services/insurance.py for
    # why this app doesn't itself issue, price, or bind a policy.
    insurer_name = Column(String, nullable=True)
    policy_number = Column(String, nullable=True)
    idv = Column(Float, nullable=True)  # Insured Declared Value, in rupees
    ncb_percent = Column(Float, nullable=True)  # No-Claim Bonus, 0-50
    policy_expiry = Column(String, nullable=True)  # ISO date (YYYY-MM-DD)

    # Pairing with emergency-contact accounts (see ContactUser/Connection)
    # and push delivery for ride-start pings and crash alerts.
    connect_code = Column(String, unique=True, nullable=False, default=gen_connect_code)
    push_token = Column(String, nullable=True)  # Expo push token for this device

    created_at = Column(DateTime, default=datetime.utcnow)

    trips = relationship("Trip", back_populates="rider", cascade="all, delete-orphan")
    connections = relationship("Connection", back_populates="rider", cascade="all, delete-orphan")


class ContactUser(Base):
    """An Emergency Contact Person's own account. Deliberately a separate
    table from Rider rather than a 'role' flag on one shared table: a
    contact has none of the rider-specific scoring/vehicle/policy fields,
    and keeping them separate meant this feature could be added without
    touching any existing rider/trip/scoring code."""

    __tablename__ = "contact_users"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    connect_code = Column(String, unique=True, nullable=False, default=gen_connect_code)
    push_token = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    connections = relationship("Connection", back_populates="contact", cascade="all, delete-orphan")


class CrashAlert(Base):
    """A crash (auto-detected) or manual-SOS alert raised by a rider, with
    its full lifecycle: open -> acknowledged by a contact and/or resolved by
    the rider saying they're OK. Persisted so a contact who was offline, on
    another screen, or in a build without push can still find it (replay),
    and so each side can see what the other did about it.

    Distinct from the older SosAlert (Twilio-SMS era, now dormant): that
    one tracked an SMS dispatch; this one tracks people responding."""

    __tablename__ = "crash_alerts"

    id = Column(String, primary_key=True, default=gen_id)
    trip_id = Column(String, ForeignKey("trips.id"), nullable=False, index=True)
    rider_id = Column(String, ForeignKey("riders.id"), nullable=False, index=True)
    kind = Column(String, default="crash")  # crash | manual
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    speed_kmh = Column(Float, nullable=True)
    status = Column(String, default="open")  # open | acknowledged | rider_ok
    created_at = Column(DateTime, default=datetime.utcnow)
    rider_ok_at = Column(DateTime, nullable=True)
    # [{contact_id, name, at}] — every contact who acknowledged
    acknowledged_by = Column(JSON, default=list)

    rider = relationship("Rider")


class Connection(Base):
    """A pairing between a Rider and a ContactUser. Either side can send
    the request (by entering the other's connect_code); it only starts
    sharing live location / crash alerts once the other side accepts —
    an unconfirmed one-way add would let anyone who sees a leaked code
    start receiving a stranger's live location, which is exactly the kind
    of thing this feature exists to protect against, not enable."""

    __tablename__ = "connections"

    id = Column(String, primary_key=True, default=gen_id)
    rider_id = Column(String, ForeignKey("riders.id"), nullable=False)
    contact_id = Column(String, ForeignKey("contact_users.id"), nullable=False)
    status = Column(String, default="pending")  # pending | accepted
    requested_by = Column(String, nullable=False)  # "rider" | "contact" — who sent the request
    created_at = Column(DateTime, default=datetime.utcnow)
    accepted_at = Column(DateTime, nullable=True)

    rider = relationship("Rider", back_populates="connections")
    contact = relationship("ContactUser", back_populates="connections")


class Trip(Base):
    __tablename__ = "trips"

    id = Column(String, primary_key=True, default=gen_id)
    rider_id = Column(String, ForeignKey("riders.id"), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    status = Column(String, default="active")  # active | completed | crash_flagged
    distance_km = Column(Float, default=0.0)
    duration_s = Column(Integer, default=0)
    avg_speed_kmh = Column(Float, default=0.0)
    max_speed_kmh = Column(Float, default=0.0)

    # scoring
    trip_score = Column(Float, nullable=True)
    score_breakdown = Column(JSON, nullable=True)  # per-category contributions

    rider = relationship("Rider", back_populates="trips")
    points = relationship("TripPoint", back_populates="trip", cascade="all, delete-orphan")
    events = relationship("RideEvent", back_populates="trip", cascade="all, delete-orphan")


class TripPoint(Base):
    """Raw phone-sourced samples: GPS fix plus IMU snapshot at that instant."""

    __tablename__ = "trip_points"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(String, ForeignKey("trips.id"), nullable=False, index=True)
    ts = Column(DateTime, nullable=False)  # device timestamp
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    speed_kmh = Column(Float, nullable=True)  # from GPS (or derived)
    accel_x = Column(Float, nullable=True)  # lateral g
    accel_y = Column(Float, nullable=True)  # longitudinal g
    accel_z = Column(Float, nullable=True)  # vertical g
    gyro_x = Column(Float, nullable=True)
    gyro_y = Column(Float, nullable=True)
    gyro_z = Column(Float, nullable=True)
    heading = Column(Float, nullable=True)

    trip = relationship("Trip", back_populates="points")


class RideEvent(Base):
    __tablename__ = "ride_events"

    id = Column(String, primary_key=True, default=gen_id)
    trip_id = Column(String, ForeignKey("trips.id"), nullable=False, index=True)
    event_type = Column(String, nullable=False)  # harsh_brake | harsh_accel | cornering | overspeed | crash_suspect
    severity = Column(String, nullable=False)  # low | medium | high
    ts = Column(DateTime, nullable=False)
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    peak_value = Column(Float, nullable=True)  # peak g-force or speed over limit
    duration_s = Column(Float, nullable=True)
    context = Column(JSON, nullable=True)  # {road_type, weather, speed_limit, ...}
    coach_tip = Column(String, nullable=True)

    trip = relationship("Trip", back_populates="events")


class SosAlert(Base):
    __tablename__ = "sos_alerts"

    id = Column(String, primary_key=True, default=gen_id)
    trip_id = Column(String, ForeignKey("trips.id"), nullable=False)
    rider_id = Column(String, ForeignKey("riders.id"), nullable=False)
    triggered_at = Column(DateTime, default=datetime.utcnow)
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    speed_kmh = Column(Float, nullable=True)  # last recorded speed at trigger time, sent to emergency contacts
    confirmed_ok = Column(Boolean, nullable=True)  # None = pending, True = rider confirmed ok, False = dispatched
    resolved_at = Column(DateTime, nullable=True)
    dispatched = Column(Boolean, default=False)
    contacts_notified = Column(Integer, default=0)  # how many emergency contacts an SMS actually went out to


class RewardLedger(Base):
    __tablename__ = "reward_ledger"

    id = Column(String, primary_key=True, default=gen_id)
    rider_id = Column(String, ForeignKey("riders.id"), nullable=False)
    trip_id = Column(String, ForeignKey("trips.id"), nullable=True)
    tier = Column(String, nullable=False)  # safe_rider | good_rider | needs_improvement | high_risk
    points = Column(Integer, default=0)
    reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
