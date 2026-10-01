"""Auth for Emergency Contact Person accounts — mirrors api/auth.py's
rider auth, kept as a separate router/account type rather than a role
flag on Rider (see models.ContactUser's docstring for why)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_contact
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.models import ContactUser
from app.schemas.schemas import (
    ContactUserCreate,
    ContactUserLogin,
    ContactUserOut,
    PushTokenUpdate,
    Token,
)

router = APIRouter(prefix="/contact-auth", tags=["contact-auth"])


@router.post("/register", response_model=Token)
def register(payload: ContactUserCreate, db: Session = Depends(get_db)):
    if db.query(ContactUser).filter(ContactUser.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    contact = ContactUser(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        phone=payload.phone,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return Token(access_token=create_access_token(contact.id, account_type="contact"))


@router.post("/login", response_model=Token)
def login(payload: ContactUserLogin, db: Session = Depends(get_db)):
    contact = db.query(ContactUser).filter(ContactUser.email == payload.email).first()
    if not contact or not verify_password(payload.password, contact.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return Token(access_token=create_access_token(contact.id, account_type="contact"))


@router.get("/me", response_model=ContactUserOut)
def me(current: ContactUser = Depends(get_current_contact)):
    return current


@router.put("/me/push-token", response_model=ContactUserOut)
def update_push_token(
    payload: PushTokenUpdate,
    db: Session = Depends(get_db),
    contact: ContactUser = Depends(get_current_contact),
):
    """Saves this device's Expo push token — this IS the token that
    receives ride-start pings, live-location updates, and crash alerts
    for every rider this contact is connected to."""
    contact.push_token = payload.push_token
    db.commit()
    db.refresh(contact)
    return contact
