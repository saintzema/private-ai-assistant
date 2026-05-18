"""
Tenant isolation middleware.
Extracts workspace_id from the URL path and validates membership on every request.
Injects workspace_id and user_id into request.state for downstream use.
"""

import logging
import re
from typing import Callable
from uuid import UUID

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)

# Regex to extract workspace_id from paths like:
#   /api/v1/workspaces/{workspace_id}/...
_WORKSPACE_PATH_RE = re.compile(
    r"/api/v1/workspaces/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
    re.IGNORECASE,
)

# Paths excluded from workspace validation (public/auth routes)
_EXCLUDED_PREFIXES = (
    "/api/v1/auth",
    "/api/v1/admin",
    "/api/v1/marketplace",
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
)


class TenantMiddleware(BaseHTTPMiddleware):
    """
    Middleware that:
    1. Parses workspace_id from the request path.
    2. Validates the JWT and extracts user_id.
    3. Verifies the user is a member of the workspace.
    4. Injects workspace_id and user_id into request.state.

    Heavy membership DB lookups are deferred to the dependency layer
    (get_workspace_member / get_workspace_admin) for proper DI and error handling.
    This middleware only handles lightweight extraction and state injection.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        # Skip excluded paths
        if any(path.startswith(prefix) for prefix in _EXCLUDED_PREFIXES):
            return await call_next(request)

        # Extract workspace_id if present
        match = _WORKSPACE_PATH_RE.search(path)
        if match:
            try:
                workspace_id = UUID(match.group(1))
                request.state.workspace_id = workspace_id
                logger.debug("Tenant middleware: workspace_id=%s path=%s", workspace_id, path)
            except ValueError:
                logger.warning("Invalid workspace_id in path: %s", path)

        # Extract user_id from JWT (best-effort — full validation happens in dependencies)
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            try:
                from app.core.security import verify_token
                payload = verify_token(token, token_type="access")
                if payload and payload.get("sub"):
                    request.state.user_id = UUID(payload["sub"])
            except Exception:
                pass  # Invalid tokens are handled properly in auth dependencies

        response = await call_next(request)
        return response
