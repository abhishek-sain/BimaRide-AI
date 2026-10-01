from datetime import datetime, timedelta, timezone
from typing import Literal, NamedTuple, Optional

import bcrypt
from jose import jwt

from app.core.config import settings

AccountType = Literal["rider", "contact"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode()[:72], hashed.encode())


def create_access_token(subject: str, account_type: AccountType = "rider") -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "acct": account_type, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


class DecodedToken(NamedTuple):
    subject: str
    account_type: AccountType


def decode_access_token(token: str) -> Optional[DecodedToken]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        subject = payload.get("sub")
        if not subject:
            return None
        # Tokens issued before account types existed have no "acct" claim —
        # every one of those was a rider token, so default to that rather
        # than invalidating every session already out there.
        account_type = payload.get("acct", "rider")
        return DecodedToken(subject=subject, account_type=account_type)
    except Exception:
        return None
