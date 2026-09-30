import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_rider
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.models import Rider
from app.schemas.schemas import EmergencyContactsUpdate, RiderCreate, RiderLogin, RiderOut, Token

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_EMERGENCY_CONTACTS = 5
PHONE_RE = re.compile(r"^\+?[0-9 ()-]{7,20}$")


@router.post("/register", response_model=Token)
def register(payload: RiderCreate, db: Session = Depends(get_db)):
    if db.query(Rider).filter(Rider.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    rider = Rider(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        phone=payload.phone,
        bike_model=payload.bike_model,
        city=payload.city,
    )
    db.add(rider)
    db.commit()
    db.refresh(rider)
    return Token(access_token=create_access_token(rider.id))


@router.post("/login", response_model=Token)
def login(payload: RiderLogin, db: Session = Depends(get_db)):
    rider = db.query(Rider).filter(Rider.email == payload.email).first()
    if not rider or not verify_password(payload.password, rider.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return Token(access_token=create_access_token(rider.id))


@router.get("/me", response_model=RiderOut)
def me(current: Rider = Depends(get_current_rider)):
    return current


@router.put("/me/emergency-contacts", response_model=RiderOut)
def update_emergency_contacts(
    payload: EmergencyContactsUpdate,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    """Replaces the rider's full emergency-contact list. These are the
    numbers an automatic crash-detected or manual SOS dispatch texts with
    the rider's location and last recorded speed (see api/sos.py)."""
    if len(payload.contacts) > MAX_EMERGENCY_CONTACTS:
        raise HTTPException(
            status_code=400, detail=f"You can save at most {MAX_EMERGENCY_CONTACTS} emergency contacts."
        )
    for contact in payload.contacts:
        if not contact.name.strip():
            raise HTTPException(status_code=400, detail="Each contact needs a name.")
        if not PHONE_RE.match(contact.phone.strip()):
            raise HTTPException(status_code=400, detail=f"'{contact.phone}' doesn't look like a valid phone number.")

    rider.emergency_contacts = [{"name": c.name.strip(), "phone": c.phone.strip()} for c in payload.contacts]
    db.commit()
    db.refresh(rider)
    return rider
