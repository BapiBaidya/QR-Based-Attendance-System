from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Enterprise QR Attendance System"
    API_V1_STR: str = "/api/v1"
    
    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Security
    SECRET_KEY: str = "dev_insecure_fallback_key_for_local_development_only_123456789"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day for development
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"
    
    # Dynamic QR Security Parameters
    QR_EXPIRY_SECONDS: int = 20
    QR_DRIFT_TOLERANCE_SECONDS: int = 5
    
    # CORS (Strict origin list without wildcard to prevent CSRF and allow credentials)
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://localhost:8081",  # Expo Dev
        "http://127.0.0.1:8081"
    ]
    
    # Database Configuration (PostgreSQL)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:123@localhost:5432/attendance_db"
    SYNC_DATABASE_URL: str = "postgresql+psycopg2://postgres:123@localhost:5432/attendance_db"
    
    # Redis Cache & Nonce store
    REDIS_URL: str = "redis://localhost:6379/0"

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str, info) -> str:
        # In production, prevent startup if using insecure or default keys
        env = info.data.get("ENVIRONMENT", "development")
        if env == "production" and ("fallback" in v.lower() or len(v) < 32):
            raise ValueError(
                "CRITICAL SECURITY ERROR: A secure, unique SECRET_KEY of at least 32 characters must be set in production!"
            )
        return v
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
