import hmac
from typing import Union

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.models import ContactUser, Rider

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_rider(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> Rider:
    decoded = decode_access_token(token)
    if not decoded or decoded.account_type != "rider":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    rider = db.query(Rider).filter(Rider.id == decoded.subject).first()
    if not rider:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Rider not found")
    return rider


def get_current_contact(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> ContactUser:
    decoded = decode_access_token(token)
    if not decoded or decoded.account_type != "contact":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    contact = db.query(ContactUser).filter(ContactUser.id == decoded.subject).first()
    if not contact:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Contact not found")
    return contact


def get_current_account(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> Union[Rider, ContactUser]:
    """For endpoints either account type can call (the connections API:
    pairing is symmetric, either side can request or accept)."""
    decoded = decode_access_token(token)
    if not decoded:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    if decoded.account_type == "rider":
        account = db.query(Rider).filter(Rider.id == decoded.subject).first()
    else:
        account = db.query(ContactUser).filter(ContactUser.id == decoded.subject).first()
    if not account:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found")
    return account


def require_insurer_api_key(x_insurer_api_key: str = Header(default="")) -> None:
    """Gates the insurer console's read endpoints, which otherwise expose
    every rider's name, location history and event data to anyone who can
    reach the API. MVP-level protection (one shared key) — replace with a
    real insurer-org login before a pilot."""
    if not x_insurer_api_key or not hmac.compare_digest(x_insurer_api_key, settings.insurer_api_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid insurer API key")
