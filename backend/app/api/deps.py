import hmac

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.models import Rider

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_rider(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> Rider:
    rider_id = decode_access_token(token)
    if not rider_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    rider = db.query(Rider).filter(Rider.id == rider_id).first()
    if not rider:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Rider not found")
    return rider


def require_insurer_api_key(x_insurer_api_key: str = Header(default="")) -> None:
    """Gates the insurer console's read endpoints, which otherwise expose
    every rider's name, location history and event data to anyone who can
    reach the API. MVP-level protection (one shared key) — replace with a
    real insurer-org login before a pilot."""
    if not x_insurer_api_key or not hmac.compare_digest(x_insurer_api_key, settings.insurer_api_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid insurer API key")
