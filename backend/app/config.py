from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Demo tooling is explicitly disabled outside local development.
    environment: str = "development"
    # SQLite remains a development/test fallback; Compose supplies PostgreSQL.
    database_url: str = "sqlite:///./myfinance.db"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    max_users: int = Field(default=5, ge=1)
    jwt_secret: str = "change-me-before-using-authentication"
    min_password_length: int = Field(default=10, ge=1)
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 30
    log_level: str = "INFO"
    upload_max_bytes: int = 2 * 1024 * 1024

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.lstrip().startswith("["):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
