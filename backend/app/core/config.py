import secrets
import warnings

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "BimaRide AI"
    database_url: str = "sqlite:///./bimaride.db"
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    anthropic_api_key: str = ""
    insurer_api_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()

if not settings.jwt_secret:
    # No hardcoded fallback secret (a static default would let anyone forge
    # rider tokens). Generate a random one for local/dev convenience — set
    # JWT_SECRET in .env for anything where issued tokens need to survive a
    # restart or be shared across processes.
    settings.jwt_secret = secrets.token_urlsafe(32)
    warnings.warn(
        "JWT_SECRET is not set — generated a random secret for this process. "
        "All existing tokens will be invalidated on restart. Set JWT_SECRET "
        "in backend/.env before deploying.",
        stacklevel=1,
    )

if not settings.insurer_api_key:
    settings.insurer_api_key = secrets.token_urlsafe(24)
    warnings.warn(
        f"INSURER_API_KEY is not set — generated one for this process: "
        f"{settings.insurer_api_key}. Set INSURER_API_KEY in backend/.env "
        f"to keep it stable across restarts.",
        stacklevel=1,
    )
