"""
Pydantic v2 schemas for subscriptions, usage, API keys, and AWS Marketplace.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.subscription import SubscriptionStatus


# ─── Subscription Schemas ─────────────────────────────────────────────────────


class SubscriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    plan: str
    status: SubscriptionStatus
    aws_marketplace_customer_id: Optional[str] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool
    created_at: datetime
    updated_at: datetime


class UpgradePlan(BaseModel):
    plan: str = Field(..., pattern=r"^(pro|enterprise)$")


# ─── Usage Schemas ────────────────────────────────────────────────────────────


class UsageStats(BaseModel):
    workspace_id: UUID
    period_start: datetime
    period_end: datetime
    total_tokens_used: int
    total_cost_usd: float
    chat_requests: int
    documents_processed: int
    api_calls: int
    breakdown: dict[str, Any] = {}


# ─── API Key Schemas ──────────────────────────────────────────────────────────


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    scopes: list[str] = Field(default=["read"])
    expires_at: Optional[datetime] = None


class ApiKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    user_id: UUID
    name: str
    key_prefix: str
    scopes: Optional[list[str]] = None
    is_active: bool
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_at: datetime


class ApiKeyCreatedResponse(ApiKeyResponse):
    """Returned only once at creation time — includes the raw key."""
    raw_key: str


# ─── AWS Marketplace Schemas ──────────────────────────────────────────────────


class MarketplaceToken(BaseModel):
    """Incoming registration token from AWS Marketplace redirect."""
    x_amzn_marketplace_token: str = Field(..., alias="x-amzn-marketplace-Token")

    model_config = ConfigDict(populate_by_name=True)


class MarketplaceRegisterRequest(BaseModel):
    token: str
    workspace_id: UUID


class EntitlementCheck(BaseModel):
    workspace_id: UUID
    customer_id: str
    product_code: str
    is_entitled: bool
    dimensions: dict[str, Any] = {}
    expiration_date: Optional[datetime] = None


class MarketplaceWebhookEvent(BaseModel):
    """Generic wrapper for AWS Marketplace SNS webhook events."""
    action: str
    customer_identifier: Optional[str] = None
    product_code: Optional[str] = None
    offer_identifier: Optional[str] = None
    entitlement: Optional[dict[str, Any]] = None
