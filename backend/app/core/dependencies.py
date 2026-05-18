"""
FastAPI dependency injection: auth, workspace membership, rate limiting.
"""

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import verify_token
from app.models.user import User
from app.models.workspace import Membership, MemberRole

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

# ─── Auth Dependencies ────────────────────────────────────────────────────────


async def get_current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)],
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Extract and validate the JWT access token from the Authorization header.
    Returns the authenticated User ORM object.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials:
        raise credentials_exception

    payload = verify_token(credentials.credentials, token_type="access")
    if payload is None:
        raise credentials_exception

    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Ensure the authenticated user is active and verified."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )
    return current_user


async def get_super_admin(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """Ensure the authenticated user is a super-admin."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super-admin access required",
        )
    return current_user


# ─── Workspace Membership Helpers ────────────────────────────────────────────


async def _get_membership(
    workspace_id: UUID,
    user: User,
    db: AsyncSession,
) -> Membership:
    result = await db.execute(
        select(Membership).where(
            Membership.workspace_id == workspace_id,
            Membership.user_id == user.id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this workspace",
        )
    return membership


async def get_workspace_member(
    workspace_id: UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: AsyncSession = Depends(get_db),
) -> tuple[User, Membership]:
    """
    Verify the current user is a member of the given workspace.
    Returns (user, membership) tuple.
    """
    membership = await _get_membership(workspace_id, current_user, db)
    return current_user, membership


async def get_workspace_admin(
    workspace_id: UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: AsyncSession = Depends(get_db),
) -> tuple[User, Membership]:
    """
    Verify the current user is an owner or admin of the given workspace.
    Returns (user, membership) tuple.
    """
    membership = await _get_membership(workspace_id, current_user, db)
    if membership.role not in (MemberRole.owner, MemberRole.admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or owner access required for this operation",
        )
    return current_user, membership


# ─── Rate Limiter Dependency ─────────────────────────────────────────────────


class RateLimiter:
    """
    Simple in-memory rate limiter dependency.
    For production, back this with Redis using a sliding-window algorithm.
    """

    _store: dict[str, list[float]] = {}

    def __init__(self, max_calls: int, window_seconds: int):
        self.max_calls = max_calls
        self.window_seconds = window_seconds

    async def __call__(self, request: Request) -> None:
        import time

        # Identify by user ID if authenticated, else by IP
        user_id = getattr(request.state, "user_id", None)
        key = f"rl:{user_id or request.client.host}:{request.url.path}"

        now = time.monotonic()
        window_start = now - self.window_seconds

        calls = self._store.get(key, [])
        calls = [t for t in calls if t > window_start]
        calls.append(now)
        self._store[key] = calls

        if len(calls) > self.max_calls:
            retry_after = int(self.window_seconds - (now - calls[0]))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded",
                headers={"Retry-After": str(max(retry_after, 1))},
            )


# Pre-built limiter instances
default_rate_limiter = RateLimiter(max_calls=60, window_seconds=60)
upload_rate_limiter = RateLimiter(max_calls=10, window_seconds=3600)
chat_rate_limiter = RateLimiter(max_calls=100, window_seconds=86400)
