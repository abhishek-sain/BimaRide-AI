from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

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
