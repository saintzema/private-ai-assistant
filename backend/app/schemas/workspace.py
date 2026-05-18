"""
Pydantic v2 schemas for workspaces and memberships.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.workspace import MemberRole, PlanType


# ─── Workspace Schemas ────────────────────────────────────────────────────────


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=3, max_length=100, pattern=r"^[a-z0-9-]+$")
    description: Optional[str] = Field(None, max_length=1000)
    logo_url: Optional[str] = Field(None, max_length=2048)

    @field_validator("slug")
    @classmethod
    def slug_lowercase(cls, v: str) -> str:
        return v.lower()


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    logo_url: Optional[str] = Field(None, max_length=2048)


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    logo_url: Optional[str] = None
    owner_id: UUID
    plan: PlanType
    max_documents: int
    max_members: int
    max_storage_mb: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class WorkspaceListResponse(BaseModel):
    workspaces: list[WorkspaceResponse]
    total: int


# ─── Membership Schemas ───────────────────────────────────────────────────────


class MembershipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    user_id: UUID
    role: MemberRole
    joined_at: datetime
    invited_by: Optional[UUID] = None

    # Denormalized user info (populated in API layer)
    user_email: Optional[str] = None
    user_full_name: Optional[str] = None
    user_avatar_url: Optional[str] = None


class InviteMember(BaseModel):
    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: MemberRole = MemberRole.member


class UpdateMemberRole(BaseModel):
    role: MemberRole

    @field_validator("role")
    @classmethod
    def cannot_set_owner(cls, v: MemberRole) -> MemberRole:
        if v == MemberRole.owner:
            raise ValueError("Cannot assign 'owner' role directly. Transfer ownership instead.")
        return v


# ─── Stats ────────────────────────────────────────────────────────────────────


class WorkspaceStats(BaseModel):
    workspace_id: UUID
    total_documents: int
    total_members: int
    total_chats: int
    total_messages: int
    storage_used_mb: float
    storage_limit_mb: int
    document_limit: int
    member_limit: int
    tokens_used_this_period: int
    plan: PlanType
