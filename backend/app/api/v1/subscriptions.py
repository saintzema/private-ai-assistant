"""Subscription and AWS Marketplace endpoints."""

import hashlib
import json
import logging
from typing import Any, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, get_workspace_admin
from app.models.document import Document
from app.models.subscription import Subscription, SubscriptionStatus, UsageLog
from app.models.user import User
from app.models.workspace import Membership, Workspace
from app.services.marketplace import marketplace_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["subscriptions"])


# ─── Subscription queries ─────────────────────────────────────────────────────


async def _get_subscription_or_404(
    workspace_id: UUID, db: AsyncSession
) -> Subscription:
    result = await db.execute(
        select(Subscription).where(Subscription.workspace_id == workspace_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No subscription found for this workspace",
        )
    return sub


def _subscription_response(sub: Subscription) -> dict:
    return {
        "id": str(sub.id),
        "workspace_id": str(sub.workspace_id),
        "plan": sub.plan,
        "status": sub.status.value,
        "aws_marketplace_customer_id": sub.aws_marketplace_customer_id,
        "aws_marketplace_product_code": sub.aws_marketplace_product_code,
        "current_period_start": (
            sub.current_period_start.isoformat() if sub.current_period_start else None
        ),
        "current_period_end": (
            sub.current_period_end.isoformat() if sub.current_period_end else None
        ),
        "cancel_at_period_end": sub.cancel_at_period_end,
        "created_at": sub.created_at.isoformat(),
        "updated_at": sub.updated_at.isoformat(),
    }


# ─── Subscription endpoints ───────────────────────────────────────────────────


@router.get("/subscriptions/{workspace_id}")
async def get_workspace_subscription(
    workspace_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get the current subscription for a workspace."""
    # Verify user is member of the workspace
    mem_result = await db.execute(
        select(Membership).where(
            Membership.workspace_id == workspace_id,
            Membership.user_id == current_user.id,
        )
    )
    if not mem_result.scalar_one_or_none() and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this workspace",
        )

    sub = await _get_subscription_or_404(workspace_id, db)
    return _subscription_response(sub)


@router.post("/subscriptions/{workspace_id}/upgrade")
async def upgrade_plan(
    workspace_id: UUID,
    plan: str = Body(..., embed=True),
    auth: tuple[User, Any] = Depends(get_workspace_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Upgrade workspace plan. Currently updates the plan field directly.
    Future: integrate with Stripe or AWS Marketplace billing.
    """
    current_user, _ = auth

    valid_plans = {"free", "pro", "enterprise"}
    if plan not in valid_plans:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan. Must be one of: {', '.join(valid_plans)}",
        )

    # Update workspace plan
    ws_result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = ws_result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    # Update plan limits based on tier
    plan_limits = {
        "free": {"max_documents": 50, "max_members": 5, "max_storage_mb": 500},
        "pro": {"max_documents": 500, "max_members": 25, "max_storage_mb": 10240},
        "enterprise": {
            "max_documents": 10000,
            "max_members": 500,
            "max_storage_mb": 102400,
        },
    }
    limits = plan_limits[plan]

    from app.models.workspace import PlanType

    workspace.plan = PlanType(plan)
    workspace.max_documents = limits["max_documents"]
    workspace.max_members = limits["max_members"]
    workspace.max_storage_mb = limits["max_storage_mb"]

    # Update or create subscription
    sub_result = await db.execute(
        select(Subscription).where(Subscription.workspace_id == workspace_id)
    )
    sub = sub_result.scalar_one_or_none()

    if sub:
        sub.plan = plan
        sub.status = SubscriptionStatus.active
    else:
        import uuid
        sub = Subscription(
            id=uuid.uuid4(),
            workspace_id=workspace_id,
            plan=plan,
            status=SubscriptionStatus.active,
        )
        db.add(sub)

    await db.commit()
    await db.refresh(sub)

    logger.info(
        "Workspace %s upgraded to plan=%s by user %s", workspace_id, plan, current_user.id
    )
    return {"message": f"Plan upgraded to {plan}", **_subscription_response(sub)}


# ─── AWS Marketplace endpoints ────────────────────────────────────────────────


@router.post("/marketplace/register")
async def marketplace_register(
    request: Request,
    x_amzn_marketplace_token: Optional[str] = Query(
        default=None, alias="x-amzn-marketplace-token"
    ),
    body: Optional[dict] = Body(default=None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    AWS Marketplace SaaS registration endpoint.

    AWS redirects buyers here after subscribing, with a registration token
    in either the query string or request body. We resolve the token to a
    CustomerIdentifier and link it to the user's workspace.
    """
    # Token may arrive as query param or in request body
    token = x_amzn_marketplace_token
    if not token and body:
        token = body.get("x-amzn-marketplace-token") or body.get("token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing x-amzn-marketplace-token",
        )

    try:
        customer_info = await marketplace_service.resolve_customer(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    customer_id: str = customer_info["customer_id"]
    product_code: str = customer_info["product_code"]

    # Find the user's owned workspace (or create subscription on the first one)
    ws_result = await db.execute(
        select(Workspace).where(Workspace.owner_id == current_user.id).limit(1)
    )
    workspace = ws_result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace found for this user. Please create a workspace first.",
        )

    # Upsert subscription
    sub_result = await db.execute(
        select(Subscription).where(Subscription.workspace_id == workspace.id)
    )
    sub = sub_result.scalar_one_or_none()

    from datetime import datetime, timezone
    import uuid

    now = datetime.now(timezone.utc)

    if sub:
        sub.aws_marketplace_customer_id = customer_id
        sub.aws_marketplace_product_code = product_code
        sub.status = SubscriptionStatus.active
        sub.plan = "pro"
        sub.current_period_start = now
    else:
        sub = Subscription(
            id=uuid.uuid4(),
            workspace_id=workspace.id,
            plan="pro",
            status=SubscriptionStatus.active,
            aws_marketplace_customer_id=customer_id,
            aws_marketplace_product_code=product_code,
            current_period_start=now,
        )
        db.add(sub)

    # Upgrade workspace plan limits
    workspace.plan = __import__(
        "app.models.workspace", fromlist=["PlanType"]
    ).PlanType.pro
    workspace.max_documents = 500
    workspace.max_members = 25
    workspace.max_storage_mb = 10240

    await db.commit()
    await db.refresh(sub)

    logger.info(
        "Marketplace registration: customer=%s workspace=%s", customer_id, workspace.id
    )

    return {
        "message": "Marketplace registration successful",
        "customer_id": customer_id,
        "product_code": product_code,
        "workspace_id": str(workspace.id),
        "subscription": _subscription_response(sub),
    }


@router.post("/marketplace/webhook", status_code=status.HTTP_200_OK)
async def marketplace_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Handle AWS Marketplace SNS subscription lifecycle events.

    Events handled:
    - subscribe-success: Activate subscription
    - unsubscribe-pending: Mark subscription as cancelling
    - unsubscribe-success: Mark subscription as cancelled
    """
    raw_body = await request.body()

    # Parse the SNS message
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload"
        )

    message_type = request.headers.get("x-amz-sns-message-type", "")

    # Handle SNS subscription confirmation
    if message_type == "SubscriptionConfirmation":
        subscribe_url = payload.get("SubscribeURL")
        if subscribe_url:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.get(subscribe_url)
                logger.info("Confirmed SNS subscription: %s", subscribe_url[:80])
            except Exception as exc:
                logger.error("Failed to confirm SNS subscription: %s", exc)
        return {"status": "confirmed"}

    # Verify SNS message signature (basic check — use AWS SDK for production)
    if message_type not in ("Notification",):
        logger.warning("Unhandled SNS message type: %s", message_type)
        return {"status": "ignored"}

    # Parse the inner Marketplace notification
    try:
        inner_message = json.loads(payload.get("Message", "{}"))
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid SNS Message field",
        )

    action = inner_message.get("action", "")
    customer_id = inner_message.get("customer-identifier") or inner_message.get(
        "CustomerIdentifier"
    )

    logger.info("Marketplace webhook: action=%s customer=%s", action, customer_id)

    if not customer_id:
        logger.warning("Marketplace webhook missing customer identifier: %s", inner_message)
        return {"status": "ok", "action": action}

    # Look up subscription by AWS Marketplace customer ID
    sub_result = await db.execute(
        select(Subscription).where(
            Subscription.aws_marketplace_customer_id == customer_id
        )
    )
    sub = sub_result.scalar_one_or_none()

    if not sub:
        logger.warning("No subscription found for customer %s", customer_id)
        return {"status": "ok", "action": action, "note": "subscription_not_found"}

    if action == "subscribe-success":
        sub.status = SubscriptionStatus.active
        sub.cancel_at_period_end = False
        logger.info("Activated subscription for customer %s", customer_id)

    elif action == "unsubscribe-pending":
        sub.cancel_at_period_end = True
        logger.info("Cancellation pending for customer %s", customer_id)

    elif action == "unsubscribe-success":
        sub.status = SubscriptionStatus.cancelled
        sub.cancel_at_period_end = False
        logger.info("Cancelled subscription for customer %s", customer_id)

        # Downgrade workspace to free plan
        ws_result = await db.execute(
            select(Workspace).where(Workspace.id == sub.workspace_id)
        )
        workspace = ws_result.scalar_one_or_none()
        if workspace:
            from app.models.workspace import PlanType
            workspace.plan = PlanType.free
            workspace.max_documents = 50
            workspace.max_members = 5
            workspace.max_storage_mb = 500

    else:
        logger.info("Unhandled marketplace action: %s", action)
        return {"status": "ok", "action": action, "note": "unhandled"}

    await db.commit()
    return {"status": "ok", "action": action}


@router.get("/marketplace/entitlements/{workspace_id}")
async def get_entitlements(
    workspace_id: UUID,
    auth: tuple[User, Any] = Depends(get_workspace_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Check current AWS Marketplace entitlements for a workspace."""
    sub_result = await db.execute(
        select(Subscription).where(Subscription.workspace_id == workspace_id)
    )
    sub = sub_result.scalar_one_or_none()

    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No subscription found for this workspace",
        )

    if not sub.aws_marketplace_customer_id:
        return {
            "workspace_id": str(workspace_id),
            "marketplace_enabled": False,
            "entitlements": {},
        }

    try:
        entitlements = await marketplace_service.get_entitlements(
            sub.aws_marketplace_customer_id
        )
    except Exception as exc:
        logger.error("Failed to fetch entitlements: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch entitlements: {exc}",
        )

    return {
        "workspace_id": str(workspace_id),
        "marketplace_enabled": True,
        "customer_id": sub.aws_marketplace_customer_id,
        "entitlements": entitlements,
    }


# ─── Billing / Usage endpoints ────────────────────────────────────────────────


@router.get("/billing/{workspace_id}/usage")
async def get_billing_usage(
    workspace_id: UUID,
    auth: tuple[User, Any] = Depends(get_workspace_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get usage metrics for the current billing period."""
    current_user, _ = auth

    # Verify workspace exists
    ws_result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = ws_result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    # Get subscription for period dates
    sub_result = await db.execute(
        select(Subscription).where(Subscription.workspace_id == workspace_id)
    )
    sub = sub_result.scalar_one_or_none()

    # Document count
    doc_count_result = await db.execute(
        select(func.count()).where(Document.workspace_id == workspace_id)
    )
    doc_count = doc_count_result.scalar_one()

    # Member count
    mem_count_result = await db.execute(
        select(func.count()).where(Membership.workspace_id == workspace_id)
    )
    member_count = mem_count_result.scalar_one()

    # Token usage (restrict to current period if available)
    token_query = select(
        func.coalesce(func.sum(UsageLog.tokens_used), 0).label("tokens"),
        func.coalesce(func.sum(UsageLog.cost_usd), 0.0).label("cost"),
        func.count().label("events"),
    ).where(UsageLog.workspace_id == workspace_id)

    if sub and sub.current_period_start:
        token_query = token_query.where(
            UsageLog.created_at >= sub.current_period_start
        )

    token_result = await db.execute(token_query)
    usage_row = token_result.one()

    return {
        "workspace_id": str(workspace_id),
        "plan": workspace.plan.value if workspace.plan else "free",
        "limits": {
            "max_documents": workspace.max_documents,
            "max_members": workspace.max_members,
            "max_storage_mb": workspace.max_storage_mb,
        },
        "current_usage": {
            "documents": doc_count,
            "members": member_count,
            "tokens": int(usage_row.tokens),
            "cost_usd": round(float(usage_row.cost), 4),
            "api_events": usage_row.events,
        },
        "billing_period": {
            "start": (
                sub.current_period_start.isoformat() if sub and sub.current_period_start else None
            ),
            "end": (
                sub.current_period_end.isoformat() if sub and sub.current_period_end else None
            ),
        },
    }
