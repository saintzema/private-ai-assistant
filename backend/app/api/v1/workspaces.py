"""
Workspace management endpoints: CRUD, membership, invitations, stats.
"""

import logging
import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, get_workspace_admin, get_workspace_member
from app.models.chat import Chat, Message
from app.models.document import Document
from app.models.user import User
from app.models.workspace import Membership, MemberRole, PlanType, Workspace
from app.schemas.workspace import (
    InviteMember,
    MembershipResponse,
    UpdateMemberRole,
    WorkspaceCreate,
    WorkspaceListResponse,
    WorkspaceResponse,
    WorkspaceStats,
    WorkspaceUpdate,
)
from app.utils.validators import slugify

logger = logging.getLogger(__name__)
router = APIRouter()

CurrentUser = Annotated[User, Depends(get_current_active_user)]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _plan_limits(plan: PlanType) -> dict:
    limits = {
        PlanType.free: {"max_documents": 50, "max_members": 5, "max_storage_mb": 500},
        PlanType.pro: {"max_documents": 500, "max_members": 25, "max_storage_mb": 5120},
        PlanType.enterprise: {"max_documents": 10000, "max_members": 500, "max_storage_mb": 102400},
    }
    return limits.get(plan, limits[PlanType.free])


async def _get_workspace_or_404(db: AsyncSession, workspace_id: UUID) -> Workspace:
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id, Workspace.is_active == True))  # noqa
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return workspace


# ─── List / Create ────────────────────────────────────────────────────────────

