"""
Application configuration using Pydantic Settings v2.
All environment variables are defined here with proper types and defaults.
"""

from typing import List, Optional
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── Application ─────────────────────────────────────────────────────────
    APP_NAME: str = "Private AI Knowledge Assistant"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"  # development | staging | production
    DEBUG: bool = False

    # ─── Security ────────────────────────────────────────────────────────────
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ─── Database ────────────────────────────────────────────────────────────
    DATABASE_URL: str  # postgresql+asyncpg://user:pass@host:5432/db

    # ─── Redis ───────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ─── CORS ────────────────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8080"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # ─── AI / Embeddings ─────────────────────────────────────────────────────
    EMBEDDING_PROVIDER: str = "openai"  # openai | bedrock
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    OPENAI_CHAT_MODEL: str = "gpt-4o"

    # ─── AWS ─────────────────────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "us-east-1"

    # ─── S3 ──────────────────────────────────────────────────────────────────
    S3_BUCKET_NAME: str = "private-ai-documents"
    S3_PRESIGNED_URL_EXPIRY: int = 3600  # seconds

    # ─── Bedrock ─────────────────────────────────────────────────────────────
    AWS_BEDROCK_MODEL_ID: str = "anthropic.claude-3-5-sonnet-20241022-v2:0"
    AWS_BEDROCK_EMBEDDING_MODEL_ID: str = "amazon.titan-embed-text-v2:0"

    # ─── AWS Marketplace ─────────────────────────────────────────────────────
    AWS_MARKETPLACE_PRODUCT_CODE: Optional[str] = None
    AWS_MARKETPLACE_REGION: str = "us-east-1"

    # ─── Email / SMTP ─────────────────────────────────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    FROM_EMAIL: str = "noreply@example.com"
    FROM_NAME: str = "Private AI Assistant"

    # ─── Rate Limiting ───────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_PER_IP_PER_MINUTE: int = 100
    RATE_LIMIT_UPLOAD_PER_HOUR: int = 10
    RATE_LIMIT_CHAT_PER_DAY: int = 100

    # ─── Document Processing ──────────────────────────────────────────────────
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_FILE_TYPES: List[str] = ["pdf", "docx", "txt", "csv"]
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 50
    EMBEDDING_DIMENSION: int = 1536

    # ─── Frontend ────────────────────────────────────────────────────────────
    FRONTEND_URL: str = "http://localhost:3000"

    @model_validator(mode="after")
    def validate_provider_credentials(self) -> "Settings":
        if self.EMBEDDING_PROVIDER == "openai" and not self.OPENAI_API_KEY:
            raise ValueError(
                "OPENAI_API_KEY is required when EMBEDDING_PROVIDER is 'openai'"
            )
        if self.EMBEDDING_PROVIDER == "bedrock":
            if not self.AWS_ACCESS_KEY_ID or not self.AWS_SECRET_ACCESS_KEY:
                raise ValueError(
                    "AWS credentials are required when EMBEDDING_PROVIDER is 'bedrock'"
                )
        return self

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"


settings = Settings()
