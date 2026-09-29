from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "BimaRide AI"
    database_url: str = "sqlite:///./bimaride.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    anthropic_api_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
