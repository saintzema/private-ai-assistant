"""
Async SQLAlchemy database engine setup with pgvector support.
"""

import logging
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base
from sqlalchemy import text

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Engine ──────────────────────────────────────────────────────────────────

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=3600,
)

# ─── Session Factory ─────────────────────────────────────────────────────────

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# ─── Declarative Base ────────────────────────────────────────────────────────

Base = declarative_base()


# ─── Dependency ──────────────────────────────────────────────────────────────

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that provides a database session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ─── Initialization ──────────────────────────────────────────────────────────

async def init_db() -> None:
    """
    Initialize the database:
    - Enable the pgvector extension
    - Create all tables defined in the metadata
    """
    async with engine.begin() as conn:
        # Enable pgvector extension (must exist in pg instance)
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        logger.info("pgvector extension enabled.")

        # Import all models so Base.metadata is populated
        from app.models import (  # noqa: F401
            user,
            workspace,
            document,
            chat,
            subscription,
        )

        await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created (if not already present).")