@router.get("", response_model=WorkspaceListResponse, summary="List workspaces the user belongs to")
async def list_workspaces(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> WorkspaceListResponse:
    result = await db.execute(
        select(Workspace)
        .join(Membership, Membership.workspace_id == Workspace.id)
        .where(Membership.user_id == current_user.id, Workspace.is_active == True)  # noqa
        .order_by(Workspace.created_at.desc())
    )
    workspaces = result.scalars().all()
    return WorkspaceListResponse(
        workspaces=[WorkspaceResponse.model_validate(w) for w in workspaces],
        total=len(workspaces),
    )


@router.post(
    "",
    response_model=WorkspaceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new workspace",
)
async def create_workspace(
    payload: WorkspaceCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> WorkspaceResponse:
    # Check slug uniqueness
    existing = await db.execute(select(Workspace).where(Workspace.slug == payload.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Slug '{payload.slug}' is already taken",
        )

    limits = _plan_limits(PlanType.free)
    workspace = Workspace(
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        logo_url=payload.logo_url,
        owner_id=current_user.id,
        plan=PlanType.free,
        **limits,
    )
    db.add(workspace)
    await db.flush()

    # Add creator as owner
    membership = Membership(
        workspace_id=workspace.id,
        user_id=current_user.id,
        role=MemberRole.owner,
    )
    db.add(membership)
    await db.flush()
    await db.refresh(workspace)

    logger.info("Workspace created: %s (%s) by user %s", workspace.name, workspace.id, current_user.id)
    return WorkspaceResponse.model_validate(workspace)


# ─── Single Workspace ─────────────────────────────────────────────────────────

@router.get("/{workspace_id}", response_model=WorkspaceResponse, summary="Get workspace details")
async def get_workspace(
    workspace_id: UUID,
    member: Annotated[tuple, Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
) -> WorkspaceResponse:
    workspace = await _get_workspace_or_404(db, workspace_id)
    return WorkspaceResponse.model_validate(workspace)


@router.put("/{workspace_id}", response_model=WorkspaceResponse, summary="Update workspace")
async def update_workspace(
    workspace_id: UUID,
    payload: WorkspaceUpdate,
    admin: Annotated[tuple, Depends(get_workspace_admin)],
    db: AsyncSession = Depends(get_db),
) -> WorkspaceResponse:
    workspace = await _get_workspace_or_404(db, workspace_id)
    if payload.name is not None:
        workspace.name = payload.name
    if payload.description is not None:
        workspace.description = payload.description
    if payload.logo_url is not None:
        workspace.logo_url = payload.logo_url

    db.add(workspace)
    await db.flush()
    await db.refresh(workspace)
    return WorkspaceResponse.model_validate(workspace)


@router.delete(
    "/{workspace_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete workspace (owner only)",
)
async def delete_workspace(
    workspace_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    workspace = await _get_workspace_or_404(db, workspace_id)
    if workspace.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can delete a workspace")

    workspace.is_active = False
    db.add(workspace)
    await db.flush()


# ─── Members ──────────────────────────────────────────────────────────────────

@router.get(
    "/{workspace_id}/members",
    response_model=list[MembershipResponse],
    summary="List workspace members",
)
async def list_members(
    workspace_id: UUID,
    member: Annotated[tuple, Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
) -> list[MembershipResponse]:
    result = await db.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.workspace_id == workspace_id)
        .order_by(Membership.joined_at.asc())
    )
    rows = result.all()
    members = []
    for m, u in rows:
        resp = MembershipResponse.model_validate(m)
        resp.user_email = u.email
        resp.user_full_name = u.full_name
        resp.user_avatar_url = u.avatar_url
        members.append(resp)
    return members


@router.post(
    "/{workspace_id}/members/invite",
    status_code=status.HTTP_201_CREATED,
    summary="Invite a member by email",
)
async def invite_member(
    workspace_id: UUID,
    payload: InviteMember,
    admin_info: Annotated[tuple, Depends(get_workspace_admin)],
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict:
    current_user, _ = admin_info
    workspace = await _get_workspace_or_404(db, workspace_id)

    # Check member limit
    count_result = await db.execute(
        select(func.count(Membership.id)).where(Membership.workspace_id == workspace_id)
    )
    member_count = count_result.scalar() or 0
    if member_count >= workspace.max_members:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Workspace member limit ({workspace.max_members}) reached",
        )

    # Check if already a member
    user_result = await db.execute(select(User).where(User.email == payload.email.lower()))
    existing_user = user_result.scalar_one_or_none()

    if existing_user:
        existing_membership = await db.execute(
            select(Membership).where(
                Membership.workspace_id == workspace_id,
                Membership.user_id == existing_user.id,
            )
        )
        if existing_membership.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This user is already a member of the workspace",
            )

    invitation_token = secrets.token_urlsafe(32)
    if existing_user:
        membership = Membership(
            workspace_id=workspace_id,
            user_id=existing_user.id,
            role=payload.role,
            invited_by=current_user.id,
            invitation_token=invitation_token,
            invitation_email=payload.email.lower(),
        )
        db.add(membership)
    else:
        # Store pending invitation as a placeholder membership (user_id = None workaround)
        # In production, use a separate invitations table.
        # For now, store as a membership with invitation_email set.
        membership = Membership(
            workspace_id=workspace_id,
            user_id=current_user.id,  # placeholder; replaced on join
            role=payload.role,
            invited_by=current_user.id,
            invitation_token=invitation_token,
            invitation_email=payload.email.lower(),
        )
        db.add(membership)

    await db.flush()

    background_tasks.add_task(
        _send_invitation,
        payload.email,
        workspace.name,
        current_user.full_name,
        invitation_token,
    )

    return {"message": f"Invitation sent to {payload.email}", "token": invitation_token}


@router.put(
    "/{workspace_id}/members/{user_id}/role",
    response_model=MembershipResponse,
    summary="Update a member's role",
)
async def update_member_role(
    workspace_id: UUID,
    user_id: UUID,
    payload: UpdateMemberRole,
    admin_info: Annotated[tuple, Depends(get_workspace_admin)],
    db: AsyncSession = Depends(get_db),
) -> MembershipResponse:
    result = await db.execute(
        select(Membership).where(
            Membership.workspace_id == workspace_id,
            Membership.user_id == user_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    if membership.role == MemberRole.owner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change the role of the workspace owner",
        )

    membership.role = payload.role
    db.add(membership)
    await db.flush()
    await db.refresh(membership)
    return MembershipResponse.model_validate(membership)


@router.delete(
    "/{workspace_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a member from the workspace",
)
async def remove_member(
    workspace_id: UUID,
    user_id: UUID,
    admin_info: Annotated[tuple, Depends(get_workspace_admin)],
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(Membership).where(
            Membership.workspace_id == workspace_id,
            Membership.user_id == user_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    if membership.role == MemberRole.owner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the workspace owner",
        )

    await db.delete(membership)
    await db.flush()


# ─── Stats ────────────────────────────────────────────────────────────────────

@router.get(
    "/{workspace_id}/stats",
    response_model=WorkspaceStats,
    summary="Get workspace statistics",
)
async def get_workspace_stats(
    workspace_id: UUID,
    member: Annotated[tuple, Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
) -> WorkspaceStats:
    workspace = await _get_workspace_or_404(db, workspace_id)

    doc_count = (await db.execute(
        select(func.count(Document.id)).where(Document.workspace_id == workspace_id)
    )).scalar() or 0

    member_count = (await db.execute(
        select(func.count(Membership.id)).where(Membership.workspace_id == workspace_id)
    )).scalar() or 0

    chat_count = (await db.execute(
        select(func.count(Chat.id)).where(Chat.workspace_id == workspace_id)
    )).scalar() or 0

    message_count = (await db.execute(
        select(func.count(Message.id)).where(Message.workspace_id == workspace_id)
    )).scalar() or 0

    storage_bytes = (await db.execute(
        select(func.sum(Document.file_size)).where(Document.workspace_id == workspace_id)
    )).scalar() or 0

    from app.models.subscription import UsageLog
    tokens_used = (await db.execute(
        select(func.sum(UsageLog.tokens_used)).where(UsageLog.workspace_id == workspace_id)
    )).scalar() or 0

    return WorkspaceStats(
        workspace_id=workspace_id,
        total_documents=doc_count,
        total_members=member_count,
        total_chats=chat_count,
        total_messages=message_count,
        storage_used_mb=round(storage_bytes / (1024 * 1024), 2),
        storage_limit_mb=workspace.max_storage_mb,
        document_limit=workspace.max_documents,
        member_limit=workspace.max_members,
        tokens_used_this_period=tokens_used,
        plan=workspace.plan,
    )


# ─── Join via Invitation ──────────────────────────────────────────────────────

@router.post("/join/{token}", summary="Join a workspace via invitation token")
async def join_workspace(
    token: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Membership).where(Membership.invitation_token == token)
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired invitation")

    # Reassign membership to the actual joining user
    membership.user_id = current_user.id
    membership.invitation_token = None
    db.add(membership)
    await db.flush()

    workspace = await _get_workspace_or_404(db, membership.workspace_id)
    return {"message": f"You have joined workspace '{workspace.name}'", "workspace_id": str(workspace.id)}


# ─── Background task ──────────────────────────────────────────────────────────

async def _send_invitation(email: str, workspace_name: str, inviter_name: str, token: str):
    try:
        from app.services.email_service import email_service
        await email_service.send_invitation_email(email, workspace_name, inviter_name, token)
    except Exception as exc:
        logger.warning("Failed to send invitation email to %s: %s", email, exc)
