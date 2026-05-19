from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import PostgresDsn, RedisDsn

class Settings(BaseSettings):
    PROJECT_NAME: str = "URL Shortener"
    
    # Postgres
    DATABASE_URL: PostgresDsn
    
    # Redis
    REDIS_URL: RedisDsn
    
    # Security
    API_KEY_SECRET: str
    JWT_SECRET_KEY: str = "change-me-in-production-12345"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24
    
    # Email (Gmail SMTP via App Password)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None        # your Gmail address
    SMTP_PASSWORD: str | None = None    # Gmail App Password (not your login password)
    
    # App specific
    SHORT_CODE_LENGTH: int = 7
    
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
