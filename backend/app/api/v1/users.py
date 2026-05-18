"""
User management endpoints: profile, password change, API key management, usage stats.
"""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.security import get_password_hash, verify_password
from app.models.subscription import ApiKey, UsageLog
from app.models.user import User
from app.schemas.subscription import ApiKeyCreate, ApiKeyCreatedResponse, ApiKeyResponse
from app.schemas.user import PasswordChange, UserResponse, UserUpdate
from app.utils.validators import generate_api_key, get_api_key_prefix

logger = logging.getLogger(__name__)
router = APIRouter()

CurrentUser = Annotated[User, Depends(get_current_active_user)]


# ─── Profile ─────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse, summary="Get current user profile")
async def get_me(current_user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse, summary="Update profile")
async def update_me(
    payload: UserUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.avatar_url is not None:
        current_user.avatar_url = payload.avatar_url

    db.add(current_user)
    await db.flush()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete own account",
)
async def delete_me(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    # Soft-delete: deactivate instead of hard delete
    current_user.is_active = False
    current_user.email = f"deleted_{current_user.id}@deleted.invalid"
    db.add(current_user)
    await db.flush()


# ─── Password ─────────────────────────────────────────────────────────────────

@router.put("/me/password", summary="Change password")
async def change_password(
    payload: PasswordChange,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    current_user.hashed_password = get_password_hash(payload.new_password)
    db.add(current_user)
    await db.flush()
    return {"message": "Password updated successfully"}


# ─── API Keys ─────────────────────────────────────────────────────────────────

@router.get(
    "/me/api-keys",
    response_model=list[ApiKeyResponse],
    summary="List API keys for the current user",
)
async def list_api_keys(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[ApiKeyResponse]:
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.user_id == current_user.id, ApiKey.is_active == True)  # noqa: E712
        .order_by(ApiKey.created_at.desc())
    )
    keys = result.scalars().all()
    return [ApiKeyResponse.model_validate(k) for k in keys]


@router.post(
    "/me/api-keys",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new API key",
)
async def create_api_key(
    payload: ApiKeyCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ApiKeyCreatedResponse:
    # Require user to belong to at least one workspace
    from app.models.workspace import Membership
    membership = await db.execute(
        select(Membership).where(Membership.user_id == current_user.id).limit(1)
    )
    membership_row = membership.scalar_one_or_none()
    if not membership_row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must belong to a workspace to create an API key",
        )

    raw_key, hashed_key = generate_api_key()
    prefix = get_api_key_prefix(raw_key)

    api_key = ApiKey(
        workspace_id=membership_row.workspace_id,
        user_id=current_user.id,
        name=payload.name,
        key_hash=hashed_key,
        key_prefix=prefix,
        scopes=payload.scopes,
        expires_at=payload.expires_at,
    )
    db.add(api_key)
    await db.flush()
    await db.refresh(api_key)

    response = ApiKeyCreatedResponse(
        **ApiKeyResponse.model_validate(api_key).model_dump(),
        raw_key=raw_key,
    )
    return response


@router.delete(
    "/me/api-keys/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke an API key",
)
async def delete_api_key(
    key_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.id == key_id,
            ApiKey.user_id == current_user.id,
        )
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")

    api_key.is_active = False
    db.add(api_key)
    await db.flush()


# ─── Usage ────────────────────────────────────────────────────────────────────

@router.get("/me/usage", summary="Get current user usage stats")
async def get_my_usage(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(
            func.count(UsageLog.id).label("total_requests"),
            func.sum(UsageLog.tokens_used).label("total_tokens"),
            func.sum(UsageLog.cost_usd).label("total_cost"),
        ).where(UsageLog.user_id == current_user.id)
    )
    row = result.one()
    return {
        "user_id": str(current_user.id),
        "total_requests": row.total_requests or 0,
        "total_tokens_used": int(row.total_tokens or 0),
        "total_cost_usd": round(float(row.total_cost or 0), 6),
    }
