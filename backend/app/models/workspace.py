"""
SQLAlchemy ORM models for workspaces and workspace memberships.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class PlanType(str, enum.Enum):
    free = "free"
    pro = "pro"
    enterprise = "enterprise"


class MemberRole(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    member = "member"
    viewer = "viewer"


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    plan: Mapped[PlanType] = mapped_column(
        Enum(PlanType, name="plan_type"),
        default=PlanType.free,
        nullable=False,
    )

    # Plan limits
    max_documents: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    max_members: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    max_storage_mb: Mapped[int] = mapped_column(Integer, default=500, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

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

    # ─── Relationships ────────────────────────────────────────────────────────

    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id])  # noqa: F821
    memberships: Mapped[list["Membership"]] = relationship(
        "Membership",
        back_populates="workspace",
        cascade="all, delete-orphan",
    )
    documents: Mapped[list["Document"]] = relationship(  # noqa: F821
        "Document",
        back_populates="workspace",
        cascade="all, delete-orphan",
    )
    chats: Mapped[list["Chat"]] = relationship(  # noqa: F821
        "Chat",
        back_populates="workspace",
        cascade="all, delete-orphan",
    )
    subscription: Mapped["Subscription"] = relationship(  # noqa: F821
        "Subscription",
        back_populates="workspace",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Workspace id={self.id} name={self.name} plan={self.plan}>"


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_membership_workspace_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[MemberRole] = mapped_column(
        Enum(MemberRole, name="member_role"),
        default=MemberRole.member,
        nullable=False,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Invitation token (cleared after join)
    invitation_token: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )
    invitation_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # ─── Relationships ────────────────────────────────────────────────────────

    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        back_populates="memberships",
    )
    user: Mapped["User"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[user_id],
        back_populates="memberships",
    )
    inviter: Mapped["User | None"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[invited_by],
    )

    def __repr__(self) -> str:
        return f"<Membership workspace={self.workspace_id} user={self.user_id} role={self.role}>"
