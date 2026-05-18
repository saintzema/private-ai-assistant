"""Admin-only endpoints for platform management."""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_super_admin
from app.models.document import Document, DocumentChunk
from app.models.subscription import UsageLog
from app.models.user import User
from app.models.workspace import Membership, Workspace

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ─── Response helpers ─────────────────────────────────────────────────────────


def _user_detail(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "full_name": u.full_name,
        "is_active": u.is_active,
        "is_verified": u.is_verified,
        "is_superuser": u.is_superuser,
        "created_at": u.created_at.isoformat(),
        "last_login": u.last_login.isoformat() if u.last_login else None,
    }


def _workspace_detail(w: Workspace) -> dict:
    return {
        "id": str(w.id),
        "name": w.name,
        "slug": w.slug,
        "description": w.description,
        "plan": w.plan.value if w.plan else None,
        "is_active": w.is_active,
        "max_documents": w.max_documents,
        "max_members": w.max_members,
        "max_storage_mb": w.max_storage_mb,
        "owner_id": str(w.owner_id),
        "created_at": w.created_at.isoformat(),
    }


# ─── User Management ──────────────────────────────────────────────────────────


@router.get("/users")
async def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    search: Optional[str] = Query(default=None, description="Search by email or name"),
    is_active: Optional[bool] = Query(default=None),
    _admin: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List all users with optional search and status filtering."""
    query = select(User)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            (User.email.ilike(search_term)) | (User.full_name.ilike(search_term))
        )

    if is_active is not None:
        query = query.where(User.is_active == is_active)

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Paginated results
    query = query.order_by(User.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_user_detail(u) for u in users],
    }


@router.get("/users/{user_id}")
async def get_user(
    user_id: UUID,
    _admin: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get full details for a specific user including workspace memberships."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Fetch memberships
    mem_result = await db.execute(
        select(Membership).where(Membership.user_id == user_id)
    )
    memberships = mem_result.scalars().all()

    detail = _user_detail(user)
    detail["memberships"] = [
        {
            "workspace_id": str(m.workspace_id),
            "role": m.role.value,
            "joined_at": m.joined_at.isoformat(),
        }
        for m in memberships
    ]
    return detail


@router.put("/users/{user_id}/status")
async def toggle_user_status(
    user_id: UUID,
    is_active: bool,
    _admin: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Activate or deactivate a user account."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == _admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own account status",
        )

    user.is_active = is_active
    await db.commit()
    await db.refresh(user)

    logger.info("Admin %s set user %s active=%s", _admin.id, user_id, is_active)
    return {"id": str(user.id), "is_active": user.is_active, "message": "Status updated"}


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    _admin: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a user and all associated data (cascades via DB)."""
    if user_id == _admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()
    logger.info("Admin %s deleted user %s", _admin.id, user_id)


# ─── Workspace Management ─────────────────────────────────────────────────────


