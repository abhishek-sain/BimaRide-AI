from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_rider
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.models import Rider
from app.schemas.schemas import RiderCreate, RiderLogin, RiderOut, Token

router = APIRouter(prefix="/auth", tags=["auth"])


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
