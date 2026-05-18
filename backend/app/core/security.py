"""
Security utilities: JWT creation/verification, password hashing, token blacklisting.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Password Hashing ────────────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    """Return bcrypt hash of the plain-text password."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against its bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


# ─── In-Memory Token Blacklist ────────────────────────────────────────────────
# For production, replace with Redis SET with TTL equal to token expiry.

_blacklisted_tokens: set[str] = set()


def blacklist_token(jti: str) -> None:
    """Add a token's JTI to the blacklist."""
    _blacklisted_tokens.add(jti)


def is_token_blacklisted(jti: str) -> bool:
    """Return True if the token has been blacklisted."""
    return jti in _blacklisted_tokens


# ─── JWT Tokens ──────────────────────────────────────────────────────────────

def create_access_token(
    subject: str | UUID,
    jti: Optional[str] = None,
    extra_claims: Optional[dict] = None,
) -> str:
    """
    Create a short-lived JWT access token.

    Args:
        subject: User ID (UUID or str).
        jti: Unique token identifier (for blacklisting). Auto-generated if None.
        extra_claims: Additional claims to embed in the payload.

    Returns:
        Encoded JWT string.
    """
    import secrets

    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload: dict = {
        "sub": str(subject),
        "iat": now,
        "exp": expire,
        "type": "access",
        "jti": jti or secrets.token_hex(16),
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(
    subject: str | UUID,
    jti: Optional[str] = None,
) -> str:
    """
    Create a long-lived JWT refresh token.

    Args:
        subject: User ID (UUID or str).
        jti: Unique token identifier.

    Returns:
        Encoded JWT string.
    """
    import secrets

    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    payload: dict = {
        "sub": str(subject),
        "iat": now,
        "exp": expire,
        "type": "refresh",
        "jti": jti or secrets.token_hex(16),
    }

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_token(token: str, token_type: str = "access") -> Optional[dict]:
    """
    Decode and validate a JWT token.

    Args:
        token: Raw JWT string.
        token_type: Expected token type ("access" | "refresh").

    Returns:
        Decoded payload dict, or None if invalid / blacklisted.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )

        if payload.get("type") != token_type:
            logger.warning("Token type mismatch: expected %s", token_type)
            return None

        jti = payload.get("jti")
        if jti and is_token_blacklisted(jti):
            logger.warning("Blacklisted token used: %s", jti)
            return None

        return payload

    except JWTError as exc:
        logger.debug("JWT verification failed: %s", exc)
        return None
