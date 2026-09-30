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


class Rider(Base):
    __tablename__ = "riders"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    emergency_contacts = Column(JSON, default=list)  # list of {name, phone}
    bike_model = Column(String, nullable=True)
    city = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    trips = relationship("Trip", back_populates="rider", cascade="all, delete-orphan")


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
