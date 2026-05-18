"""Internal embedding and search endpoints (for debugging and admin use)."""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, get_super_admin
from app.models.document import Document, DocumentChunk, DocumentStatus
from app.models.user import User
from app.models.workspace import Membership
from app.services.ai.embeddings import embedding_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/embeddings", tags=["embeddings"])


# ─── Request / Response schemas ───────────────────────────────────────────────


class GenerateEmbeddingRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=32000, description="Text to embed")


class GenerateEmbeddingResponse(BaseModel):
    text_length: int
    token_count: int
    embedding_dimension: int
    embedding: list[float]
    model: str


class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    workspace_id: UUID
    top_k: int = Field(default=5, ge=1, le=50)
    score_threshold: Optional[float] = Field(
        default=None, ge=0.0, le=1.0,
        description="Minimum cosine similarity score (0-1). If None, returns top_k regardless.",
    )


class SearchResult(BaseModel):
    chunk_id: str
    document_id: str
    document_name: str
    content: str
    score: float
    chunk_index: int


class SemanticSearchResponse(BaseModel):
    query: str
    workspace_id: str
    results: list[SearchResult]
    total_results: int


class ReindexResponse(BaseModel):
    workspace_id: str
    documents_queued: int
    message: str


class EmbeddingStatsResponse(BaseModel):
    workspace_id: str
    total_documents: int
    total_chunks: int
    indexed_chunks: int
    missing_chunks: int
    indexing_percentage: float


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/generate", response_model=GenerateEmbeddingResponse)
async def generate_embedding(
    request: GenerateEmbeddingRequest,
    _admin: User = Depends(get_super_admin),
) -> GenerateEmbeddingResponse:
    """
    Generate an embedding vector for arbitrary text.
    Admin-only — intended for debugging and validation.
    """
    token_count = embedding_service.count_tokens(request.text)

    try:
        embedding = await embedding_service.generate_embedding(request.text)
    except Exception as exc:
        logger.error("Embedding generation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Embedding generation failed: {exc}",
        )

    return GenerateEmbeddingResponse(
        text_length=len(request.text),
        token_count=token_count,
        embedding_dimension=len(embedding),
        embedding=embedding,
        model=embedding_service.model_name,
    )


@router.post("/search", response_model=SemanticSearchResponse)
async def semantic_search(
    request: SemanticSearchRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> SemanticSearchResponse:
    """
    Perform semantic search across all indexed chunks in a workspace.

    Returns chunks ranked by cosine similarity to the query embedding.
    The caller must be a member of the workspace (or superuser).
    """
    # Verify access: user must be a member OR superuser
    if not current_user.is_superuser:
        mem_result = await db.execute(
            select(Membership).where(
                Membership.workspace_id == request.workspace_id,
                Membership.user_id == current_user.id,
            )
        )
        if not mem_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this workspace",
            )

    # Generate query embedding
    try:
        query_embedding = await embedding_service.generate_embedding(request.query)
    except Exception as exc:
        logger.error("Query embedding failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate query embedding: {exc}",
        )

    # pgvector cosine similarity search via raw SQLAlchemy text expression
    # 1 - (embedding <=> query_vector) gives cosine similarity
    from sqlalchemy import text

    embedding_literal = "[" + ",".join(str(v) for v in query_embedding) + "]"

    similarity_expr = text(
        f"1 - (dc.embedding <=> '{embedding_literal}'::vector) AS score"
    )

    raw_sql = text(
        f"""
        SELECT
            dc.id            AS chunk_id,
            dc.document_id,
            dc.chunk_index,
            dc.content,
            d.name           AS document_name,
            1 - (dc.embedding <=> :embedding ::vector) AS score
        FROM document_chunks dc
        JOIN documents d ON d.id = dc.document_id
        WHERE dc.workspace_id = :workspace_id
          AND dc.embedding IS NOT NULL
        ORDER BY dc.embedding <=> :embedding ::vector
        LIMIT :limit
        """
    )

    try:
        result = await db.execute(
            raw_sql,
            {
                "embedding": embedding_literal,
                "workspace_id": str(request.workspace_id),
                "limit": request.top_k,
            },
        )
        rows = result.fetchall()
    except Exception as exc:
        logger.error("Vector search query failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search query failed: {exc}",
        )

    search_results: list[SearchResult] = []
    for row in rows:
        score = float(row.score) if row.score is not None else 0.0
        if request.score_threshold is not None and score < request.score_threshold:
            continue
        search_results.append(
            SearchResult(
                chunk_id=str(row.chunk_id),
                document_id=str(row.document_id),
                document_name=row.document_name,
                content=row.content,
                score=round(score, 6),
                chunk_index=row.chunk_index,
            )
        )

    return SemanticSearchResponse(
        query=request.query,
        workspace_id=str(request.workspace_id),
        results=search_results,
        total_results=len(search_results),
    )


