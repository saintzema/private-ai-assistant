"""
Authentication endpoints: register, login, refresh, logout, verify email,
forgot/reset password.
"""
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    blacklist_token,
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
    verify_token,
)
from app.models.user import User
from app.schemas.user import (
    EmailVerification,
    PasswordReset,
    PasswordResetConfirm,
    RegisterResponse,
    Token,
    TokenRefresh,
    UserCreate,
    UserLogin,
    UserResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helper ────────────────────────────────────────────────────────────────────

async def _get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


# ── Register ──────────────────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register(
    payload: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    existing = await _get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    verification_token = secrets.token_urlsafe(32)

    user = User(
        email=payload.email.lower(),
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        email_verification_token=verification_token,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    background_tasks.add_task(_send_verification_email, user.email, user.full_name, verification_token)

    logger.info("New user registered: %s", user.email)
    return RegisterResponse(
        message="Registration successful. Please check your email to verify your account.",
        user=UserResponse.model_validate(user),
    )


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=Token,
    summary="Login and receive JWT tokens",
)
async def login(
    payload: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_by_email(db, payload.email)

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    user.last_login = datetime.now(timezone.utc)
    await db.flush()

    from app.core.config import settings
    access_token = create_access_token(subject=str(user.id))
    refresh_token = create_refresh_token(subject=str(user.id))

    logger.info("User logged in: %s", user.email)
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── Refresh ───────────────────────────────────────────────────────────────────

@router.post(
    "/refresh",
    response_model=Token,
    summary="Refresh access token using refresh token",
)
async def refresh_token(
    payload: TokenRefresh,
    db: AsyncSession = Depends(get_db),
):
    token_data = verify_token(payload.refresh_token, token_type="refresh")
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    user_id = token_data.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
        )

    # Blacklist the old refresh token
    if jti := token_data.get("jti"):
        blacklist_token(jti)

    access_token = create_access_token(subject=str(user.id))
    new_refresh_token = create_refresh_token(subject=str(user.id))

    from app.core.config import settings as cfg
    return Token(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=cfg.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Logout (invalidate current token)",
)
async def logout(
    payload: TokenRefresh,
):
    token_data = verify_token(payload.refresh_token, token_type="refresh")
    if token_data and (jti := token_data.get("jti")):
        blacklist_token(jti)
    return None


# ── Verify Email ──────────────────────────────────────────────────────────────

@router.post(
    "/verify-email",
    summary="Verify email address with token",
)
async def verify_email(
    payload: EmailVerification,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.email_verification_token == payload.token)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token.",
        )

    user.is_verified = True
    user.email_verification_token = None
    await db.flush()

    return {"message": "Email verified successfully. You can now log in."}


# ── Forgot Password ───────────────────────────────────────────────────────────

@router.post(
    "/forgot-password",
    summary="Request a password reset email",
)
async def forgot_password(
    payload: PasswordReset,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_by_email(db, payload.email)

    # Always return success to prevent email enumeration
    if user and user.is_active:
        reset_token = secrets.token_urlsafe(32)
        user.password_reset_token = reset_token
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.flush()
        background_tasks.add_task(_send_reset_email, user.email, user.full_name, reset_token)

    return {"message": "If an account exists for that email, a reset link has been sent."}


# ── Reset Password ────────────────────────────────────────────────────────────

@router.post(
    "/reset-password",
    summary="Reset password using reset token",
)
async def reset_password(
    payload: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.password_reset_token == payload.token)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    if user.password_reset_expires and user.password_reset_expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired. Please request a new one.",
        )

    user.hashed_password = get_password_hash(payload.new_password)  # type: ignore[arg-type]
    user.password_reset_token = None
    user.password_reset_expires = None
    await db.flush()

    return {"message": "Password reset successfully. You can now log in."}


# ── Background tasks ──────────────────────────────────────────────────────────

async def _send_verification_email(email: str, name: str, token: str):
    from app.core.config import settings
    try:
        from app.services.email_service import EmailService
        await EmailService().send_verification_email(email, token, name)
    except Exception as e:
        logger.warning("Failed to send verification email to %s: %s", email, e)


async def _send_reset_email(email: str, name: str, token: str):
    try:
        from app.services.email_service import EmailService
        await EmailService().send_password_reset_email(email, token, name)
    except Exception as e:
        logger.warning("Failed to send password reset email to %s: %s", email, e)
