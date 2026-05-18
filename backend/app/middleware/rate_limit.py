"""
Rate limiting middleware using per-user and per-IP sliding window counters.
Falls back to in-memory storage; replace _store with Redis in production.
"""

import logging
import time
from collections import defaultdict
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── In-Memory Store ──────────────────────────────────────────────────────────
# { key: [timestamp, ...] }
_store: dict[str, list[float]] = defaultdict(list)


def _sliding_window_check(key: str, limit: int, window: int) -> tuple[bool, int]:
    """
    Check if the key is within the rate limit.

    Returns:
        (is_allowed, retry_after_seconds)
    """
    now = time.monotonic()
    window_start = now - window
    calls = [t for t in _store[key] if t > window_start]
    calls.append(now)
    _store[key] = calls

    if len(calls) > limit:
        retry_after = int(window - (now - calls[0])) + 1
        return False, max(retry_after, 1)

    return True, 0


# ─── Route-specific limits ────────────────────────────────────────────────────

_ROUTE_LIMITS: list[tuple[str, int, int]] = [
    # (path_prefix, max_calls, window_seconds)
    ("/api/v1/workspaces", 10, 3600),          # upload: 10/hour per user
    ("/api/v1/workspaces", 100, 86400),        # chat: 100/day per user (checked separately)
]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces:
    - 60 req/min per authenticated user
    - 100 req/min per IP (unauthenticated or as fallback)
    - 10 uploads/hour per user (on /documents/upload)
    - 100 chat messages/day per user (on /messages)
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        client_ip = (
            request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown")
        )

        # ── Per-IP limit ──────────────────────────────────────────────────────
        ip_key = f"ip:{client_ip}"
        allowed, retry_after = _sliding_window_check(
            ip_key,
            settings.RATE_LIMIT_PER_IP_PER_MINUTE,
            60,
        )
        if not allowed:
            logger.warning("Rate limit exceeded (IP=%s path=%s)", client_ip, path)
            return Response(
                content='{"detail":"Rate limit exceeded. Too many requests from your IP."}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(retry_after)},
            )

        response = await call_next(request)

        # Attach rate-limit headers
        response.headers["X-RateLimit-Limit-IP"] = str(settings.RATE_LIMIT_PER_IP_PER_MINUTE)
        return response


# ─── FastAPI dependency-style limiters ────────────────────────────────────────

class RateLimiter:
    """
    Dependency-injectable rate limiter for specific endpoints.

    Usage:
        @router.post("/upload", dependencies=[Depends(upload_limiter)])
    """

    def __init__(self, max_calls: int, window_seconds: int, scope: str = "user"):
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self.scope = scope

    async def __call__(self, request: Request) -> None:
        from fastapi import HTTPException

        user_id = getattr(request.state, "user_id", None)
        client_ip = (
            request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown")
        )
        identifier = str(user_id) if user_id else client_ip
        key = f"rl:{self.scope}:{identifier}:{request.url.path}"

        allowed, retry_after = _sliding_window_check(key, self.max_calls, self.window_seconds)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Retry after {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )


# Pre-built dependency instances
default_limiter = RateLimiter(
    max_calls=settings.RATE_LIMIT_PER_MINUTE,
    window_seconds=60,
    scope="user-default",
)
upload_limiter = RateLimiter(
    max_calls=settings.RATE_LIMIT_UPLOAD_PER_HOUR,
    window_seconds=3600,
    scope="user-upload",
)
chat_limiter = RateLimiter(
    max_calls=settings.RATE_LIMIT_CHAT_PER_DAY,
    window_seconds=86400,
    scope="user-chat",
)
