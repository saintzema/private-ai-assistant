"""
Pydantic v2 schemas for documents and document chunks.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.document import DocumentStatus, FileType


# ─── Document Schemas ─────────────────────────────────────────────────────────


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    uploaded_by: Optional[UUID] = None
    name: str
    original_filename: str
    file_type: FileType
    file_size: int  # bytes
    s3_key: str
    s3_url: Optional[str] = None
    status: DocumentStatus
    error_message: Optional[str] = None
    chunk_count: int
    created_at: datetime
    updated_at: datetime


class DocumentUploadResponse(BaseModel):
    """Returned immediately after a file is accepted for upload."""
    document_id: UUID
    name: str
    original_filename: str
    status: DocumentStatus
    message: str = "Document uploaded and queued for processing"


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int
    page: int
    page_size: int


class DocumentStatusResponse(BaseModel):
    document_id: UUID
    status: DocumentStatus
    chunk_count: int
    error_message: Optional[str] = None
    updated_at: datetime


class DocumentDownloadResponse(BaseModel):
    document_id: UUID
    presigned_url: str
    expires_in: int  # seconds


# ─── Chunk Schemas ────────────────────────────────────────────────────────────


class DocumentChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    chunk_index: int
    content: str
    token_count: int
    created_at: datetime


# ─── Embedding / Search ───────────────────────────────────────────────────────


class EmbeddingRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8192)


class EmbeddingResponse(BaseModel):
    text: str
    embedding: list[float]
    model: str
    token_count: int


class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=20)
    workspace_id: UUID


class SemanticSearchResult(BaseModel):
    chunk_id: UUID
    document_id: UUID
    document_name: str
    chunk_index: int
    content: str
    score: float
    token_count: int