@router.get("/workspaces")
async def list_workspaces(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    search: Optional[str] = Query(default=None, description="Search by name or slug"),
    is_active: Optional[bool] = Query(default=None),
    _admin: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List all workspaces with optional filtering."""
    query = select(Workspace)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            (Workspace.name.ilike(search_term)) | (Workspace.slug.ilike(search_term))
        )

    if is_active is not None:
        query = query.where(Workspace.is_active == is_active)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    query = query.order_by(Workspace.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    workspaces = result.scalars().all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_workspace_detail(w) for w in workspaces],
    }


@router.get("/workspaces/{workspace_id}")
async def get_workspace(
    workspace_id: UUID,
    _admin: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get full workspace details including member count and document count."""
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    # Member count
    mem_count_result = await db.execute(
        select(func.count()).where(Membership.workspace_id == workspace_id)
    )
    member_count = mem_count_result.scalar_one()

    # Document count
    doc_count_result = await db.execute(
        select(func.count()).where(Document.workspace_id == workspace_id)
    )
    doc_count = doc_count_result.scalar_one()

    detail = _workspace_detail(workspace)
    detail["member_count"] = member_count
    detail["document_count"] = doc_count
    return detail


@router.delete("/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: UUID,
    _admin: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a workspace and all associated data."""
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    await db.execute(delete(Workspace).where(Workspace.id == workspace_id))
    await db.commit()
    logger.info("Admin %s deleted workspace %s", _admin.id, workspace_id)


# ─── Platform Stats ───────────────────────────────────────────────────────────


@router.get("/stats")
async def get_platform_stats(
    _admin: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Aggregate platform-level statistics."""
    # User stats
    total_users_result = await db.execute(select(func.count()).select_from(User))
    total_users = total_users_result.scalar_one()

    active_users_result = await db.execute(
        select(func.count()).where(User.is_active == True)  # noqa: E712
    )
    active_users = active_users_result.scalar_one()

    # Workspace stats
    total_ws_result = await db.execute(select(func.count()).select_from(Workspace))
    total_workspaces = total_ws_result.scalar_one()

    active_ws_result = await db.execute(
        select(func.count()).where(Workspace.is_active == True)  # noqa: E712
    )
    active_workspaces = active_ws_result.scalar_one()

    # Document stats
    total_docs_result = await db.execute(select(func.count()).select_from(Document))
    total_documents = total_docs_result.scalar_one()

    total_chunks_result = await db.execute(select(func.count()).select_from(DocumentChunk))
    total_chunks = total_chunks_result.scalar_one()

    # Token usage
    total_tokens_result = await db.execute(
        select(func.coalesce(func.sum(UsageLog.tokens_used), 0))
    )
    total_tokens = total_tokens_result.scalar_one()

    total_cost_result = await db.execute(
        select(func.coalesce(func.sum(UsageLog.cost_usd), 0.0))
    )
    total_cost_usd = total_cost_result.scalar_one()

    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "inactive": total_users - active_users,
        },
        "workspaces": {
            "total": total_workspaces,
            "active": active_workspaces,
        },
        "documents": {
            "total": total_documents,
            "total_chunks": total_chunks,
        },
        "usage": {
            "total_tokens": int(total_tokens),
            "total_cost_usd": round(float(total_cost_usd), 4),
        },
    }


@router.get("/usage")
async def get_aggregate_usage(
    from_date: Optional[str] = Query(
        default=None, description="ISO date string e.g. 2024-01-01"
    ),
    to_date: Optional[str] = Query(
        default=None, description="ISO date string e.g. 2024-12-31"
    ),
    workspace_id: Optional[UUID] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
    _admin: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Aggregate usage metrics filtered by date range and optional workspace."""
    from datetime import datetime, timezone

    query = select(UsageLog)

    if from_date:
        try:
            dt_from = datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc)
            query = query.where(UsageLog.created_at >= dt_from)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid from_date format. Use ISO 8601 (e.g. 2024-01-01).",
            )

    if to_date:
        try:
            dt_to = datetime.fromisoformat(to_date).replace(tzinfo=timezone.utc)
            query = query.where(UsageLog.created_at <= dt_to)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid to_date format. Use ISO 8601 (e.g. 2024-12-31).",
            )

    if workspace_id:
        query = query.where(UsageLog.workspace_id == workspace_id)

    # Aggregate totals
    agg_query = select(
        func.count().label("event_count"),
        func.coalesce(func.sum(UsageLog.tokens_used), 0).label("total_tokens"),
        func.coalesce(func.sum(UsageLog.cost_usd), 0.0).label("total_cost_usd"),
    )
    if from_date:
        agg_query = agg_query.where(UsageLog.created_at >= dt_from)
    if to_date:
        agg_query = agg_query.where(UsageLog.created_at <= dt_to)
    if workspace_id:
        agg_query = agg_query.where(UsageLog.workspace_id == workspace_id)

    agg_result = await db.execute(agg_query)
    agg_row = agg_result.one()

    # Paginated log entries
    count_q = select(func.count()).select_from(query.subquery())
    count_result = await db.execute(count_q)
    total = count_result.scalar_one()

    query = query.order_by(UsageLog.created_at.desc()).offset(skip).limit(limit)
    rows_result = await db.execute(query)
    logs = rows_result.scalars().all()

    return {
        "summary": {
            "event_count": agg_row.event_count,
            "total_tokens": int(agg_row.total_tokens),
            "total_cost_usd": round(float(agg_row.total_cost_usd), 4),
        },
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [
            {
                "id": str(log.id),
                "workspace_id": str(log.workspace_id),
                "user_id": str(log.user_id) if log.user_id else None,
                "action": log.action,
                "resource_type": log.resource_type,
                "tokens_used": log.tokens_used,
                "cost_usd": log.cost_usd,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ],
    }