@router.post("/reindex/{workspace_id}", response_model=ReindexResponse)
async def reindex_workspace(
    workspace_id: UUID,
    _admin: User = Depends(get_super_admin),
    db: AsyncSession = Depends(get_db),
) -> ReindexResponse:
    """
    Queue background re-embedding of all document chunks in a workspace.
    Admin-only. Marks all ready documents as pending so Celery picks them up.
    """
    # Verify workspace exists
    from app.models.workspace import Workspace

    ws_result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id)
    )
    if not ws_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    # Count documents to reindex
    doc_count_result = await db.execute(
        select(func.count()).where(
            Document.workspace_id == workspace_id,
            Document.status == DocumentStatus.ready,
        )
    )
    doc_count = doc_count_result.scalar_one()

    if doc_count == 0:
        return ReindexResponse(
            workspace_id=str(workspace_id),
            documents_queued=0,
            message="No ready documents to reindex in this workspace",
        )

    # Reset all chunks' embeddings to NULL so the processor regenerates them
    await db.execute(
        update(DocumentChunk)
        .where(DocumentChunk.workspace_id == workspace_id)
        .values(embedding=None)
    )

    # Mark ready documents as pending so Celery reprocesses them
    result = await db.execute(
        select(Document).where(
            Document.workspace_id == workspace_id,
            Document.status == DocumentStatus.ready,
        )
    )
    documents = result.scalars().all()

    for doc in documents:
        doc.status = DocumentStatus.pending
        doc.chunk_count = 0

    await db.commit()

    # Dispatch Celery tasks for each document
    try:
        from celery_app import celery_app

        for doc in documents:
            celery_app.send_task(
                "tasks.process_document",
                kwargs={"document_id": str(doc.id)},
                queue="documents",
            )
        logger.info(
            "Queued %d documents for reindex in workspace %s", doc_count, workspace_id
        )
    except Exception as exc:
        logger.error("Failed to queue Celery tasks for reindex: %s", exc)
        # Don't fail the request — documents are already marked pending
        return ReindexResponse(
            workspace_id=str(workspace_id),
            documents_queued=doc_count,
            message=(
                f"Marked {doc_count} documents for reindexing. "
                "Note: Celery task dispatch failed — tasks will be picked up on next worker poll."
            ),
        )

    return ReindexResponse(
        workspace_id=str(workspace_id),
        documents_queued=doc_count,
        message=f"Successfully queued {doc_count} documents for re-embedding",
    )


@router.get("/stats/{workspace_id}", response_model=EmbeddingStatsResponse)
async def get_embedding_stats(
    workspace_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> EmbeddingStatsResponse:
    """
    Return embedding coverage statistics for a workspace.
    Shows total chunks, indexed chunks, and missing embeddings.
    """
    # Verify access
    if not current_user.is_superuser:
        mem_result = await db.execute(
            select(Membership).where(
                Membership.workspace_id == workspace_id,
                Membership.user_id == current_user.id,
            )
        )
        if not mem_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this workspace",
            )

    # Document count
    doc_result = await db.execute(
        select(func.count()).where(Document.workspace_id == workspace_id)
    )
    total_documents = doc_result.scalar_one()

    # Total chunks
    total_chunks_result = await db.execute(
        select(func.count()).where(DocumentChunk.workspace_id == workspace_id)
    )
    total_chunks = total_chunks_result.scalar_one()

    # Indexed chunks (embedding IS NOT NULL)
    indexed_result = await db.execute(
        select(func.count()).where(
            DocumentChunk.workspace_id == workspace_id,
            DocumentChunk.embedding.is_not(None),
        )
    )
    indexed_chunks = indexed_result.scalar_one()

    missing_chunks = total_chunks - indexed_chunks
    indexing_pct = (indexed_chunks / total_chunks * 100.0) if total_chunks > 0 else 0.0

    return EmbeddingStatsResponse(
        workspace_id=str(workspace_id),
        total_documents=total_documents,
        total_chunks=total_chunks,
        indexed_chunks=indexed_chunks,
        missing_chunks=missing_chunks,
        indexing_percentage=round(indexing_pct, 2),
    )
