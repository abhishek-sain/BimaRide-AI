from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_rider
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.models import Rider
from app.schemas.schemas import (
    EmergencyContactsUpdate,
    ProfileUpdate,
    PushTokenUpdate,
    RiderCreate,
    RiderLogin,
    RiderOut,
    Token,
)

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_EMERGENCY_CONTACTS = 5


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


@router.put("/me", response_model=RiderOut)
def update_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    """Fills in the rest of the profile: personal details, the vehicle
    being insured, and reference-only insurance policy info (insurer name,
    policy number, IDV, NCB, expiry). These policy fields are captured for
    display and future underwriting integration only — this app doesn't
    itself price or issue a policy; see the README's "How the insurance
    process works" section. Only fields present in the request are
    changed, so the app can save one section (e.g. just the vehicle)
    without wiping the others.

    Format validation (phone shape, ISO dates, field lengths) lives on
    ProfileUpdate in schemas.py so the same rules apply everywhere this
    data comes in, not just here — this endpoint only checks the one thing
    that needs the field's own value trimmed first: a name that's only
    whitespace passes Pydantic's min_length=1 but isn't a real name."""
    updates = payload.model_dump(exclude_unset=True)

    if "name" in updates and not (updates["name"] or "").strip():
        raise HTTPException(status_code=400, detail="Name can't be empty.")

    for field, value in updates.items():
        setattr(rider, field, value.strip() if isinstance(value, str) else value)

    db.commit()
    db.refresh(rider)
    return rider


@router.put("/me/emergency-contacts", response_model=RiderOut)
def update_emergency_contacts(
    payload: EmergencyContactsUpdate,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    """Replaces the rider's full emergency-contact list. These are the
    numbers an automatic crash-detected or manual SOS dispatch texts with
    the rider's location and last recorded speed (see api/sos.py). Phone
    format is validated on EmergencyContact itself (schemas.py); the
    whitespace-only-name check here exists for the same reason as in
    update_profile above — min_length=1 alone doesn't catch it."""
    if len(payload.contacts) > MAX_EMERGENCY_CONTACTS:
        raise HTTPException(
            status_code=400, detail=f"You can save at most {MAX_EMERGENCY_CONTACTS} emergency contacts."
        )
    for contact in payload.contacts:
        if not contact.name.strip():
            raise HTTPException(status_code=400, detail="Each contact needs a name.")

    rider.emergency_contacts = [{"name": c.name.strip(), "phone": c.phone.strip()} for c in payload.contacts]
    db.commit()
    db.refresh(rider)
    return rider


@router.put("/me/push-token", response_model=RiderOut)
def update_push_token(
    payload: PushTokenUpdate,
    db: Session = Depends(get_db),
    rider: Rider = Depends(get_current_rider),
):
    """Saves this device's Expo push token — not used to alert emergency
    contacts (that's the contact's OWN push token, registered via
    contacts_auth.py), but to push to the rider themselves, e.g. when a
    contact accepts their connection request."""
    rider.push_token = payload.push_token
    db.commit()
    db.refresh(rider)
    return rider
