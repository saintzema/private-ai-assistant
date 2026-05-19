"""
SQLAlchemy ORM model for the users table.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status flags
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    last_login: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Token columns
    email_verification_token: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )
    password_reset_token: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )
    password_reset_expires: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # ─── Relationships ────────────────────────────────────────────────────────

    memberships: Mapped[list["Membership"]] = relationship(  # noqa: F821
        "Membership",
        foreign_keys="[Membership.user_id]",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    chats: Mapped[list["Chat"]] = relationship(  # noqa: F821
        "Chat",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    api_keys: Mapped[list["ApiKey"]] = relationship(  # noqa: F821
        "ApiKey",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    usage_logs: Mapped[list["UsageLog"]] = relationship(  # noqa: F821
        "UsageLog",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email}>"
