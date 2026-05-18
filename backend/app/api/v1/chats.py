"""
Chat endpoints with SSE streaming for RAG-powered AI responses.
"""
import json
import logging
import uuid
from typing import Annotated, AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, get_workspace_member
from app.models.chat import Chat, Message, MessageRole
from app.models.user import User
from app.models.workspace import Membership
from app.schemas.chat import (
    ChatCreate,
    ChatRequest,
    ChatResponse,
    ChatUpdate,
    MessageResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── List Chats ────────────────────────────────────────────────────────────────

@router.get(
    "/{workspace_id}/chats",
    response_model=list[ChatResponse],
    summary="List all chats in workspace",
)
async def list_chats(
    workspace_id: UUID,
    member: Annotated[tuple[User, Membership], Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 50,
):
    user, _ = member
    result = await db.execute(
        select(Chat)
        .where(Chat.workspace_id == workspace_id, Chat.user_id == user.id, Chat.is_archived == False)  # noqa: E712
        .order_by(desc(Chat.updated_at))
        .offset(skip)
        .limit(limit)
    )
    chats = result.scalars().all()
    return [ChatResponse.model_validate(c) for c in chats]


# ── Create Chat ───────────────────────────────────────────────────────────────

@router.post(
    "/{workspace_id}/chats",
    response_model=ChatResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new chat session",
)
async def create_chat(
    workspace_id: UUID,
    payload: ChatCreate,
    member: Annotated[tuple[User, Membership], Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
):
    user, _ = member
    chat = Chat(
        workspace_id=workspace_id,
        user_id=user.id,
        title=payload.title or "New Chat",
    )
    db.add(chat)
    await db.flush()
    await db.refresh(chat)
    return ChatResponse.model_validate(chat)


# ── Get Chat ──────────────────────────────────────────────────────────────────

@router.get(
    "/{workspace_id}/chats/{chat_id}",
    response_model=ChatResponse,
    summary="Get chat with messages",
)
async def get_chat(
    workspace_id: UUID,
    chat_id: UUID,
    member: Annotated[tuple[User, Membership], Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
):
    user, _ = member
    result = await db.execute(
        select(Chat)
        .where(Chat.id == chat_id, Chat.workspace_id == workspace_id, Chat.user_id == user.id)
        .options(selectinload(Chat.messages))
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    return ChatResponse.model_validate(chat)


# ── Update Chat Title ─────────────────────────────────────────────────────────

@router.put(
    "/{workspace_id}/chats/{chat_id}",
    response_model=ChatResponse,
    summary="Update chat title",
)
async def update_chat(
    workspace_id: UUID,
    chat_id: UUID,
    payload: ChatUpdate,
    member: Annotated[tuple[User, Membership], Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
):
    user, _ = member
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.workspace_id == workspace_id, Chat.user_id == user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

    if payload.title is not None:
        chat.title = payload.title
    await db.flush()
    await db.refresh(chat)
    return ChatResponse.model_validate(chat)


# ── Delete Chat ───────────────────────────────────────────────────────────────

@router.delete(
    "/{workspace_id}/chats/{chat_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a chat",
)
async def delete_chat(
    workspace_id: UUID,
    chat_id: UUID,
    member: Annotated[tuple[User, Membership], Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
):
    user, _ = member
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.workspace_id == workspace_id, Chat.user_id == user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    await db.delete(chat)
    return None


# ── Send Message (SSE Streaming) ──────────────────────────────────────────────

@router.post(
    "/{workspace_id}/chats/{chat_id}/messages",
    summary="Send a message and receive a streaming AI response (SSE)",
    response_class=StreamingResponse,
)
async def send_message(
    workspace_id: UUID,
    chat_id: UUID,
    payload: ChatRequest,
    member: Annotated[tuple[User, Membership], Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
):
    user, _ = member

    # Verify chat ownership
    result = await db.execute(
        select(Chat)
        .where(Chat.id == chat_id, Chat.workspace_id == workspace_id, Chat.user_id == user.id)
        .options(selectinload(Chat.messages))
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

    # Persist user message
    user_msg = Message(
        id=uuid.uuid4(),
        chat_id=chat_id,
        workspace_id=workspace_id,
        role=MessageRole.user,
        content=payload.message,
    )
    db.add(user_msg)
    await db.flush()

    # Auto-title the chat on first message
    if len(chat.messages) <= 1:
        chat.title = payload.message[:80] + ("..." if len(payload.message) > 80 else "")
        await db.flush()

    # Build chat history for RAG
    history = [
        {"role": m.role.value, "content": m.content}
        for m in chat.messages[:-1]  # exclude the message we just added
    ]

    async def event_stream() -> AsyncGenerator[str, None]:
        """Server-Sent Events stream with RAG-generated answer."""
        full_response = ""
        sources: list[dict] = []

        try:
            from app.services.ai.rag import rag_service

            yield f"data: {json.dumps({'type': 'start'})}\n\n"

            pipeline = await rag_service.query(
                query=payload.message,
                workspace_id=workspace_id,
                db=db,
                chat_history=history,
                top_k=getattr(payload, "top_k_docs", 5),
                model=payload.model,
                stream=payload.stream,
            )

            async for chunk in pipeline:
                if chunk.get("type") == "content":
                    full_response += chunk.get("content", "")
                    yield f"data: {json.dumps({'type': 'token', 'content': chunk.get('content', '')})}\n\n"
                elif chunk.get("type") == "sources":
                    sources = chunk.get("sources", [])
                    yield f"data: {json.dumps(chunk)}\n\n"
                elif chunk.get("type") == "done":
                    yield f"data: {json.dumps(chunk)}\n\n"

            # Persist assistant message
            assistant_msg = Message(
                id=uuid.uuid4(),
                chat_id=chat_id,
                workspace_id=workspace_id,
                role=MessageRole.assistant,
                content=full_response,
                sources=sources,
            )
            db.add(assistant_msg)
            await db.commit()

            yield f"data: {json.dumps({'type': 'done', 'message_id': str(assistant_msg.id)})}\n\n"

        except Exception as exc:
            logger.exception("Streaming error for chat %s: %s", chat_id, exc)
            await db.rollback()
            yield f"data: {json.dumps({'type': 'error', 'detail': 'AI service error. Please try again.'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── Get Messages ──────────────────────────────────────────────────────────────

@router.get(
    "/{workspace_id}/chats/{chat_id}/messages",
    response_model=list[MessageResponse],
    summary="Get all messages in a chat",
)
async def get_messages(
    workspace_id: UUID,
    chat_id: UUID,
    member: Annotated[tuple[User, Membership], Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
):
    user, _ = member
    result = await db.execute(
        select(Chat).where(
            Chat.id == chat_id, Chat.workspace_id == workspace_id, Chat.user_id == user.id
        )
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

    msg_result = await db.execute(
        select(Message)
        .where(Message.chat_id == chat_id)
        .order_by(Message.created_at)
    )
    messages = msg_result.scalars().all()
    return [MessageResponse.model_validate(m) for m in messages]
