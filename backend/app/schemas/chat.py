"""
Pydantic v2 schemas for chats and messages.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.chat import MessageRole


# ─── Source Citation ──────────────────────────────────────────────────────────


class Source(BaseModel):
    document_id: UUID
    chunk_id: UUID
    document_name: str
    score: float
    excerpt: str


# ─── Message Schemas ──────────────────────────────────────────────────────────


class MessageCreate(BaseModel):
    role: MessageRole = MessageRole.user
    content: str = Field(..., min_length=1, max_length=32_000)


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    chat_id: UUID
    workspace_id: UUID
    role: MessageRole
    content: str
    tokens_used: int
    sources: Optional[list[dict[str, Any]]] = None
    created_at: datetime


# ─── Chat Schemas ─────────────────────────────────────────────────────────────


class ChatCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    model_used: Optional[str] = Field(None, max_length=100)


class ChatUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    is_archived: Optional[bool] = None


class ChatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    user_id: UUID
    title: Optional[str] = None
    model_used: Optional[str] = None
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    messages: list[MessageResponse] = []


class ChatListResponse(BaseModel):
    chats: list[ChatResponse]
    total: int
    page: int
    page_size: int


# ─── Q&A Request / Response ───────────────────────────────────────────────────


class ChatRequest(BaseModel):
    """Payload for sending a new user question inside a chat."""
    message: str = Field(..., min_length=1, max_length=32_000)
    model: Optional[str] = None  # override model for this turn
    stream: bool = True
    top_k_docs: int = Field(default=5, ge=1, le=20)


class StreamChunk(BaseModel):
    """Individual SSE chunk sent during streaming."""
    type: str  # "content" | "sources" | "done" | "error"
    content: Optional[str] = None
    sources: Optional[list[Source]] = None
    message_id: Optional[UUID] = None
    tokens_used: Optional[int] = None
    error: Optional[str] = None
